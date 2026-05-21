# AGENTS.md

## Overview

Copilot SDK エージェント — Next.js フルスタックアプリ。チャットUIでAIと対話しながら PowerPoint を生成するデモ。
2ペインワークスペース（チャット + シナリオパネル）で、AIがスライド構成をツール経由で直接パネルに送り、確認後にPPTXを生成する。

- **`src/domain/`** — ドメイン層。エンティティ型定義とポート（インターフェース）。フレームワーク非依存。
- **`src/application/`** — アプリケーション層。ユースケースとスライドパーサー。
- **`src/infrastructure/`** — インフラ層。Copilot SDK クライアント、カスタムツール、pptxgenjs アダプター、画像生成、LibreOffice レンダラー。
- **`src/app/`** — プレゼンテーション層。Next.js App Router（UI + API Routes）。
- **`skills/`** — SDK スキルディレクトリ（SKILL.md 形式）。

## Key Files

| File | Purpose |
|------|---------|
| `src/app/page.tsx` | メインページ |
| `src/app/api/chat/route.ts` | POST `/api/chat` — SSE ストリーミングチャット（ツール呼び出し含む） |
| `src/app/api/skills/pptx/route.ts` | POST `/api/skills/pptx` — PPTX コード実行 & ダウンロード（code / image-then-pptx 両モード） |
| `src/app/api/skills/pptx/quality/[jobId]/route.ts` | GET — 非同期品質ゲート結果取得 |
| `src/app/api/skills/image/route.ts` | POST `/api/skills/image` — 1 枚画像生成（gpt-image-2） |
| `src/app/api/skills/image/[id]/route.ts` | GET — 生成済み画像バイナリ取得 |
| `src/app/api/health/route.ts` | GET `/api/health` — ヘルスチェック |
| `src/domain/entities/message.ts` | Message, Attachment 型定義 |
| `src/domain/entities/slide-work.ts` | SlideWork, SlideItem, SlideLayout 型定義（`bodyMarkdown` / `imageStatus` 追加） |
| `src/domain/entities/slide-layout.ts` | SlideLayout / Bbox / Textbox / AutoShape / Line / Picture zod スキーマ |
| `src/domain/entities/presentation.ts` | Slide, Presentation 型定義 |
| `src/application/chat-use-case.ts` | チャット会話ユースケース |
| `src/application/slide-parser.ts` | マークダウン → SlideItem[] パーサー（フォールバック用） |
| `src/application/image-prompt-builder.ts` | シナリオ + DesignBrief から画像生成 prompt 構築 |
| `src/application/layout-to-pptx.ts` | bbox レイアウトを pptxgenjs スライドに適用（picture/auto_shape/line/textbox） |
| `src/infrastructure/copilot/client.ts` | CopilotClient シングルトン |
| `src/infrastructure/tools/scenario-tool.ts` | `set_scenario` / `update_slide` ツール定義 |
| `src/infrastructure/tools/image-tool.ts` | `generate_slide_image` / `generate_all_images` ツール |
| `src/infrastructure/image/azure-image-client.ts` | Azure Foundry gpt-image-2 ラッパー（Entra ID / API key） |
| `src/infrastructure/image/image-cache.ts` | インメモリ画像キャッシュ（TTL 1h） |
| `src/infrastructure/image/bbox-extractor.ts` | Copilot SDK Vision で画像 → SlideLayout JSON 抽出 |
| `src/infrastructure/image/image-comparator.ts` | pixelmatch + pHash で原画像 vs LibreOffice レンダ比較 |
| `src/infrastructure/render/libreoffice-renderer.ts` | soffice + pdftoppm で PPTX → PNG 化（品質ゲート用） |
| `src/infrastructure/skills/pptxgen-adapter.ts` | pptxgenjs による PPTX 生成 |
| `skills/create-slide-story/SKILL.md` | スライドストーリー作成スキル（McKinsey式 + `bodyMarkdown`） |
| `skills/generate-pptx/SKILL.md` | PptxGenJS コード生成スキル（code モード） |
| `skills/pptx-from-image/SKILL.md` | 外部スキル取り込み — スライド画像 → bbox JSON 抽出規約 |
| `scripts/setup-icons.mjs` | Fluent UI カラーアイコン → 64x64 PNG 変換 |

## Model Configuration

