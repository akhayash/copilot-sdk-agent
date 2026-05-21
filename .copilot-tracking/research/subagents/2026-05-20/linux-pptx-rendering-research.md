# Linux PPTX レンダリング & 画像ベース生成パイプライン調査

調査日: 2026-05-20  
対象リポジトリ: `copilot-sdk-agent` (Next.js + pptxgenjs)  
デプロイ先: Azure Container Apps (Linux)

## 研究トピック / 質問

1. Linux で動く PPTX レンダリング検証手法（render PNG を出して元画像と比較するため）
2. 画像 → 編集可能 PPTX 変換の自動化手法（gpt-image-2 出力 → pptxgenjs コード）
3. Node.js エコシステムでの PPTX レンダ／検証ライブラリ
4. Azure Container Apps での LibreOffice 利用パターン

## 既存リポジトリ状況 (確認済み)

- `Dockerfile` ベースは `node:22-slim`（Debian-based / Linux）。`pptxgenjs` のみで PPTX 生成中、ネイティブ依存なし。
- PPTX 生成は `src/app/api/skills/pptx/route.ts` がメモリ内で実行し、ストリームでダウンロードさせる構成。
- PowerPoint COM (`pptx-from-image` 外部スキル) は Windows 専用なので採用不可。

---

## 1. Linux で動く PPTX レンダリング検証手法

| 手法 | レンダ品質 | Container 化 | 実装難易度 | コメント |
|---|---|---|---|---|
| **LibreOffice headless (`soffice --convert-to pdf` → `pdftoppm`)** | ◎ (実本家エンジン) | ◎ 確立済 | 中 | 2 段階変換が定番。Debian/Ubuntu に `libreoffice-impress` + `poppler-utils` を入れるだけ。`--convert-to png` は **1 ページ目しか出力されない既知制約**（Unix SE Q.268860）あり、PDF 経由が事実上の標準。 |
| **LibreOffice `--convert-to png`** | △ 1 枚目のみ | ◎ | 低 | 全スライド出力できないので不採用。 |
| **`libreoffice-convert` (npm wrapper)** | ○ | ○ | 低〜中 | 内部で `soffice` を spawn。Windows では bootstrap.ini エラーが既知（SO 64811076）が Linux Container では安定。`-env:UserInstallation` で並行実行時の lock 競合を回避必須。 |
| **`@matbee/libreoffice-converter` (WASM ビルド)** | △ 未成熟 | ◎ ネイティブ不要 | 高 | LibreOffice を WebAssembly 化。Node.js でも動く触れ込みだが、PPTX フィデリティ・パフォーマンス・メモリ消費が未検証。プロダクション利用報告少。 |
| **Apache POI (Java) ベースレンダラー** | ○ | △ JRE 必須 | 高 | Node.js から呼ぶには Java サブプロセスが必要。レンダリング (`XSLFSlide`→BufferedImage) は素の POI では限定的で、Aspose.Slides 等の商用ライブラリが現実解。 |
| **`python-pptx` + Pillow 自前 renderer** | × 自作 | ○ | 非常に高 | DrawingML を自前で解釈する必要があり工数膨大。フォント・図形・グラデーション・SmartArt を再現するのは非現実的。 |
| **レンダ検証を諦める（構造検証 + ユーザー目視のみ）** | — | — | 最低 | pptxgenjs は決定論的に XML を吐くので、**スライド数・要素タイプ・テキスト存在のみを assert** し、見た目はブラウザ上のプレビュー画像（後述のハイブリッド方式の "背景画像" 自身）でユーザーに確認させる方式が最も低コスト。 |

### 推奨

**「LibreOffice headless → PDF → pdftoppm → PNG」** を採用するなら必要最小依存:

- `libreoffice-impress`（Impress のみで OK、`libreoffice-full` だと 800MB+）
- `poppler-utils`（`pdftoppm`）
- 日本語フォント: `fonts-noto-cjk` または `fonts-ipafont`（既定では豆腐になる）

ただし**初期実装では「レンダ検証なし」を強く推奨**。理由は後述の §4（イメージサイズ・cold start 影響）と、ユーザー確認フローが既に gpt-image-2 のプレビュー画像で成立しているため、PPTX 再レンダ検証は冗長になりやすい。

