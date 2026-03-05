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

- **Next.js 16** (App Router, Webpack build)
- **React 19** + Tailwind CSS v4 + lucide-react
- **@github/copilot-sdk** (streaming, tools, SKILL.md)
- **pptxgenjs** (PPTX generation)
- **@fluentui/svg-icons** (color icons)

## Deployment (Azure Container Apps)

### Architecture

```
GitHub (push) → GitHub Actions → Bicep (infra) → Docker build → ACR push → Container App update
                     ↓
              OIDC 認証 (Federated Credential)
```

```
[Internet] → [EasyAuth (GitHub OAuth)] → [Container App (Next.js standalone)]
                                              ├── ACR (Docker image)
                                              ├── Log Analytics (logs)
                                              └── Container Apps Environment
```

### Azure リソース構成

| リソース | 名前 | 説明 |
|---------|------|------|
| Resource Group | `rg-copilot-sdk-agent` | 全リソースのコンテナ |
| Container Registry | `acrcopilotsdkagent` | Docker イメージ格納 (Basic SKU) |
| Log Analytics | `log-copilot-sdk-agent` | コンテナログ (30日保持) |
| Container Apps Env | `cae-copilot-sdk-agent` | マネージド実行環境 |
| Container App | `ca-copilot-sdk-agent` | アプリ本体 (0.5 vCPU / 1Gi) |

### Bicep テンプレート (`infra/main.bicep`)

ACR + Log Analytics + Container Apps Environment を IaC 管理。
Container App 自体は GitHub Actions で `az containerapp create/update` により作成・更新（初回はイメージが必要なため）。

### Dockerfile (3ステージビルド)

```
Stage 1 (builder): node:22 + pnpm → install → icon gen → next build --webpack
Stage 2 (deps):    node:22 + npm install --omit=dev → flat node_modules
Stage 3 (runner):  node:22-slim → standalone output + npm node_modules
```

**重要な設計判断:**
- **Webpack ビルド**: Turbopack は `serverExternalPackages` をハッシュ名で外部化し、ランタイムで解決できない。Webpack は元のパッケージ名を保持する。
- **npm flat node_modules**: pnpm の symlink 構造は standalone 出力で壊れる。deps ステージで npm install して flat な node_modules を作成。
- **Node.js 22**: Copilot SDK が `node:sqlite` (Node 22+) を必要とする。

### GitHub Actions ワークフロー

`.github/workflows/deploy-container-apps.yml`:
1. **Azure Login** — OIDC (Federated Credential、シークレット不要)
2. **Bicep Deploy** — インフラ作成/更新
3. **Docker Build & Push** — ACR にイメージ push (タグ: commit SHA + latest)
4. **Container App Create/Update** — 初回は create、以降は update

### GitHub Secrets

| Secret | 説明 |
|--------|------|
| `AZURE_CLIENT_ID` | Entra ID アプリ登録の Client ID (OIDC) |
| `AZURE_TENANT_ID` | Microsoft テナント ID |
| `AZURE_SUBSCRIPTION_ID` | Azure サブスクリプション ID |
| `APP_GITHUB_TOKEN` | Copilot SDK 認証用 GitHub トークン |
| `TAVILY_API_KEY` | Web 検索ツール API キー |

### Container App 環境変数

| 変数 | 値 | 備考 |
|------|-----|------|
| `NODE_ENV` | `production` | |
| `PORT` | `3000` | |
| `HOSTNAME` | `0.0.0.0` | EasyAuth ミドルウェアが 127.0.0.1 経由でアクセスするため必須 |
| `GITHUB_TOKEN` | (secret ref) | Copilot SDK 認証 |
| `TAVILY_API_KEY` | (secret ref) | Web 検索 |
| `MODEL_NAME` | `claude-opus-4.6` | AI モデル指定 |

### 認証 (GitHub OAuth / EasyAuth)

Container Apps の Built-in Authentication (EasyAuth) で GitHub OAuth を使用。

**設定方法:**
```bash
# 1. GitHub OAuth App を https://github.com/settings/developers で作成
#    Callback URL: https://<app-fqdn>/.auth/login/github/callback

# 2. EasyAuth 設定
az containerapp auth github update \
  --name ca-copilot-sdk-agent \
  --resource-group rg-copilot-sdk-agent \
  --client-id <CLIENT_ID> \
  --client-secret <CLIENT_SECRET> \
  --scopes "user:email" --yes

# 3. 未認証リダイレクト
az containerapp auth update \
  --name ca-copilot-sdk-agent \
  --resource-group rg-copilot-sdk-agent \
  --unauthenticated-client-action RedirectToLoginPage \
  --redirect-provider GitHub

# 4. 暗号化キー設定 (API version 2024-03-01 必須)
az containerapp secret set --name ca-copilot-sdk-agent \
  --resource-group rg-copilot-sdk-agent \
  --secrets "auth-encryption-key=<base64-key>" "auth-signing-key=<base64-key>"

az rest --method put --url ".../authConfigs/current?api-version=2024-03-01" \
  --body '{"properties":{"encryptionSettings":{
    "containerAppAuthEncryptionSecretName":"auth-encryption-key",
    "containerAppAuthSigningSecretName":"auth-signing-key"}}}'
```

### トラブルシューティング

| 問題 | 原因 | 解決 |
|------|------|------|
| `Cannot find package @github/copilot-sdk-<hash>` | Turbopack のハッシュ名外部化 | `next build --webpack` |
| `Cannot find package @github/copilot` | pnpm symlink が standalone で壊れる | npm flat node_modules (deps ステージ) |
| `node:sqlite not found` | Node 20 では未対応 | Node 22 に更新 |
| EasyAuth 500 (Connection refused) | Next.js が localhost のみリッスン | `HOSTNAME=0.0.0.0` |
| EasyAuth 500 (暗号化) | 暗号化キー未設定 | `auth-encryption-key` + `auth-signing-key` |
| `k.resolve is not a function` | バンドラーが require.resolve を破壊 | `serverExternalPackages` で外部化 |

### URL

- **本番**: https://ca-copilot-sdk-agent.purpleforest-32d23b77.japaneast.azurecontainerapps.io/
- **認証**: GitHub OAuth (EasyAuth)
