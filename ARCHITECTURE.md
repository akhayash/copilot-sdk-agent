# Architecture — copilot-sdk-agent

## Overview

Copilot SDK を使用したエージェントアプリケーション。
**Next.js (App Router)** によるフルスタック構成で、チャットUIからの指示でPowerPointを生成する。
2ペインワークスペース（チャット + シナリオパネル）で、AIがツール呼び出しを通じてスライド構成を直接パネルに送り、McKinsey式ストーリーテリングに基づくプレゼンテーションを生成する。

- **フレームワーク**: Next.js 16 (App Router, Server Components)
- **UI**: React 19 + lucide-react + Tailwind CSS v4
- **AI**: `@github/copilot-sdk` (SSE streaming, tool calling, SKILL.md)
- **PPTX生成**: `pptxgenjs` (AI生成コード実行方式)
- **アイコン**: `@fluentui/svg-icons` (カラー版 → PNG変換)
- **言語**: TypeScript (ESM)
- **パッケージマネージャ**: pnpm

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Presentation Layer (Next.js App Router)                    │
│  ┌──────────────────────┐  ┌─────────────────────────────┐  │
│  │  2-Pane Workspace    │  │  API Routes                 │  │
│  │  ┌────────┬────────┐ │  │  /api/chat     (SSE stream) │  │
│  │  │ Chat   │Scenario│ │→ │  /api/skills/pptx (PPTX DL) │  │
│  │  │ Pane   │ Panel  │ │  │  /api/health                │  │
│  │  └────────┴────────┘ │  └────────────┬────────────────┘  │
│                                         │                   │
├─────────────────────────────────────────┼───────────────────┤
│  Application Layer                      │                   │
│  ┌─────────────────┐  ┌────────────────┴────────┐          │
│  │  ChatUseCase     │  │  SlideParser (fallback) │          │
│  │  - buildPrompt   │  │  - parseStoryToSlides   │          │
│  └────────┬────────┘  └─────────────────────────┘          │
│           │                                                 │
├───────────┼─────────────────────────────────────────────────┤
│  Domain Layer                                               │
│  ┌────────┴──────────┐  ┌─────────────────────────────┐    │
│  │  Entities          │  │  Ports (Interfaces)          │    │
│  │  - Message         │  │  - Skill<TIn, TOut>          │    │
│  │  - Attachment      │  │  - PptxSkill                 │    │
│  │  - SlideWork       │  │                              │    │
│  │  - SlideItem       │  │                              │    │
│  │  - SlideLayout     │  │                              │    │
│  └───────────────────┘  └──────────────────────────────┘    │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  Infrastructure Layer                                        │
│  ┌─────────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  CopilotClient   │  │  Tools        │  │  Adapters      │  │
│  │  (singleton)     │  │  - scenario   │  │  - pptxgen     │  │
│  │                  │  │  - update     │  │                │  │
│  │                  │  │  - web_search │  │                │  │
│  └─────────────────┘  └──────────────┘  └───────────────┘  │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  Skills (SKILL.md)                                           │
│  ┌─────────────────────────┐  ┌──────────────────────────┐  │
│  │  create-slide-story     │  │  generate-pptx            │  │
│  │  McKinsey式シナリオ設計  │  │  pptxgenjs コード生成     │  │
│  └─────────────────────────┘  └──────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
copilot-sdk-agent/
├── src/
│   ├── domain/                        # Domain Layer — 型定義 & ポート
│   │   ├── entities/
│   │   │   ├── message.ts             # Message, Attachment 型
│   │   │   ├── presentation.ts        # Slide, Presentation 型
│   │   │   └── slide-work.ts          # SlideWork, SlideItem, SlideLayout 型
│   │   └── ports/
│   │       └── skills/
│   │           ├── skill.ts           # Skill<TInput, TOutput> 共通インターフェース
│   │           └── pptx-skill.ts      # PptxSkill ポート定義
│   │
│   ├── application/                   # Application Layer — ユースケース
│   │   ├── chat-use-case.ts           # チャットプロンプト構築
│   │   ├── slide-parser.ts            # マークダウン → SlideItem[] パーサー
│   │   └── skills/
│   │       ├── skill-registry.ts      # スキル登録 & 実行
│   │       └── generate-pptx-use-case.ts
│   │
│   ├── infrastructure/                # Infrastructure Layer — 外部サービス実装
│   │   ├── copilot/
│   │   │   └── client.ts             # CopilotClient シングルトン
│   │   ├── tools/
│   │   │   ├── scenario-tool.ts       # set_scenario / update_slide ツール
│   │   │   └── web-search-tool.ts     # Tavily Web検索ツール
│   │   └── skills/
│   │       └── pptxgen-adapter.ts     # pptxgenjs による Skill 実装
│   │
│   └── app/                           # Presentation Layer — Next.js App Router
│       ├── layout.tsx                 # Inter + Noto Sans JP フォント
│       ├── page.tsx
│       ├── globals.css                # CSS変数、prose スタイル、アニメーション
│       ├── api/
│       │   ├── chat/route.ts          # POST — SSE ストリーミング + ツール呼び出し
│       │   ├── health/route.ts        # GET — ヘルスチェック
│       │   └── skills/pptx/
│       │       └── route.ts           # POST — PPTX コード実行 & バイナリ返却
│       └── components/
│           ├── chat/
│           │   ├── chat-container.tsx  # 2ペインレイアウト + SSEイベント処理
│           │   ├── message-list.tsx    # メッセージ一覧
│           │   ├── message-bubble.tsx  # メッセージ表示 + Thinking
│           │   ├── message-input.tsx   # テキスト入力 + D&Dファイル添付
│           │   ├── model-selector.tsx  # モデル選択ドロップダウン
│           │   └── attachment-preview.tsx
│           ├── slides/
│           │   └── slide-panel.tsx     # シナリオパネル（右ペイン）
│           └── skills/
│               ├── pptx-download-card.tsx
│               └── slide-story-view.tsx
├── skills/
│   ├── create-slide-story/SKILL.md    # スライドストーリー作成スキル
│   └── generate-pptx/SKILL.md         # PPTX 生成スキル
├── scripts/
│   └── setup-icons.mjs                # Fluent UI アイコン → PNG 変換
├── public/
│   └── icons/                         # 24種のカラーアイコン PNG
├── .vscode/mcp.json                   # MCP サーバー設定
└── package.json
```

## Data Flow

### 1. シナリオ作成（set_scenario ツール）

```
User: 「Azureについてプレゼン作って」
  → POST /api/chat (SSE stream)
  → CopilotClient.createSession({ tools: [set_scenario, update_slide, web_search] })
  → AI が web_search() で情報収集
  → AI が set_scenario({ title, slides }) をツール呼び出し
  → ツールハンドラが SSE data: {"scenario": {...}} を発火
  → クライアントが scenario イベントを受信 → 右パネルに即反映
  → AI がチャットに「構成を作成しました。確認してください。」と応答