| Variable | Values | Effect |
|----------|--------|--------|
| `MODEL_PROVIDER` | unset or `azure` | GitHub models or Azure BYOM |
| `MODEL_NAME` | model name (e.g., `claude-opus-4.6`) | Specific model selection |
| `AZURE_OPENAI_ENDPOINT` | Azure endpoint URL | Required when `MODEL_PROVIDER=azure` |

Default: no env vars set → SDK picks default GitHub model.
UI のモデルセレクターからも選択可能（Claude Opus, Sonnet, GPT-4.1, GPT-4o, o3-mini）。

## Environment

- Node ≥ 24, pnpm for package management. **Always use `pnpm`, never `npm` or `yarn`.**
- `GITHUB_TOKEN` required for Copilot SDK authentication.
- Built-in `web_search` (bundled MCP) and `fetch` tools are enabled via `onPermissionRequest`. No third-party search API key required.

## Commands

| Task | Command |
|---|---|
| Install deps | `pnpm install` |
| Dev | `pnpm dev` |
| Build | `pnpm build` |
| Start | `pnpm start` |
| Icon gen | `node scripts/setup-icons.mjs` |

## Coding Conventions

- ESM throughout (`"type": "module"`).
- Clean Architecture: domain → application → infrastructure → presentation.
- Domain layer has ZERO external dependencies.
- UI components use lucide-react + Tailwind CSS.
- File names: kebab-case.
- Components: PascalCase.

## Tool System（set_scenario / update_slide）

AIはスライド構成をチャットに書かず、`set_scenario` ツールで構造化データとしてワークスペースパネルに直接送信する。
個別スライドの修正は `update_slide` ツールでマージ更新する。

### フロー
1. ユーザーがプレゼンを依頼
2. AI が `set_scenario({ title, slides })` を呼び出し
3. サーバーが SSE `scenario` イベントを発火 → クライアントの右パネルに即反映
4. ユーザーが確認 → 「PPTX を生成」ボタン or チャットで指示
5. AI が pptxgenjs コードを生成 → PPTX ダウンロード

### ScenarioSlide 必須フィールド
- `number`, `title`, `keyMessage`, `layout`, `bullets`, `notes`, `icon`（任意）

## Skill System（SKILL.md）

`skills/` ディレクトリに SKILL.md を配置し、SDK の `skillDirectories` で読み込む。
- `create-slide-story/SKILL.md` — McKinsey式ストーリー設計 + `set_scenario` ツール使用（`bodyMarkdown` でスライド本体本文を精緻化）
- `generate-pptx/SKILL.md` — PptxGenJS コード出力ガイドライン（`code` モード）
- `pptx-from-image/SKILL.md` — スライド画像 → bbox JSON 抽出規約（`image-then-pptx` モード）。textbox / auto_shape / line / picture の 4 要素タイプと bbox 0..1 正規化、z-order 規約を定義

## Image Generation（image-then-pptx モード）

`src/infrastructure/image/` と `src/infrastructure/render/` で、Azure Foundry の gpt-image-2 を用いた「画像生成 → bbox 抽出 → pptxgenjs 再構築」パスを実装する。

### コンポーネント
- `azure-image-client.ts` — `DefaultAzureCredential`（既定）または API key で gpt-image-2 を呼ぶ。`AZURE_IMAGE_ENDPOINT` 未設定時は `null` を返してグレースフル降格。
- `image-cache.ts` — `Map<imageId, {data, mimeType, createdAt}>` の TTL 1h インメモリキャッシュ。マルチインスタンス時の Blob Storage 化は follow-on (WI-01)。
- `image-prompt-builder.ts`（application 層）— title / keyMessage / bodyMarkdown / DesignBrief から英語 prompt を構築。
- `bbox-extractor.ts` — 生成画像を Copilot SDK Vision（`BBOX_VISION_MODEL`, 既定 `gpt-4o`）に attach → JSON レイアウトを抽出 → `SlideLayoutSchema.safeParse`。失敗時 1 回リトライ、deadline 超過は `BboxTimeoutError`。
- `layout-to-pptx.ts`（application 層）— bbox を pptxgenjs インチ座標に変換し、picture / auto_shape / line / textbox を z 昇順でレンダリング。`image-then-pptx` のスライドサイズは 16:9（10×5.625 inch）。

