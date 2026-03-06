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
| `{"step": {...}}` | ツール・ステップイベント | StepProgress にステップ表示 |
| `{"scenario": {...}}` | `set_scenario` ツール | 右パネルにシナリオ反映 |
| `{"slide_update": {...}}` | `update_slide` ツール | 該当スライドのみ更新 |
| `{"error": "..."}` | エラー時 | エラー表示 |
| `: keepalive` | 30秒ごと | 無視（idle timeout防止） |
| `[DONE]` | 完了時 | ストリーム終了 |

### 5. Copilot SDK Session Events（全イベント一覧）

`session.on(eventType, handler)` で購読可能なイベント。`@github/copilot-sdk` v0.1.30 時点。

#### Session ライフサイクル

| イベント | data | 説明 |
|---------|------|------|
| `session.start` | `sessionId, version, copilotVersion, selectedModel?, context?` | セッション開始 |
| `session.resume` | `resumeTime, eventCount, context?` | セッション再開 |
| `session.idle` | `{}` | アイドル状態（sendAndWait の完了トリガー） |
| `session.error` | `errorType, message, stack?, statusCode?` | エラー発生 |
| `session.title_changed` | `title` | セッションタイトル変更 |
| `session.model_change` | `previousModel?, newModel` | モデル変更 |
| `session.mode_changed` | `previousMode, newMode` | モード変更 |
| `session.plan_changed` | `operation: create/update/delete` | プラン変更 |
| `session.context_changed` | `cwd, gitRoot?, repository?, branch?` | コンテキスト変更 |
| `session.info` | `infoType, message` | 情報通知 |
| `session.warning` | `warningType, message` | 警告 |
| `session.shutdown` | `totalPremiumRequests, modelMetrics, codeChanges, ...` | セッション終了（使用統計含む） |
| `session.task_complete` | `summary?` | タスク完了 |

#### コンテキスト管理

| イベント | data | 説明 |
|---------|------|------|
| `session.truncation` | `tokenLimit, tokensRemoved, messagesRemoved, ...` | トークン切り詰め |
| `session.compaction_start` | `{}` | コンパクション開始 |
| `session.compaction_complete` | `success, preCompactionTokens, postCompactionTokens, ...` | コンパクション完了 |
| `session.usage_info` | `tokenLimit, currentTokens, messagesLength` | 使用状況 |
| `session.snapshot_rewind` | `upToEventId, eventsRemoved` | スナップショット巻き戻し |
| `session.workspace_file_changed` | `path, operation: create/update` | ワークスペースファイル変更 |

#### Assistant (AI応答)

| イベント | data | 説明 |
|---------|------|------|
| `assistant.turn_start` | `turnId, interactionId?` | **ターン開始** |
| `assistant.intent` | `intent` | **AIの意図**（ephemeral） |
| `assistant.reasoning` | `reasoningId, content` | Thinking 全文 |
| `assistant.reasoning_delta` | `reasoningId, deltaContent` | **Thinking 差分**（ストリーミング） |
| `assistant.message` | `messageId, content, toolRequests?, ...` | メッセージ全文 |
| `assistant.message_delta` | `messageId, deltaContent` | **メッセージ差分**（ストリーミング） |
| `assistant.streaming_delta` | `totalResponseSizeBytes` | ストリーミングサイズ |
| `assistant.turn_end` | `turnId` | **ターン終了** |
| `assistant.usage` | `model, inputTokens, outputTokens, cost?, duration?, ...` | トークン使用量 |

#### ツール実行

| イベント | data | 説明 |
|---------|------|------|
| `tool.user_requested` | `toolCallId, toolName, arguments?` | ユーザーによるツール要求 |
| `tool.execution_start` | `toolCallId, toolName, arguments?, mcpServerName?, mcpToolName?` | **ツール実行開始** |
| `tool.execution_progress` | `toolCallId, progressMessage` | 実行中の進捗メッセージ |
| `tool.execution_partial_result` | `toolCallId, partialOutput` | 部分結果（ephemeral） |
| `tool.execution_complete` | `toolCallId, success, result?, error?` | **ツール実行完了** |

`result` には `content` (テキスト), `contents[]` (text/terminal/image/audio/resource_link/resource) が含まれる。

#### スキル・サブエージェント

| イベント | data | 説明 |
|---------|------|------|
| `skill.invoked` | `name, path, content, allowedTools?` | **スキル呼び出し** |
| `subagent.started` | `toolCallId, agentName, agentDisplayName, agentDescription` | サブエージェント開始 |
| `subagent.completed` | `toolCallId, agentName, agentDisplayName` | サブエージェント完了 |
| `subagent.failed` | `toolCallId, agentName, error` | サブエージェント失敗 |
| `subagent.selected` | `agentName, agentDisplayName, tools` | サブエージェント選択 |
| `subagent.deselected` | `{}` | サブエージェント解除 |

#### フック・システム

| イベント | data | 説明 |
|---------|------|------|
| `hook.start` | `hookInvocationId, hookType, input?` | フック開始 |
| `hook.end` | `hookInvocationId, hookType, output?, success, error?` | フック終了 |
| `system.message` | `content, role: system/developer, name?` | システムメッセージ |
| `user.message` | `content, attachments?, source?, agentMode?` | ユーザーメッセージ |
| `abort` | `reason` | 中断 |

#### 現在アプリで購読しているイベント（太字は SSE で配信中）

- **`assistant.message_delta`** → `{"content": "..."}`
- **`assistant.reasoning_delta`** → `{"thinking": "..."}`
- **`session.error`** → `{"error": "..."}`
- **`assistant.turn_start`** → `{"step": {"type": "turn_start"}}`
- **`assistant.turn_end`** → `{"step": {"type": "turn_end"}}`
- **`assistant.intent`** → `{"step": {"type": "intent", "name": "..."}}`
- **`tool.execution_start`** → `{"step": {"type": "tool_start", "name": "..."}}`
- **`tool.execution_complete`** → `{"step": {"type": "tool_end", "name": "..."}}`
- **`skill.invoked`** → `{"step": {"type": "skill", "name": "..."}}`

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
