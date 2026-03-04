# Architecture — copilot-sdk-agent

## Overview

Copilot SDK を使用したエージェントアプリケーション。  
**Next.js (App Router)** によるフルスタック構成で、チャットUIからの指示でPowerPointを生成するデモ。

- **フレームワーク**: Next.js 15 (App Router, Server Components)
- **UI**: React 19 + shadcn/ui + Tailwind CSS v4
- **AI**: `@github/copilot-sdk`
- **PPTX生成**: `pptxgenjs`
- **言語**: TypeScript (ESM)
- **パッケージマネージャ**: pnpm

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Presentation Layer (Next.js App Router)                    │
│  ┌───────────────────┐  ┌────────────────────────────────┐  │
│  │  Chat UI          │  │  API Routes                    │  │
│  │  shadcn/ui +      │→ │  /api/chat      (SSE stream)   │  │
│  │  Tailwind CSS     │  │  /api/skills/pptx (download)   │  │
│  │  File Attach      │  │  /api/health                   │  │
│  └───────────────────┘  └──────────┬─────────────────────┘  │
│                                    │                        │
├────────────────────────────────────┼────────────────────────┤
│  Application Layer                 │                        │
│  ┌─────────────────┐  ┌───────────┴──────────┐             │
│  │  ChatUseCase     │  │  SkillRegistry       │             │
│  │  - send message  │  │  - register(skill)   │             │
│  │  - attach files  │  │  - execute(name, in) │             │
│  └────────┬────────┘  └───────────┬──────────┘             │
│           │                       │                        │
├───────────┼───────────────────────┼────────────────────────┤
│  Domain Layer                     │                        │
│  ┌────────┴────────┐  ┌──────────┴──────────┐             │
│  │  Entities        │  │  Ports (Interfaces)  │             │
│  │  - Message       │  │  - AIService         │             │
│  │  - Attachment    │  │  - Skill<TIn, TOut>  │             │
│  │  - Presentation  │  │  - PptxSkill         │             │
│  │  - Slide         │  │                      │             │
│  └─────────────────┘  └──────────┬──────────┘             │
│                                   │                        │
├───────────────────────────────────┼────────────────────────┤
│  Infrastructure Layer             │                        │
│  ┌─────────────────┐  ┌──────────┴──────────┐             │
│  │  CopilotClient   │  │  PptxgenAdapter      │             │
│  │  (singleton)     │  │  (pptxgenjs)         │             │
│  └─────────────────┘  └─────────────────────┘             │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
copilot-sdk-agent/
├── src/
│   ├── domain/                    # Domain Layer — 型定義 & ポート
│   │   ├── entities/
│   │   │   ├── message.ts         # Message, Attachment 型
│   │   │   └── presentation.ts   # Slide, Presentation 型
│   │   └── ports/
│   │       └── skills/
│   │           ├── skill.ts       # Skill<TInput, TOutput> 共通インターフェース
│   │           └── pptx-skill.ts  # PptxSkill ポート定義
│   │
│   ├── application/               # Application Layer — ユースケース
│   │   ├── chat-use-case.ts      # チャット会話オーケストレーション
│   │   └── skills/
│   │       ├── skill-registry.ts  # スキル登録 & 実行
│   │       └── generate-pptx-use-case.ts  # PPTX生成ユースケース
│   │
│   ├── infrastructure/            # Infrastructure Layer — 外部サービス実装
│   │   ├── copilot/
│   │   │   └── client.ts         # CopilotClient シングルトン
│   │   └── skills/
│   │       └── pptxgen-adapter.ts # pptxgenjs による Skill 実装
│   │
│   └── app/                       # Presentation Layer — Next.js App Router
│       ├── layout.tsx
│       ├── page.tsx               # メインページ (チャットUI)
│       ├── globals.css
│       ├── api/
│       │   ├── chat/route.ts      # POST — SSE ストリーミングチャット
│       │   ├── skills/
│       │   │   └── pptx/route.ts  # POST — PPTX 生成 & バイナリ返却
│       │   └── health/route.ts    # GET — ヘルスチェック
│       └── components/
│           ├── ui/                # shadcn/ui コンポーネント
│           ├── chat/
│           │   ├── chat-container.tsx    # 全体レイアウト
│           │   ├── message-list.tsx      # メッセージ一覧
│           │   ├── message-bubble.tsx    # 個別メッセージ
│           │   ├── message-input.tsx     # テキスト入力 + 添付ボタン
│           │   └── attachment-preview.tsx # 添付ファイルプレビュー
│           └── skills/
│               └── pptx-download-card.tsx # ダウンロードカード
├── public/
├── AGENTS.md
├── ARCHITECTURE.md
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