---

## 2. 画像 → 編集可能 PPTX 変換の自動化手法

### 2.1 マルチモーダル LLM による構造抽出の現実性

参考: arXiv 2505.11604（"Efficient Slide Editing Agent with LLMs"）が gpt-4o に「元スライド画像 + ノート」を渡し編集品質を評価する手法を採用。同様のパターンは liamca/GPT4oContentExtraction が PPT→Markdown で実証済み。

- **精度**: gpt-4o / gpt-4.1 / Claude Sonnet クラスならタイトル・箇条書き・大まかなレイアウト（左右分割、図の位置）抽出は実用域。フォント色・サイズ・正確な座標は推定が不安定。
- **レイテンシ**: 1280x720 PNG 1 枚で ~3〜8 秒（モデル依存）。スライド 10 枚なら 30〜80 秒 → 並列化推奨。
- **コスト**: 画像 1 枚 ≒ 数百〜千トークン（detail=high で 1105〜2125 トークン）。10 枚で $0.05〜0.2 程度（gpt-4o-mini なら 1/10）。

### 2.2 アーキテクチャ選択肢

| アプローチ | 編集可能性 | フィデリティ | 実装難易度 | 推奨度 |
|---|---|---|---|---|
| **A. 純テキスト抽出 → pptxgenjs 再構築** | ◎ 全要素編集可 | △ デザインは別物 | 中 | 既存パイプラインそのまま。デザイン参考にならない。 |
| **B. 画像を background に貼って "そのまま" 出す** | ✗ テキスト編集不可 | ◎ 見た目完全 | 最低 | お客様が編集できない問題が残る。プロトタイプには良い。 |
| **C. ハイブリッド：画像を半透明背景 + AI が推定したテキスト要素を pptxgenjs で上から重ねる** | ◎ テキスト編集可 | ○ 見た目近似 | 中 | **推奨**。`set_scenario` で既に持っている `title/bullets/notes` を再利用し、座標だけ LLM に推定させる。 |
| **D. 画像を背景に貼り、その上に "透明テキストボックス" を OCR/LLM 推定座標で重ねる** | ◎ 完全に編集可 | ◎ 見た目完全 | 高 | バウンディングボックス推定が外れると編集時にズレる。OCR (Azure Document Intelligence) と組合せると精度上がる。 |

### 2.3 推奨：方式 C（ハイブリッド・半透明背景 + 構造化テキストオーバーレイ）

理由:
- `set_scenario` ツールで AI は既に **構造化スライドデータ**（title/bullets）を持っている → LLM に再度画像から抽出させる必要なし
- gpt-image-2 が生成した画像を `slide.background = { data: base64 }` で背景に置き、その上から既存 `bullets`/`title` を **透過的に重ねる**（位置は layout（title/two-column/etc.）から決まる固定座標）
- これで「デザイン参考画像 + 完全に編集可能なテキスト」が両立。**LLM 再呼び出し不要**で安価・高速。

### 2.4 @github/copilot-sdk の画像入力サポート（確認済み）

公式ドキュメント `docs.github.com/en/copilot/how-tos/copilot-sdk/use-copilot-sdk/image-input` より:

- **対応済み**。`attachments: [{ type: "file", path }]` か `{ type: "blob", data: base64, mimeType }` で送信可能
- 自動 base64 エンコード・自動リサイズあり
- `capabilities.supports.vision = true` のモデルのみ可（gpt-4o, gpt-4.1, Claude 系）
- PNG / JPEG / GIF サポート、**SVG 非対応**
- リポジトリの `src/app/components/chat/model-selector.tsx` で選択中のモデル（Claude Opus, Sonnet, GPT-4.1, GPT-4o, o3-mini）はいずれも vision 対応

つまり「ユーザーが画像をチャットに添付 → AI が画像を見て pptxgenjs コード生成」フローは SDK 側で実装可能。ただし §2.3 の理由から **画像から再抽出する必要性は低い**。

---

## 3. Node.js エコシステムでの PPTX レンダ／検証ライブラリ