### フロー
1. UI 上でモードを `image-then-pptx` に切替
2. AI が `generate_all_images`（一括）または `generate_slide_image`（個別）を呼ぶ
3. サーバが SSE `image_generated` を発火し、UI のスライドカードに反映
4. ユーザー確認後 `/api/skills/pptx` を `generationMode: 'image-then-pptx'` で叩く
5. サーバが bbox 抽出 → `applyLayoutToSlide` → 並列で 90s deadline 内に PPTX 生成
6. 失敗スライドは Hybrid C フォールバック（背景 + タイトル帯 + 本文パネル）に降格。`x-pptx-fallback` ヘッダで通知

### 環境変数
詳細は README.md の Environment Variables テーブル参照。`AZURE_IMAGE_ENDPOINT` / `AZURE_IMAGE_DEPLOYMENT` / `AZURE_IMAGE_API_VERSION` / `IMAGE_AUTH_MODE` / `BBOX_VISION_MODEL` / `BBOX_VISION_CONCURRENCY` / `LIBREOFFICE_CONCURRENCY`。

## Quality Gate（非同期品質バッジ）

PPTX ダウンロードを**ブロックせず**、生成後に裏で「原画像 vs LibreOffice レンダ」を比較して品質バッジ（pass / warn / fail）を表示する。

### モデル
- `src/infrastructure/render/libreoffice-renderer.ts` — `renderPptxToPngs(pptxBuf, {jobId, dpi=150, timeoutMs=60000})`。`soffice --headless --convert-to pdf` → `pdftoppm -png` で各スライド PNG 化。`LIBREOFFICE_CONCURRENCY`（既定 1, DD-16）を module-level `p-queue` で適用。caller は `cleanupRenderJob(jobId)` を finally で呼ぶ責務。
- `src/infrastructure/image/image-comparator.ts` — `sharp().resize(width: 1024)` で両画像を揃え、pixelmatch（per-pixel diff）と sharp-phash（Hamming distance）を併走。`evaluateQuality({diff, phash})` で `pass`(diff≤0.12 && phash≤10) / `warn`(diff≤0.15 && phash≤14) / `fail` の 3 段判定。
- `src/app/api/skills/pptx/quality/cache.ts` — `Map<jobId, QualityState>` で 1h TTL のインメモリ結果キャッシュ。`status: 'pending' | 'done' | 'error'`。
- `src/app/api/skills/pptx/quality/[jobId]/route.ts` — クライアント polling 用 GET endpoint。

### フロー
1. `/api/skills/pptx` 成功時に `crypto.randomUUID()` で `jobId` を発行、レスポンスヘッダ `x-pptx-job-id` で返す
2. `kickOffQualityCheck()` を fire-and-forget で起動（`setQualityVerdict({status:'pending'})`）
3. PPTX をレンダ → 各スライドを比較 → worst-of-all で overall verdict 算出
4. `setQualityVerdict({status:'done', verdict, perSlide})`、finally で workDir / originals dir をクリーンアップ
5. クライアント（`pptx-download-card.tsx`）が 2 秒間隔 × 最大 30 回 polling、`done` で色付きバッジを表示
6. ダウンロードボタンは polling と独立して即時活性。404/エラーは `unavailable` 降格で UI に影響させない

### 閾値キャリブレーション
現状の閾値は SKILL 参考値ベース。本番運用後に WI として後続キャリブレーション予定。

## Safety

- Never commit secrets. `GITHUB_TOKEN` は環境変数で注入。
- **Permission ハンドラー**: SDK の `approveAll` は使わず、カスタムハンドラーを使用。`custom-tool` は許可、`read` は SDK の tool-output temp ファイルのみ許可。`shell`・`write`・`mcp`・`url` および任意ファイルの `read` は `denied-by-rules` で拒否される。
- File uploads are validated server-side (type, size limits).
- PPTX is generated in memory — no temp files on disk.
- AI生成コードは `new Function()` で実行（pptxgenjs スコープに限定）。

## Development Workflow

- **ブランチ運用**: 変更は `feat/xxx` や `fix/xxx` ブランチで作業し、PR 経由で master にマージする。master に直接 push しない。
- **ローカルテスト**: push 前に `pnpm build` でビルド確認する。API 変更は `pnpm dev` でローカル動作確認してから push。
- **デプロイ**: master マージで GitHub Actions が自動実行（Bicep → Docker build → ACR push → Container App update）。
- **コミットメッセージ**: Conventional Commits 形式（`feat:`, `fix:`, `chore:`, `docs:`）。末尾に `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` を付ける。
