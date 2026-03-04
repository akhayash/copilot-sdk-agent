# AGENTS.md

## Overview

Copilot SDK エージェント — Next.js フルスタックアプリ。チャットUIでAIと対話しながら PowerPoint を生成するデモ。

- **`src/domain/`** — ドメイン層。エンティティ型定義とポート（インターフェース）。フレームワーク非依存。
- **`src/application/`** — アプリケーション層。ユースケースとスキルレジストリ。
- **`src/infrastructure/`** — インフラ層。Copilot SDK クライアントと pptxgenjs アダプター。
- **`src/app/`** — プレゼンテーション層。Next.js App Router（UI + API Routes）。

## Key Files

| File | Purpose |
|------|---------|
| `src/app/page.tsx` | メインチャットUI |
| `src/app/api/chat/route.ts` | POST `/api/chat` — SSE ストリーミングチャット |
| `src/app/api/skills/pptx/route.ts` | POST `/api/skills/pptx` — PPTX 生成 & ダウンロード |
| `src/app/api/health/route.ts` | GET `/api/health` — ヘルスチェック |
| `src/domain/entities/message.ts` | Message, Attachment 型定義 |
| `src/domain/entities/presentation.ts` | Slide, Presentation 型定義 |
| `src/domain/ports/skills/skill.ts` | Skill 共通インターフェース |
| `src/domain/ports/skills/pptx-skill.ts` | PPTX Skill ポート |
| `src/application/chat-use-case.ts` | チャット会話ユースケース |
| `src/application/skills/skill-registry.ts` | スキル登録 & 実行 |
| `src/application/skills/generate-pptx-use-case.ts` | PPTX 生成ユースケース |
| `src/infrastructure/copilot/client.ts` | CopilotClient シングルトン |
| `src/infrastructure/skills/pptxgen-adapter.ts` | pptxgenjs による PPTX 生成 |

## Model Configuration

| Variable | Values | Effect |
|----------|--------|--------|
| `MODEL_PROVIDER` | unset or `azure` | GitHub models or Azure BYOM |
| `MODEL_NAME` | model name (e.g., `gpt-4o`) | Specific model selection |
| `AZURE_OPENAI_ENDPOINT` | Azure endpoint URL | Required when `MODEL_PROVIDER=azure` |

Default: no env vars set → SDK picks default GitHub model.

## Environment

- Node ≥ 24, pnpm for package management. **Always use `pnpm`, never `npm` or `yarn`.**
- `GITHUB_TOKEN` required for Copilot SDK authentication.

## Commands

| Task | Command |
|---|---|
| Install deps | `pnpm install` |
| Dev | `pnpm dev` |
| Build | `pnpm build` |
| Start | `pnpm start` |

## Coding Conventions

- ESM throughout (`"type": "module"`).
- Clean Architecture: domain → application → infrastructure → presentation.
- Domain layer has ZERO external dependencies.
- UI components use shadcn/ui + Tailwind CSS.
- File names: kebab-case.
- Components: PascalCase.

## Skill System

Skills follow a common interface and are registered in `SkillRegistry`.
To add a new skill:

1. Define port in `src/domain/ports/skills/`
2. Implement adapter in `src/infrastructure/skills/`
3. Add use case in `src/application/skills/`
4. Add API route in `src/app/api/skills/`
5. Register in skill registry

## Safety

- Never commit secrets. `GITHUB_TOKEN` is injected via environment variables.
- File uploads are validated server-side (type, size limits).
- PPTX is generated in memory — no temp files on disk.