| ライブラリ | 用途 | メンテ状況 | コメント |
|---|---|---|---|
| **pptxgenjs** | 生成 | ◎ 活発 | 既採用。最も成熟。 |
| **officegen / officegen3** | 生成 | △ 古い | API は古く、pptxgenjs より機能少。乗り換え動機なし。 |
| **heavysixer/node-pptx** | 生成・編集 | × メンテ停止 (5+ 年) | "well-tested" を謳うが README のみ。プロダクション利用非推奨。 |
| **libreoffice-convert** | 変換 (pptx→pdf 等) | ○ | LibreOffice バイナリへの薄い wrapper。Linux Container で安定。 |
| **pdf-poppler / pdf2pic** | PDF → PNG | ○ | `pdftoppm` (poppler) 経由。pdf2pic は GraphicsMagick 依存もあるので pdf-poppler の方が薄い。 |
| **node-pptx-parser / pptx-parser** | 読み取り | △ | XML パースのみ。レンダリングはしない。構造検証用途には使える。 |
| **PptxGenJS の `pptx.write({outputType: 'nodebuffer'})`** | バイナリ生成 | ◎ | 既に使用中。検証は別途必要。 |

### 結論

**Node.js 単体で PPTX をレンダする道は事実上ない**。サムネ生成はサブプロセスで LibreOffice (or 商用 API) を呼ぶしかない。

---

## 4. Azure Container Apps での LibreOffice 利用パターン

### 4.1 イメージサイズへの影響

| パッケージ構成 | 増分サイズ目安 |
|---|---|
| `libreoffice-impress` のみ | +400〜500 MB |
| `libreoffice` (全部入り) | +800 MB〜1 GB |
| `poppler-utils` | +5 MB |
| `fonts-noto-cjk` | +60〜100 MB |
| `fonts-ipafont` | +30 MB |

現在の `node:22-slim` ベース（〜200 MB）に追加すると **600 MB〜1 GB** のイメージになる。Azure Container Apps では問題ない範囲だが、後述 cold start に影響。

### 4.2 Cold start への影響

Microsoft Learn の "Reducing cold-start time on Azure Container Apps" によれば、cold start 時間の主因は:

1. **イメージプル時間**（リージョン内 ACR 推奨）
2. アプリケーション初期化

LibreOffice 本体は実行時 spawn なので Node.js 起動自体は遅くならないが、**初回 `soffice` 呼び出し**で UNO bootstrap が走り **3〜10 秒**かかる。対策:

- Container 起動時にダミー変換（`echo "" | soffice --headless --convert-to pdf /dev/stdin`）でウォームアップ
- `--env:UserInstallation=file:///tmp/lo-profile-<uuid>` で同時実行時のプロファイルロック衝突を防ぐ
- `minReplicas: 1` で scale-to-zero を避ける（コスト増だが UX 向上）

### 4.3 Dockerfile への追記例（採用する場合）

現状の `Dockerfile` の runner stage に以下を追加:

```dockerfile
# --- Runner stage ---
FROM node:22-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-impress \
    poppler-utils \
    fonts-noto-cjk \
    fonts-ipafont \
    && rm -rf /var/lib/apt/lists/*

# (以降は既存のまま)
```

### 4.4 Node.js からの呼び出しパターン

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileP = promisify(execFile);