## Layer Responsibilities

### Domain Layer (`src/domain/`)

フレームワーク非依存。ビジネスエンティティとポート（インターフェース）のみ。

- **Entities**: `Message`, `Attachment`, `Slide`, `Presentation` の型定義
- **Ports**: 外部サービスへの依存を抽象化するインターフェース
  - `Skill<TInput, TOutput>` — スキル共通インターフェース
  - `PptxSkill` — PPTX 生成固有のポート

### Application Layer (`src/application/`)

ユースケース。ドメインのポートを通じてインフラ層を呼び出す。

- **ChatUseCase** — メッセージ送信、添付ファイル処理、AIとの対話
- **SkillRegistry** — スキルの登録・発見・実行
- **GeneratePptxUseCase** — AI応答からスライド構造を抽出し、PPTX生成を実行

### Infrastructure Layer (`src/infrastructure/`)

ポートの具体的な実装。外部ライブラリへの依存はここに閉じ込める。

- **CopilotClient** — `@github/copilot-sdk` のシングルトン管理
- **PptxgenAdapter** — `pptxgenjs` によるPPTX生成実装

### Presentation Layer (`src/app/`)

Next.js App Router による UI と API。

- **API Routes** — Server-side SSE ストリーミング、PPTX生成エンドポイント
- **Components** — shadcn/ui ベースのチャットUI、ファイル添付、ダウンロードカード

## Data Flow

### 1. チャット会話

```
User Input → MessageInput → POST /api/chat (SSE)
  → ChatUseCase → CopilotClient.createSession()
  → session.send() → assistant.message_delta events
  → SSE stream → UI に逐次表示
```

### 2. PPTX 生成

```
User: 「5枚のプレゼン作って」
  → POST /api/chat → AI がスライド構成 JSON を生成
  → UI がスライド構成を検出
  → POST /api/skills/pptx (JSON payload)
  → GeneratePptxUseCase → PptxgenAdapter.execute()
  → pptxgenjs でメモリ上に PPTX 生成
  → Content-Disposition: attachment でバイナリ返却
  → ブラウザが Blob としてダウンロード
  → UI にダウンロードカード表示
```

### 3. ファイル添付

```
User: ファイル選択 or ドラッグ & ドロップ
  → MessageInput → FileReader でテキスト読み取り
  → POST /api/chat (message + attachments)
  → ChatUseCase: 添付内容をプロンプトに組み込み
  → AI がファイル内容を考慮して応答
```

## Skill System

スキルは共通インターフェースに従い、レジストリで管理される。

```typescript
// 共通インターフェース
interface Skill<TInput, TOutput> {
  readonly name: string;
  readonly description: string;
  execute(input: TInput): Promise<TOutput>;
}

// レジストリ
class SkillRegistry {
  register(skill: Skill<unknown, unknown>): void;
  get(name: string): Skill | undefined;
  list(): { name: string; description: string }[];
}
```

### 拡張方法

新しいスキルを追加する場合：

1. `domain/ports/skills/` にポートを定義
2. `infrastructure/skills/` に実装を追加
3. `application/skills/` にユースケースを追加
4. `app/api/skills/` にAPIルートを追加
5. レジストリに登録

## Model Configuration

copilot-sdk-app と同じ3パス構成：

| Path | 環境変数 | 効果 |
|------|---------|------|
| GitHub default | なし | SDK デフォルトモデル |
| GitHub specific | `MODEL_NAME` | 指定モデル |
| Azure BYOM | `MODEL_PROVIDER=azure` + `AZURE_OPENAI_ENDPOINT` + `MODEL_NAME` | Azure OpenAI |

## Environment

- Node.js ≥ 24
- pnpm
- `GITHUB_TOKEN` — Copilot SDK 認証用
