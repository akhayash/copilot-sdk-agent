# Copilot SDK Agent — AI Presentation Generator

チャットUIでAIと対話しながらPowerPointプレゼンテーションを生成するNext.jsフルスタックアプリ。

## Features

- 🤖 **AI チャット** — Copilot SDK によるSSEストリーミング対話（Thinking表示対応）
- 📊 **シナリオパネル** — AIが `set_scenario` ツールでスライド構成を右パネルに直接送信
- 🎯 **McKinsey式** — 結論先行タイトル、keyMessage（So What?）、レイアウト指定
- 📝 **PPTX生成** — pptxgenjs コード実行方式で自由なレイアウト・カード・統計表示
- 🎨 **Fluent UIカラーアイコン** — 24種のカラーアイコンをスライドに配置
- 🔍 **Web検索** — Tavily APIでリアルタイム情報を収集
- 📎 **ファイル添付** — ドラッグ&ドロップでファイルをAIに読み込ませる
- ✏️ **個別スライド更新** — 「P.5を変更して」で該当スライドのみ更新

## Quick Start

```bash
# 依存インストール
pnpm install

# アイコン生成（初回のみ）
node scripts/setup-icons.mjs

# 環境変数設定
export GITHUB_TOKEN=your_token
export TAVILY_API_KEY=your_key  # 任意

# 開発サーバー起動
pnpm dev
```

http://localhost:3000 を開いてプレゼン作成を依頼してください。

## Architecture

2ペインワークスペース + ツールベースのシナリオ管理:

```
ユーザー → チャット → AI → set_scenario() → 右パネルにシナリオ表示
                         → update_slide() → 個別スライド更新
                         → pptxgenjs コード → PPTX ダウンロード
```

詳細は [ARCHITECTURE.md](ARCHITECTURE.md) を参照。

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | SSE ストリーミングチャット（ツール呼び出し含む） |
| `/api/skills/pptx` | POST | pptxgenjs コード実行 → PPTX バイナリ返却 |
| `/api/skills/pptx/slide` | POST | 単一スライド PPTX + PNG プレビュー |
| `/api/health` | GET | ヘルスチェック |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | ✅ | Copilot SDK 認証 |
| `TAVILY_API_KEY` | - | Web検索ツール有効化 |
| `MODEL_NAME` | - | モデル指定（e.g., `claude-opus-4.6`） |
| `MODEL_PROVIDER` | - | `azure` で Azure OpenAI 使用 |
| `AZURE_OPENAI_ENDPOINT` | - | Azure BYOM エンドポイント |

## Commands

| Task | Command |
|---|---|
| Install deps | `pnpm install` |
| Dev | `pnpm dev` |
| Build | `pnpm build` |
| Start | `pnpm start` |
| Icon gen | `node scripts/setup-icons.mjs` |

## Tech Stack

- **Next.js 16** (App Router)
- **React 19** + Tailwind CSS v4 + lucide-react
- **@github/copilot-sdk** (streaming, tools, SKILL.md)
- **pptxgenjs** (PPTX generation)
- **@fluentui/svg-icons** (color icons)
