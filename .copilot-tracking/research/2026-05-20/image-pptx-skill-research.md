<!-- markdownlint-disable-file -->
# Research: 画像生成パス追加とストーリー精緻化

## スコープ

`copilot-sdk-agent` リポジトリに以下を追加する：

1. Markdownでスライドストーリーを **精緻に**（ポイント箇条書きだけでなく段落本文も）記載
2. Azure Foundry にデプロイされた **gpt-image-2** を使ったスライド画像生成
3. 生成画像を Web 画面で **確認 → テキスト更新 or 直接編集 → 再生成** のループ
4. 確認後に画像を入力として **PPTX ネイティブ要素**（編集可能なテキスト・図形）として PPTX 化
5. 既存の **Markdown → PPTX 直接生成パス** はモード切替で保持

参考: 取得済み外部スキル `pptx-from-image`（`C:\Users\akhayash\AppData\Local\Temp\pptx-from-image-ref\SKILL.md`）。

## 現状のアーキテクチャ要約

### ドメイン (`src/domain/entities/slide-work.ts`)

* `SlideItem`: `id`, `number`, `title`, `keyMessage`, `layout`, `bullets`, `notes`, `icon`, `code`, `accent`
* `DesignBrief`: presentation-wide art direction
* `SlideWork.phase`: `'empty' | 'planning' | 'story' | 'generating' | 'ready'`

### Copilot SDK 統合 (`src/app/api/chat/route.ts`)

* `skillDirectories` に絶対パスで `skills/create-slide-story` と `skills/generate-pptx` を渡す
* カスタムツール: `set_scenario`, `update_slide`, （optional）`web_search`
* SSE で `scenario` / `slide_update` イベントを panel へ流す

### PPTX 生成 (`src/app/api/skills/pptx/route.ts`)

* AI が ```javascript ブロックで `pptxgenjs` コードを返す
* サーバー側で `new Function()` で実行し、`pres` 等の定数注入
* バイナリ返却 → `slide-panel.tsx` がブラウザでダウンロード

### モデル設定 (`src/infrastructure/copilot/client.ts`)

* `MODEL_PROVIDER=azure` + `AZURE_OPENAI_ENDPOINT` で Azure BYOM 対応済み
* `DefaultAzureCredential` で bearer token 取得実装あり

### スキル
* `skills/create-slide-story/SKILL.md` — McKinsey式ストーリー + `set_scenario` ツール
* `skills/generate-pptx/SKILL.md` — pptxgenjs コード出力ガイドライン

## 参考スキル要点（pptx-from-image）

* **PPTX は 1 枚画像貼り付けにしない**、編集可能要素として再構築
* 採用判定は構造OK + diff_pixel_ratio ≤ 0.15 + 目視
* 旧 PoC で外部 LLM Vision は dense slide では不安定 → 既定から外した
* layout.json リファレンス: `textbox` / `auto_shape` / `line` / `picture` / `table` / `chart`
* z-order convention: 1=背景帯, 2=カード, 3=アイコン/写真, 4=テキスト

→ 本リポに直接移植せず、**哲学のみ採用**（生成画像を背景貼り付けせず、画像をデザイン参考として pptxgenjs ネイティブ要素を生成）。

## 設計方針

### ストーリー精緻化（PD01=A）

`SlideItem` に **`bodyMarkdown: string | null`** を追加：

* `bullets` は短い箇条書き、`bodyMarkdown` は段落・小見出し含む詳細本文
* `set_scenario` / `update_slide` ツールの parameters schema に追加（optional）
* `slide-panel.tsx` で markdown レンダー（既存の `react-markdown` を流用）
* スキル `create-slide-story` の SKILL.md を更新し、bodyMarkdown 記載ガイドラインを追加

### 画像生成（gpt-image-2 on Azure Foundry）

新規環境変数:

```env
AZURE_IMAGE_ENDPOINT=https://<foundry>.cognitiveservices.azure.com
AZURE_IMAGE_DEPLOYMENT=gpt-image-2
AZURE_IMAGE_API_VERSION=2025-04-01-preview
```

認証は既存パターンに合わせ `DefaultAzureCredential` で bearer token。API は Azure OpenAI 互換の `/openai/deployments/{deployment}/images/generations?api-version=...`。

新規ファイル:

* `src/infrastructure/image/azure-image-client.ts` — 画像生成クライアント（base64 PNG 返却）
* `src/app/api/skills/image/route.ts` — POST: `{ slideNumber, prompt, size, n }` → 画像 URL/base64 返却。画像は in-memory cache or session storage で保持
* `src/infrastructure/tools/image-tool.ts` — `generate_slide_image` ツール（個別1枚）と `generate_all_images` ツール（バッチ）

`SlideItem` 拡張:

* `imageUrl: string | null` — 生成画像の URL（data URL or blob URL）
* `imagePrompt: string | null` — 生成に使ったプロンプト（再生成用）

`SlideWork` 拡張:

* `phase` に `'imagining'`（画像生成中）を追加
* 生成モード: `generationMode: 'code' | 'image-then-pptx'`（UI 切替）

### 画像確認 → PPTX 化 (PD02 解釈)

ユーザー意図: 生成画像は **デザインのプレビュー/参考**。PPTX 化時は画像をそのまま貼らず、AI が画像 + ストーリーを参考に **pptxgenjs ネイティブ要素**として再構築する。

実装:

* 既存の `generate-pptx` スキルに「image-then-pptx モード時の追加プロンプト」セクションを追記、または新規スキル `skills/pptx-from-image/SKILL.md` を追加
* 新規スキルが受け取る入力: 各スライドの `imageUrl`, `bodyMarkdown`, `bullets`, `keyMessage`, `layout`
* 出力は既存と同じ ```javascript pptxgenjs コードブロック
* 注: 現在の SDK では multimodal 入力（画像渡し）が必要。`@github/copilot-sdk` の対応状況を実装時に確認し、未対応なら **画像 URL のテキスト記述 + bodyMarkdown のみで再構築**（fallback）