async function pptxToPngs(pptxPath: string, outDir: string) {
  // 1. PPTX → PDF
  await execFileP("soffice", [
    "--headless",
    "--convert-to", "pdf",
    "--outdir", outDir,
    `-env:UserInstallation=file:///tmp/lo-${process.pid}-${Date.now()}`,
    pptxPath,
  ], { timeout: 60_000 });

  // 2. PDF → PNG (1 枚 / スライド)
  const pdfPath = pptxPath.replace(/\.pptx$/, ".pdf");
  await execFileP("pdftoppm", [
    "-png", "-r", "150",
    pdfPath, `${outDir}/slide`,
  ]);
}
```

---

## 5. 推奨アーキテクチャ（最小実装優先）

### フェーズ A: render 検証なし（**まずこちらから着手推奨**）

1. **gpt-image-2 でスライド画像生成** → Azure Foundry の Image API (`/openai/v1/images/generations` または `/edits`) を `src/infrastructure` 配下に新規 adapter として追加
2. **画像を Web UI でプレビュー** → 既存の `slide-panel.tsx` を拡張し、スライドごとに画像サムネ + テキスト編集欄を表示。再生成ボタンで画像のみ再リクエスト
3. **PPTX 生成時にハイブリッド方式 (§2.3-C)** → `pptxgen-adapter.ts` で `slide.background = { data: base64 }` に画像を貼り、`title/bullets/notes` を既存 layout の固定座標で重ねる
4. **検証はユーザー目視 + 構造 assert のみ**（pptx-parser で「スライド数 = N、各スライドに title が存在」程度）

### フェーズ B: render 検証を後付け（任意・後回し可）

- LibreOffice + poppler を Dockerfile に追加
- 生成後の PPTX を PDF → PNG にレンダ
- 元画像（gpt-image-2 出力）との差分を **perceptual hash (`sharp` の `phash` 等)** で比較し、閾値超過時にユーザーに警告

### 必要な追加パッケージ（フェーズ A）

```jsonc
// package.json devDependencies / dependencies
{
  "openai": "^4.x",                  // Azure OpenAI Image API 呼び出し用（既に Foundry 経由なら不要）
  "sharp": "^0.33.x",                // 画像リサイズ / フォーマット変換（オプション）
  "pptx-parser": "^1.x"              // 構造検証用（オプション）
}
```

`@github/copilot-sdk` は **既存のままで OK**（vision 対応モデル選択で画像入力可）。

### 必要な環境変数（フェーズ A）

```sh
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
AZURE_OPENAI_API_KEY=<key>            # or Managed Identity
AZURE_OPENAI_IMAGE_DEPLOYMENT=gpt-image-1   # Foundry のデプロイ名
```

### Dockerfile 変更（フェーズ A）

**変更なし**。LibreOffice を入れる必要があるのはフェーズ B のみ。

---

## 6. 参考リンク

### 公式ドキュメント
- Copilot SDK 画像入力: https://docs.github.com/en/copilot/how-tos/copilot-sdk/use-copilot-sdk/image-input
- Azure Container Apps cold start: https://learn.microsoft.com/en-us/azure/container-apps/cold-start
- GPT-image-1 Azure Foundry: https://github.com/LazaUK/AIFoundry-GPT-image-1-Editing

### GitHub リポジトリ
- pptxgenjs: https://github.com/gitbrent/PptxGenJS
- libreoffice-convert (Node wrapper): https://github.com/elwerene/libreoffice-convert
- pptx2pdf (libreoffice + imagemagick): https://github.com/jbastias/pptx2pdf
- liamca/GPT4oContentExtraction（多モーダル LLM での文書→Markdown 抽出参考）: https://github.com/liamca/GPT4oContentExtraction

### 関連記事
- "How to Run LibreOffice in Docker for Document Conversion" (oneuptime.com)
- arXiv 2505.11604 "Efficient Slide Editing Agent with Large Language Models"

---

## 7. 残課題 / フォローアップ質問

研究中に発見した、ユーザー判断が必要な事項:

- [ ] **方式 C と D のどちらを採用するか**: 「半透明背景 + 構造化テキスト」(C) でデザイン参考度が十分か、それとも「画像背景 + LLM 推定座標オーバーレイ」(D) までやるか
- [ ] **scale-to-zero 許容か**: LibreOffice を入れるなら cold start +5〜10 秒。フェーズ A では問題にならないが、フェーズ B で `minReplicas: 1` にする必要があれば月コストが上がる
- [ ] **gpt-image-2 の入力**: スライド生成時のプロンプトに「ロゴ・配色・テンプレート画像」を含めるか（含めると `images/edits` API + reference image が必要）
- [ ] **品質検証の閾値**: フェーズ B の perceptual hash 比較で、どの程度の差分を許容するか（社内合意が必要）

研究範囲外として保留:

- 商用 SaaS (Aspose.Slides Cloud, GroupDocs Conversion) の採用検討 — 価格交渉やセキュリティレビューが必要
- Apache POI + JRE による Java サブプロセス方式 — Node.js プロジェクトには重量級すぎるので除外

## ステータス

**Complete** — 当初の研究トピック 4 つに対する選択肢比較・推奨構成・追加パッケージ／Dockerfile 変更案を提示済み。
