# AGENTS.md

## Overview

Copilot SDK エージェント — Next.js フルスタックアプリ。チャットUIでAIと対話しながら PowerPoint を生成するデモ。
2ペインワークスペース（チャット + シナリオパネル）で、AIがスライド構成をツール経由で直接パネルに送り、確認後にPPTXを生成する。

- **`src/domain/`** — ドメイン層。エンティティ型定義とポート（インターフェース）。フレームワーク非依存。
- **`src/application/`** — アプリケーション層。ユースケースとスライドパーサー。
- **`src/infrastructure/`** — インフラ層。Copilot SDK クライアント、カスタムツール、pptxgenjs アダプター、画像生成。
- **`src/app/`** — プレゼンテーション層。Next.js App Router（UI + API Routes）。
- **`skills/`** — SDK スキルディレクトリ（SKILL.md 形式）。

## Key Files

| File | Purpose |
|------|---------|
| `src/app/page.tsx` | メインページ |
| `src/app/api/chat/route.ts` | POST `/api/chat` — SSE ストリーミングチャット（ツール呼び出し含む） |
| `src/app/api/skills/pptx/route.ts` | POST `/api/skills/pptx` — PPTX コード実行 & ダウンロード（code / image-bleed 両モード） |
| `src/app/api/skills/image/route.ts` | POST `/api/skills/image` — 1 枚画像生成（gpt-image-2） |
| `src/app/api/skills/image/[id]/route.ts` | GET — 生成済み画像バイナリ取得 |
| `src/app/api/health/route.ts` | GET `/api/health` — ヘルスチェック |
| `src/domain/entities/message.ts` | Message, Attachment 型定義 |
| `src/domain/entities/slide-work.ts` | SlideWork, SlideItem 型定義（`bodyMarkdown` / `imageStatus` 含む） |
| `src/domain/entities/presentation.ts` | Slide, Presentation 型定義 |
| `src/application/chat-use-case.ts` | チャット会話ユースケース |
| `src/application/slide-parser.ts` | マークダウン → SlideItem[] パーサー（フォールバック用） |
| `src/application/image-prompt-builder.ts` | シナリオ + DesignBrief から画像生成 prompt 構築 |
| `src/infrastructure/copilot/client.ts` | CopilotClient シングルトン |
| `src/infrastructure/tools/scenario-tool.ts` | `set_scenario` / `update_slide` ツール定義 |
| `src/infrastructure/tools/image-tool.ts` | `generate_slide_image` / `generate_all_images` ツール |
| `src/infrastructure/image/azure-image-client.ts` | Azure Foundry gpt-image-2 ラッパー（Entra ID / API key） |
| `src/infrastructure/image/image-cache.ts` | インメモリ画像キャッシュ（TTL 1h） |
| `src/infrastructure/skills/pptxgen-adapter.ts` | pptxgenjs による PPTX 生成 |
| `skills/create-slide-story/SKILL.md` | スライドストーリー作成スキル（McKinsey式 + `bodyMarkdown`） |
| `skills/generate-pptx/SKILL.md` | PptxGenJS コード生成スキル（code モード） |
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

## Image Generation（image-bleed モード）

`src/infrastructure/image/` で、Azure Foundry の gpt-image-2 を用いてスライドごとの画像を生成し、PPTX にフルブリードで貼り付ける。

### コンポーネント
- `azure-image-client.ts` — `DefaultAzureCredential`（既定）または API key で gpt-image-2 を呼ぶ。`AZURE_IMAGE_ENDPOINT` 未設定時は `null` を返してグレースフル降格。
- `image-cache.ts` — `Map<imageId, {data, mimeType, createdAt}>` の TTL 1h インメモリキャッシュ。マルチインスタンス時の Blob Storage 化は follow-on。
- `image-prompt-builder.ts`（application 層）— title / keyMessage / bodyMarkdown / DesignBrief から英語 prompt を構築。

### フロー
1. UI 上でモードを `image-bleed` に切替
2. AI が `generate_all_images`（一括）または `generate_slide_image`（個別）を呼ぶ
3. サーバが SSE `image_generated` を発火し、UI のスライドカードに反映
4. ユーザー確認後 `/api/skills/pptx` を `generationMode: 'image-bleed'` で叩く
5. サーバが各スライドに画像をフルブリード（16:9 = 10×5.625 inch）で貼り付け
6. 画像欠落スライドはタイトル+本文パネルへ降格し、`x-pptx-missing-images` ヘッダで通知。全画像欠落時は 410

### 環境変数
詳細は README.md の Environment Variables テーブル参照。`AZURE_IMAGE_ENDPOINT` / `AZURE_IMAGE_DEPLOYMENT` / `AZURE_IMAGE_API_VERSION` / `IMAGE_AUTH_MODE`。

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