```

### 2. 個別スライド更新（update_slide ツール）

```
User: 「P.5のタイトルを変更して」
  → AI が update_slide({ number: 5, ... }) をツール呼び出し
  → SSE data: {"slide_update": {...}} を発火
  → クライアントが slide_update を受信 → 該当スライドのみマージ更新
```

### 3. PPTX 生成 & ダウンロード

```
User: 「PPTX を生成」ボタン or チャットで指示
  → AI が pptxgenjs コードを ```javascript``` ブロックで出力
  → クライアントがコードブロックを検出 → slideWork.pptx にセット
  → ユーザーがダウンロードボタンをクリック
  → POST /api/skills/pptx { code, title }
  → サーバーが new Function() でコード実行（pres, C, F 等のスコープ提供）
  → pptxgenjs でメモリ上に PPTX 生成 → バイナリ返却
```

### 4. SSE イベント一覧

| SSE データ | 発生源 | クライアント処理 |
|-----------|--------|-----------------|
| `{"content": "..."}` | `assistant.message_delta` | チャットに逐次表示 |
| `{"thinking": "..."}` | `assistant.reasoning_delta` | Thinking表示（スクロール可能） |
| `{"scenario": {...}}` | `set_scenario` ツール | 右パネルにシナリオ反映 |
| `{"slide_update": {...}}` | `update_slide` ツール | 該当スライドのみ更新 |
| `{"error": "..."}` | エラー時 | エラー表示 |
| `: keepalive` | 30秒ごと | 無視（idle timeout防止） |
| `[DONE]` | 完了時 | ストリーム終了 |

## API Routes

### POST `/api/chat`
SSE ストリーミングチャット。ツール呼び出し（set_scenario, update_slide, web_search）を含む。
- Request: `{ message, history?, model? }`
- Response: SSE stream（上記イベント一覧参照）
- Timeout: 600秒 + 30秒keepalive

### POST `/api/skills/pptx`
AI生成の pptxgenjs コードを実行し、PPTX バイナリを返却。
- Request: `{ code, title? }`
- Response: `application/vnd.openxmlformats-officedocument.presentationml.presentation`

### GET `/api/health`
ヘルスチェック。

## Model Configuration

| Path | 環境変数 | 効果 |
|------|---------|------|
| GitHub default | なし | SDK デフォルトモデル |
| GitHub specific | `MODEL_NAME` | 指定モデル |
| Azure BYOM | `MODEL_PROVIDER=azure` + `AZURE_OPENAI_ENDPOINT` + `MODEL_NAME` | Azure OpenAI |

UIモデルセレクター: Claude Opus 4.6, Claude Sonnet 4.6, GPT-4.1, GPT-4o, o3-mini

## Environment

- Node.js ≥ 24
- pnpm
- `GITHUB_TOKEN` — Copilot SDK 認証用
- `TAVILY_API_KEY` — Web検索ツール（任意）
- `MODEL_NAME` — モデル指定（任意）
