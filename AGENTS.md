# AGENTS.md

## Overview

Copilot SDK エージェント — Next.js フルスタックアプリ。チャットUIでAIと対話しながら PowerPoint を生成するデモ。
2ペインワークスペース（チャット + シナリオパネル）で、AIがスライド構成をツール経由で直接パネルに送り、確認後にPPTXを生成する。

- **`src/domain/`** — ドメイン層。エンティティ型定義とポート（インターフェース）。フレームワーク非依存。
- **`src/application/`** — アプリケーション層。ユースケースとスライドパーサー。
- **`src/infrastructure/`** — インフラ層。Copilot SDK クライアント、カスタムツール、pptxgenjs アダプター。
- **`src/app/`** — プレゼンテーション層。Next.js App Router（UI + API Routes）。
- **`skills/`** — SDK スキルディレクトリ（SKILL.md 形式）。

## Key Files

| File | Purpose |
|------|---------|
| `src/app/page.tsx` | メインページ |
| `src/app/api/chat/route.ts` | POST `/api/chat` — SSE ストリーミングチャット（ツール呼び出し含む） |
| `src/app/api/skills/pptx/route.ts` | POST `/api/skills/pptx` — PPTX コード実行 & ダウンロード |
| `src/app/api/skills/pptx/slide/route.ts` | POST `/api/skills/pptx/slide` — 単一スライド PPTX 生成 |
| `src/app/api/health/route.ts` | GET `/api/health` — ヘルスチェック |
| `src/domain/entities/message.ts` | Message, Attachment 型定義 |
| `src/domain/entities/slide-work.ts` | SlideWork, SlideItem, SlideLayout 型定義 |
| `src/domain/entities/presentation.ts` | Slide, Presentation 型定義 |
| `src/application/chat-use-case.ts` | チャット会話ユースケース |
| `src/application/slide-parser.ts` | マークダウン → SlideItem[] パーサー（フォールバック用） |
| `src/infrastructure/copilot/client.ts` | CopilotClient シングルトン |
| `src/infrastructure/tools/scenario-tool.ts` | `set_scenario` / `update_slide` ツール定義 |
| `src/infrastructure/tools/web-search-tool.ts` | Tavily Web検索ツール |
| `src/infrastructure/skills/pptxgen-adapter.ts` | pptxgenjs による PPTX 生成 |
| `skills/create-slide-story/SKILL.md` | スライドストーリー作成スキル（McKinsey式） |
| `skills/generate-pptx/SKILL.md` | PptxGenJS コード生成スキル |
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
- `TAVILY_API_KEY` optional — Web検索ツール有効化用。

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
- `create-slide-story/SKILL.md` — McKinsey式ストーリー設計 + `set_scenario` ツール使用
- `generate-pptx/SKILL.md` — PptxGenJS コード出力ガイドライン

## Safety

- Never commit secrets. `GITHUB_TOKEN` / `TAVILY_API_KEY` は環境変数で注入。
- File uploads are validated server-side (type, size limits).
- PPTX is generated in memory — no temp files on disk.
- AI生成コードは `new Function()` で実行（pptxgenjs スコープに限定）。