### UI 拡張 (PD03=C)

`slide-panel.tsx`:

* ヘッダーに **モードトグル**（コード生成 / 画像経由）
* image-then-pptx モード時：
  * 「全スライドの画像生成」ボタン（バッチ）
  * 各スライドカードに画像サムネ + 「再生成」ボタン
  * 画像クリックで拡大プレビュー
  * `bodyMarkdown` を編集可能（textarea or inline markdown editor）
  * 編集後「この内容で画像を再生成」ボタン
* 全画像揃ったら「PPTX を生成」ボタンが有効化

新規コンポーネント:

* `src/app/components/slides/slide-image-card.tsx`
* `src/app/components/slides/slide-body-editor.tsx`
* `src/app/components/slides/mode-toggle.tsx`

### モード切替 (PD04=A)

* `generationMode` を `SlideWork` state に保持
* `chat-container.tsx` から API に `generationMode` を送信
* `route.ts` の system message とスキル選択（`skillDirectories`）をモードに応じて切替

## 環境変数まとめ

| 変数 | 用途 |
|---|---|
| `AZURE_IMAGE_ENDPOINT` | Azure Foundry endpoint |
| `AZURE_IMAGE_DEPLOYMENT` | `gpt-image-2` deployment name |
| `AZURE_IMAGE_API_VERSION` | API version (default `2025-04-01-preview`) |
| `IMAGE_AUTH_MODE` | `entra` (default, `DefaultAzureCredential`) / `key` (api-key 直渡し) |
| `AZURE_IMAGE_API_KEY` | `IMAGE_AUTH_MODE=key` の時の API key |

## リスク・制約

| 項目 | リスク | 対策 |
|---|---|---|
| gpt-image-2 のレイテンシ | 数秒〜十数秒/枚 | SSE で進捗送出、UI で枚数進捗表示 |
| 大きな base64 画像 | SSE で送ると重い | 画像は別 endpoint で `/api/skills/image/:id` GET 提供、SSE では URL のみ送る |
| in-memory cache の揮発 | サーバー再起動で消失 | 当面 in-memory で OK（ローカル/Container App single instance）。スケール時は Blob Storage 検討（後続 work item） |
| SDK の multimodal 対応 | 不明確 | 実装時に確認、未対応なら text-only fallback |
| Container Apps での Entra 認証 | managed identity 必要 | infra/main.bicep の更新で対応 |

## 参考リンク

* Azure OpenAI Image generation API: <https://learn.microsoft.com/azure/ai-services/openai/reference#image-generation>
* 取得済み参考 SKILL: `C:\Users\akhayash\AppData\Local\Temp\pptx-from-image-ref\SKILL.md`
