<!-- markdownlint-disable-file -->
# Option B 実装可能性研究 — pptx-from-image フルパイプライン Linux 移植

調査日: 2026-05-20
対象: `copilot-sdk-agent`（Next.js 16 + TypeScript + pptxgenjs 3.12 + Azure Container Apps Linux / `node:22-slim`）
研究方針: 参考 SKILL `pptx-from-image`（Windows + PowerPoint COM + Python）を **Linux + Node/TS** に丸ごと移植する Option B のフィージビリティ検証

入力資料:
- メイン研究: .copilot-tracking/research/2026-05-20/image-pptx-skill-research.md
- 先行 Linux 研究: .copilot-tracking/research/subagents/2026-05-20/linux-pptx-rendering-research.md
- 参考 SKILL 本体: `C:\Users\akhayash\AppData\Local\Temp\pptx-from-image-ref\SKILL.md`
- 参考 SKILL findings: `C:\Users\akhayash\AppData\Local\Temp\pptx-from-image-ref\findings.md`
- リポ構造: AGENTS.md / Dockerfile / package.json / infra/main.bicep

---

## エグゼクティブサマリ

**全体評価: GO with caveats**

技術スタックは Linux + Node/TS で組み立て可能だが、参考 SKILL の哲学（「人間が目視ループで品質を上げる」+ 「無いものは差分にしか出ない」）と、本リポの想定 UX（チャットから数秒〜数十秒で PPTX ダウンロード）に大きな乖離がある。**「参考 SKILL の品質ゲートをそのまま自動化する」のは現実的でなく、参考 SKILL のうち再利用するのは layout.json schema、z-order convention、`auto_shape RECTANGLE` で線を描くなどの "renderer 側の知見" に絞り込むのが妥当**。

### 主要リスク Top 3（と緩和策）

| # | リスク | 緩和策 |
|---|---|---|
| 1 | bbox 抽出の精度・非決定性（findings.md `gpt-4o` で同一画像 25–37 elements ばらつき）— 自動採用判定が成り立たない | 既定は **方式 C（半透明背景 + 構造化テキスト固定座標オーバーレイ）**。bbox 抽出は採用判定の "数値ゲート" には使わず、画像はあくまでデザイン参考。Option B は variant 2（高忠実度モード）として opt-in |
| 2 | LibreOffice headless cold start 3–10 秒 / イメージ +500MB / 並行実行時の UNO bootstrap 競合 | `-env:UserInstallation=file:///tmp/lo-<pid>-<ts>` を毎回付与、`minReplicas: 1` + 起動時 warm-up、レンダ検証は **同期 UX のクリティカルパスから外す**（バックグラウンド job 化） |
| 3 | Container Apps の `/tmp` 容量・メモリ制約。`_tmp_*` が瞬時に GB 級になる参考 SKILL の運用知見が、ephemeral storage では破綻 | 全中間生成物を per-request の作業ディレクトリ `/tmp/job-<uuid>/` に閉じ込め、レスポンス後に `rm -rf`。生成画像と最終 PPTX のみ Blob/in-memory cache に残す |

### 推奨技術スタック（確定）

| 層 | 採用 |
|---|---|
| 画像生成 | **gpt-image-2 on Azure Foundry**（既存メイン研究のまま）|
| bbox 抽出 | **GPT-4o-vision / Claude vision via Copilot SDK が一次**、`sharp` での色 mask は精緻化用の補助（ハイブリッド方式 A4） |
| PPTX 生成 | **pptxgenjs**（既存）+ `sharp.extract()` で picture crop |
| PPTX → PNG レンダ | **LibreOffice headless（`libreoffice-impress`） + `pdftoppm`（`poppler-utils`） + `fonts-noto-cjk`** を Dockerfile runner stage に追加。Node からは `child_process.execFile` |
| 画像 diff | **`pixelmatch`（pixel diff / antialiasing 吸収済み） + `sharp-phash`（perceptual hash 補助）** のダブル指標 |
| 並行制御 | per-request UNO profile + in-process p-queue（同時 1〜2 並列）|
| キャッシュ | in-memory `Map<jobId, Buffer>` で MVP 完結、スケール時に Blob Storage |

---

## A. bbox 抽出戦略

### A.1 比較表

| 候補 | (a) 実装難度 | (b) 精度 | (c) ランタイムコスト | (d) Container Apps 動作 | 備考 |
|---|---|---|---|---|---|
| **1. GPT-4o / Claude vision (Copilot SDK 経由)** | 低 — `attachments: [{ type: "blob", data, mimeType }]` で渡すだけ。`@github/copilot-sdk` は image-input 公式サポート（linux-pptx-rendering-research.md §2.4） | △〜○ — 大まかな bbox（左右分割、図の位置、タイトル領域）は実用域。**正確な座標・色・サイズは非決定的**（findings.md `gpt-4o` 25–37 elements ばらつき、temperature=0 でも非決定） | 1280×720 PNG 1 枚 ≒ 1100–2125 トークン (detail=high)。**3〜8 秒/枚**、10 枚で 30–80 秒（並列化前提） | ○ ネットワーク呼び出しのみ、container にネイティブ追加なし | findings.md の教訓: **multi-pass merge（best-of ではなく統合）必要**。1 pass では取りこぼし多発 |
| **2. `sharp` + 自前 pixel mask** | 中 — `sharp` は raw pixel buffer 取得可能、HSV 変換は手書きが必要（sharp 標準は RGB/CMYK） | ○（既知色） — 参考 SKILL の `cv2` HSV mask 相当は再現可能だが、cv2 の `findContours` 相当が無いため bbox 抽出ロジックを自作 | <100 ms/枚、CPU のみ | ◎ 既に `sharp ^0.34.5` が dependencies | gpt-image-2 の生成画像は色パレットが事前確定していない → mask 閾値の動的調整が必要。dense slide には弱い |
| **3. `@u4/opencv4nodejs` / `jimp`** | 高（opencv4nodejs）〜中（jimp） — opencv4nodejs は **ネイティブビルド必須**（`libopencv-dev` を Debian に入れる必要、cold start 増・イメージ +200MB）。jimp は pure JS で OpenCV 機能の一部のみ | ○（OpenCV）／△（jimp） | OpenCV は cv2 同等の精度／速度、jimp は遅く API も限定 | △ opencv4nodejs は Container Apps で **arch 不一致 / node-gyp ビルド失敗のリスク**（公知 issue 多数）、jimp は ◎ pure JS | opencv4nodejs は最終更新 1+ 年前のバージョンも残り、メンテ不安定。**採用非推奨** |
| **4. ハイブリッド: vision で荒い bbox → `sharp` で edge refine** | 中（候補 1 + 2 の合成） | ○ — vision の "ここに card がある" 情報を seed に、`sharp` で実際の pixel 境界を厳密化 | 候補 1 + <100ms | ◎ 既存依存のみ | **本研究の推奨**。findings.md の non-determinism リスクを seed-and-refine で吸収 |

### A.2 推奨

**短期（フェーズ A）: 候補 1（vision のみ、荒い bbox で十分）を採用し、bbox は "デザイン参考表示のための補助情報" として扱う**。採用判定の数値ゲートには使わない（findings.md の教訓: bbox の数値精度は LLM が安定して出せない）。

**中期（フェーズ B）: 候補 4（ハイブリッド）に拡張**。色パレット既知の "AI 生成画像" 限定なら sharp の mask が効きやすい。具体的には:

```ts
// 1. vision で "card_top_left" 等の役割と荒い bbox を取得
// 2. sharp で当該領域の dominant color を抽出 (sharp.stats() / extract().raw())
// 3. その色で全体に mask をかけ、findBoundingBox を自作（ピクセル走査）
```

`findings.md` で「**pixel 計測してから layout を書くのが圧倒的に速い**」と明記されているのは Python + cv2 を前提とした人手フロー。本リポでは UX の前提が違うので、人手介入を伴わない自動 bbox は **方式 C（後述 D 節）で固定座標オーバーレイにすることで bbox 推定そのものを回避**する戦略が最も妥当。

---

## B. LibreOffice headless + poppler-utils の Linux Docker 統合

### B.1 必要パッケージと最終イメージサイズ

linux-pptx-rendering-research.md §4.1 を踏襲・確認:

| パッケージ | 増分 | 必須度 |
|---|---|---|
| `libreoffice-impress` | +400〜500 MB | ◎ Impress 単体で OK（`libreoffice-full` は不要） |
| `poppler-utils` | +5 MB | ◎ `pdftoppm` |
| `fonts-noto-cjk` | +60〜100 MB | ◎ 日本語豆腐回避 |
| `fonts-ipafont` | +30 MB | △ 任意（Noto と重複） |

現状 `node:22-slim` ベース（〜200 MB）に対し **+500〜700 MB**、最終イメージ約 **700 MB〜1 GB**。Container Apps の image pull は基本問題ない範囲。

### B.2 Cold start インパクト

- 起動自体は Node.js 単独 → LibreOffice は実行時 spawn なのでアプリ起動時間に影響なし
- **初回 `soffice` 呼び出し: 3〜10 秒**（UNO bootstrap、findings.md 関連知見はないが OSS 経験則）
- 対策（推奨）:
  - **コンテナ起動時に warm-up**: 起動スクリプトで空 PPTX をダミー変換し UNO を pre-init
  - **`minReplicas: 1`** で scale-to-zero を回避
  - **メモリ常駐は不可**（`soffice --headless` は呼び出しごとにプロセス起動）。デーモンモード `soffice --accept=...` で port listener を立てる手はあるが、Node から UNO API を直接叩くには `node-uno` 等が必要で、本リポの規模では over-engineering

### B.3 並行実行時の UNO bootstrap 競合（**重要**）

`soffice` は同一ユーザープロファイルを排他的に lock する。**並行 spawn すると 2 つ目以降が "another OpenOffice.org process is using the user installation" で失敗する**。これは Docker container 内でも同様。

対策（必須）:

```ts
const profileUrl = `file:///tmp/lo-${process.pid}-${randomUUID()}`;
await execFile("soffice", [
  "--headless",
  `-env:UserInstallation=${profileUrl}`,
  "--convert-to", "pdf",
  "--outdir", outDir,
  pptxPath,
], { timeout: 60_000 });
// 終了後 rm -rf profileUrl
```

加えて、**Node アプリ側でキュー化**（例: `p-queue` で concurrency 1〜2）して同時実行数を物理的に制限することを強く推奨。Container Apps の CPU/メモリが小さい場合（1 vCPU / 2GiB）2 並列でも厳しい。

### B.4 Node.js から呼ぶ実装パターン

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const execFileP = promisify(execFile);

export async function renderPptxToPngs(
  pptxPath: string,
  opts: { dpi?: number; timeoutMs?: number } = {}
): Promise<string[]> {
  const { dpi = 150, timeoutMs = 60_000 } = opts;
  const workDir = await mkdtemp(path.join(tmpdir(), "pptx-render-"));
  const profileUrl = `file://${workDir}/lo-profile`;

  try {
    // 1. PPTX → PDF
    await execFileP("soffice", [
      "--headless",
      `-env:UserInstallation=${profileUrl}`,
      "--convert-to", "pdf",
      "--outdir", workDir,
      pptxPath,
    ], { timeout: timeoutMs });

    const pdfPath = path.join(
      workDir,
      path.basename(pptxPath).replace(/\.pptx$/i, ".pdf")
    );

    // 2. PDF → PNG (slide-1.png, slide-2.png, ...)
    await execFileP("pdftoppm", [
      "-png",
      "-r", String(dpi),
      pdfPath,
      path.join(workDir, "slide"),
    ], { timeout: timeoutMs });

    // 3. ファイル列挙
    const { readdir } = await import("node:fs/promises");
    const files = (await readdir(workDir))
      .filter((f) => f.startsWith("slide-") && f.endsWith(".png"))
      .sort()
      .map((f) => path.join(workDir, f));
    return files;
  } finally {
    // 呼び出し側で workDir を後始末する想定なら finally を外す
  }
}
```

注意:
- `path.join(workDir, "slide")` を `prefix` に渡すと `slide-1.png`, `slide-2.png` ... が生成される（pdftoppm 仕様）
- **timeout は必須**（LibreOffice はフォント探索などでハングし得る）
- 戻り値はファイルパス。呼び出し側で `sharp(filePath)` で読む

### B.5 解像度（pdftoppm `-r` 推奨値）

| dpi | 1920×1080 スライド 1 枚の PNG サイズ目安 | 用途 |
|---|---|---|
| 96  | ~480 KB | プレビュー |
| **150** | ~1.2 MB | **品質ゲート用に推奨**（参考 SKILL の `local_visual_compare.py` も 150 相当） |
| 200 | ~2 MB | 高精度比較 |
| 300 | ~4 MB | 印刷用、本用途ではオーバースペック |

gpt-image-2 の生成画像が 1024×1024 or 1536×1024 程度なら、**150 dpi で揃えてから `sharp.resize()` で両者を同じ width にして diff** が安全。

### B.6 失敗モードと対処

| 失敗モード | 兆候 | 対処 |
|---|---|---|
| **タイムアウト** | `Error: ETIMEDOUT` | `execFile` の `timeout`、加えて `kill_signal: 'SIGKILL'` を指定。failed job は user に "PPTX 生成は成功、レンダ検証はスキップ" として返す |
| **フォント不足** | render PNG で日本語が豆腐 ▯ になる | `fonts-noto-cjk` を Dockerfile で確実に入れる。アプリ起動時に `fc-list | grep -i noto` で sanity check |
| **メモリ OOM** | container restart | `soffice` 起動で 200–400 MB、並行 2 つで 800 MB。**Container Apps の最小推奨 2 GiB**。OOM はキュー concurrency=1 に下げて回避 |
| **UNO profile lock** | 2 つ目の soffice が即時失敗 | B.3 の per-PID profile を必ず付与 |
| **PDF 1 ページのみ** | 全スライドの代わりに 1 枚目だけ出る | `libreoffice-convert` の `--convert-to png` を **使わない**（linux-pptx-rendering-research.md §1 既知制約）。PDF 経由必須 |

### B.7 Container Apps の image pull / start レイテンシ

- Microsoft Learn "Reducing cold-start time on Azure Container Apps" より:
  - イメージ pull は同一リージョン ACR で **<10 秒（〜200MB）**、**+10〜15 秒（〜1GB）**
  - 1GB image の pull は warm な node で初回のみコスト発生、以降キャッシュ
- 本リポは既に ACR (`acr${appName}`) 使用済み（infra/main.bicep）。同一リージョン配置なら問題なし
- `minReplicas: 1` 推奨（前述 B.2）

---

## C. Sharp による画像 diff（perceptual hash / pixel diff）

### C.1 npm 候補比較

| ライブラリ | 用途 | メンテ | 採用 |
|---|---|---|---|
| **`pixelmatch`** (Mapbox, 5k+ stars, 活発) | pixel-level diff、anti-aliasing 検出組み込み | ◎ | **◎ 主指標** |
| **`pixelmatch-mb`** (modern fork, ESM) | pixelmatch の TS/ESM 化 | ○ | ESM 統一なら検討 |
| **`sharp-phash`** | sharp 経由の perceptual hash（DCT 8x8 hash）| ○ active | **○ 補助指標**。Hamming distance を取る |
| `imghash` (`pwlmc/imghash`) | Promise-based pHash | ○ | sharp-phash の代替 |
| `blockhash-core` | block-mean hash | △ 古い | 非推奨 |
| `phash-im` | ImageMagick 必須 | △ ネイティブ依存 | 非推奨 |
| `sharp` 単体 | phash 機能なし | — | **NG**（perceptual hash は別ライブラリ必要） |

### C.2 採用方針: **ダブル指標**

参考 SKILL の `diff_pixel_ratio <= 0.15` は「antialiasing 込みで pixel が何 % ずれているか」の指標。**pixelmatch の `includeAA=false`（既定）でこの値に近い数字が出る**。

一方、gpt-image-2 の生成画像と LibreOffice render PNG は **antialiasing パターンが大きく異なる**（同じ図形でもエッジの blur が違う）。pixel diff だけだと過大評価される可能性が高い。

→ **pHash の Hamming distance（perceptual 類似度）を併用**して、構造的類似度を補助指標にする。

### C.3 サンプルコード（参考 SKILL の閾値を JS で再現）

```ts
import sharp from "sharp";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
// import pHash from "sharp-phash"; // 別途 install

export interface QualityMetrics {
  diffPixelRatio: number;      // 0.0 - 1.0  (参考 SKILL と同義)
  diffPixelCount: number;
  totalPixels: number;
  width: number;
  height: number;
  renderResizedForDiff: boolean;
  phashHammingDistance?: number; // 0 - 64 (lower = similar)
}

export async function compareImages(
  originalPath: string,
  renderedPath: string
): Promise<QualityMetrics> {
  // 1. 両者を同じ解像度に揃える（render を original に合わせる）
  const origMeta = await sharp(originalPath).metadata();
  const w = origMeta.width!;
  const h = origMeta.height!;

  const renderResized = await sharp(renderedPath)
    .resize(w, h, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const origRaw = await sharp(originalPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const renderRaw = await sharp(renderedPath)
    .resize(w, h, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const diff = new PNG({ width: w, height: h });
  const diffCount = pixelmatch(
    origRaw.data, renderRaw.data, diff.data,
    w, h,
    {
      threshold: 0.1,        // pixelmatch 既定。色差感度
      includeAA: false,      // anti-aliased pixel は差分から除外
      alpha: 0.1,
      diffMask: false,
    }
  );

  return {
    diffPixelRatio: diffCount / (w * h),
    diffPixelCount: diffCount,
    totalPixels: w * h,
    width: w,
    height: h,
    renderResizedForDiff: true, // 上で resize した
    // phashHammingDistance は別途
  };
}

// 判定
export function evaluateQuality(m: QualityMetrics): "pass" | "warn" | "fail" {
  if (m.diffPixelRatio <= 0.12) return "pass";
  if (m.diffPixelRatio <= 0.15) return "warn";
  return "fail";
}
```

`renderResizedForDiff = true` は参考 SKILL では NG 条件だが、本リポでは **元 = gpt-image-2 出力 / render = LibreOffice 出力で物理的にアスペクト/解像度が違う前提**なので、resize 必須 → 参考 SKILL の "数値比較に意味がない" は当てはまらない（同一スライドの 2 つの rendition の比較である点が違う）。**閾値は実測で再キャリブレーション必要**。

### C.4 perceptual hash と pixelmatch の使い分け

| 指標 | 強み | 弱み | 用途 |
|---|---|---|---|
| **pixelmatch (diff_pixel_ratio)** | 局所的な欠落・位置ズレを検出。anti-aliasing は除外可能 | アスペクト違い / フォント antialiasing 差で過大評価 | **構造欠損検出**（card 抜け、テキスト消失） |
| **pHash Hamming distance** | 大局的な構造類似性。回転・サイズ変化に頑健 | 局所欠損を見落とす（パターン全体が似ていればパス） | **総合フィデリティ判定** |

**両方計算し、両方がしきい値超過の時のみ "fail"** とする方が安定する見込み（仮説、実測で検証要）。

---

## D. pptxgenjs での picture crop 配置と layout.json schema

### D.1 sharp で crop した Buffer を pptxgenjs に渡す

`pptxgenjs` v3.12 は `addImage({ data: "data:image/png;base64,..." | "..." })` または `{ data: Buffer }` をサポート。Node 環境では Buffer 直渡しが最効率。

```ts
import sharp from "sharp";
import pptxgen from "pptxgenjs";

// 元画像 1024×1024 から右上のアイコン領域を crop
const cropBuf = await sharp("source.png")
  .extract({ left: 700, top: 50, width: 250, height: 250 })
  .png()
  .toBuffer();

slide.addImage({
  data: `data:image/png;base64,${cropBuf.toString("base64")}`,
  x: 8.5, y: 0.5, w: 1.0, h: 1.0,  // inches (slide-relative)
});
```

注意点:
- pptxgenjs は **`data` プロパティに Buffer 直渡しを公式サポートしていない**（型定義は `string`）。base64 化して `data:image/png;base64,...` の data URL 形式で渡すのが安全
- 大量画像で base64 化のメモリ膨張に注意。10MB の PNG なら base64 後 13MB

### D.2 layout.json schema（参考 SKILL 準拠 + 本リポ向け軽量化）

参考 SKILL の schema は freeform / table / chart も含み複雑。**MVP では textbox / auto_shape / line / picture の 4 種に絞る**。

```ts
// src/domain/entities/slide-layout.ts (新規)
export type LayoutElementType =
  | "textbox"
  | "auto_shape"
  | "line"
  | "picture";

export interface LayoutBBox {
  x: number;       // slide-relative 0.0 - 1.0
  y: number;
  w: number;
  h: number;
}

export interface LayoutElement {
  id: string;            // 一意 (regex: ^[a-z0-9_-]+$)
  type: LayoutElementType;
  bbox: LayoutBBox;
  z: 1 | 2 | 3 | 4;      // 参考 SKILL z-order convention
  // type-specific:
  text?: string;
  textStyle?: {
    fontFace?: string;
    fontSize?: number;   // pt
    color?: string;      // hex
    bold?: boolean;
    align?: "left" | "center" | "right";
  };
  shape?: "rect" | "roundRect" | "ellipse" | "pill";
  fill?: string;         // hex
  stroke?: {
    color: string;
    widthPt: number;
    dash?: "solid" | "dash" | "dot" | "dash_dot";
  };
  // picture-specific (源画像からの crop):
  source?: {
    imageId: string;     // 親画像参照
    cropPx: { left: number; top: number; width: number; height: number };
  };
}

export interface SlideLayout {
  slideId: string;
  size: { width: number; height: number };  // inches, e.g. {10, 5.625} for 16:9
  background?: { color?: string; image?: string };
  elements: LayoutElement[];
}
```

### D.3 EMU 単位変換とスライド座標系

- **pptxgenjs は inches を使う**（PPT 内部の EMU = inches × 914400）
- **画像 px ↔ スライド inch のマッピング**:

```ts
// gpt-image-2 出力 1536×864 (16:9)、PPT スライド 10" × 5.625" (16:9)
const SLIDE_W_IN = 10;
const SLIDE_H_IN = 5.625;
const IMG_W_PX = 1536;
const IMG_H_PX = 864;

function pxToInchX(px: number) { return (px / IMG_W_PX) * SLIDE_W_IN; }
function pxToInchY(px: number) { return (px / IMG_H_PX) * SLIDE_H_IN; }

// bbox = layout.json の slide-relative (0-1)
function placeElement(slide: pptxgen.Slide, el: LayoutElement) {
  const x = el.bbox.x * SLIDE_W_IN;
  const y = el.bbox.y * SLIDE_H_IN;
  const w = el.bbox.w * SLIDE_W_IN;
  const h = el.bbox.h * SLIDE_H_IN;
  switch (el.type) {
    case "textbox":
      slide.addText(el.text!, { x, y, w, h, ...mapTextStyle(el.textStyle) });
      break;
    case "auto_shape":
      slide.addShape(mapShape(el.shape!), {
        x, y, w, h,
        fill: el.fill ? { color: el.fill } : undefined,
        line: el.stroke ? mapStroke(el.stroke) : undefined,
      });
      break;
    case "picture":
      // sharp で crop してから渡す（D.1）
      break;
    case "line":
      // pptxgenjs の line は addShape("line") か、参考 SKILL D に倣い
      // 厚み 0.0016" 程度の薄い RECTANGLE を使うのが安定（theme 干渉なし）
      slide.addShape("rect", { x, y, w, h: 0.0016, fill: { color: el.stroke!.color } });
      break;
  }
}
```

### D.4 z-order の pptxgenjs での扱い

**pptxgenjs では `addX` の呼び出し順 = z-order（後から add した方が上）**。layout.elements を `z` 昇順にソートしてから add すれば、参考 SKILL の z=1〜4 convention をそのまま再現できる。

```ts
const sorted = [...layout.elements].sort((a, b) => a.z - b.z);
for (const el of sorted) placeElement(slide, el);
```

### D.5 参考 SKILL から継承する renderer 知見

| 参考 SKILL の知見 | 本リポでの対応 |
|---|---|
| line が theme で消える → `auto_shape RECTANGLE` 0.0016" 厚みで描く | D.3 のサンプル通り採用 |
| 負の bbox 幅・高さで PPTX が壊れる | layout 受領時に zod / 手書き validator で `w > 0 && h > 0` を assert |
| アイコン crop padding を要素ごとに調整 | `source.cropPx` に padding を含めて渡す方式に集約（参考 SKILL の `crop_padding_px` は自動切り出し用なので、本リポでは LLM/ハイブリッドが crop 座標を直接指定する設計） |
| 同一 ID が重複すると label が二重に出る | layout validator で `unique(id)` を assert |
| picture の `transparent_background` | `sharp` で `.removeAlpha()` / `.flatten()` 等で代替可能（ただし MVP では透過処理スキップ推奨） |

---

## E. リアルタイム性とワークフロー

### E.1 参考 SKILL「目視ループ」の本リポ UX への翻訳

参考 SKILL の前提:
- **ワークフローは人手ループ**で 1 周 5〜15 分 × 3 周以上
- variant search で 5〜15 個候補を回す
- `view side-by-side.png` を Copilot CLI が直接確認

本リポの前提:
- チャット UI で **数十秒〜数分でスライドプレビュー → PPTX ダウンロード**
- 「目視ループ」を人間が回す時間がない（少なくとも完全自動モードでは）

### E.2 推奨ワークフロー（3 段階）

```text
[1] gpt-image-2 で画像生成 (5-10 秒/枚 × N)
       ↓ (SSE で SlideWork に逐次反映)
[2] 画像 → 編集可能 PPTX 化（**自動**）
       ├─ 方式 C (デフォルト): 半透明背景 + 固定座標オーバーレイ
       └─ 方式 B' (opt-in): vision で layout 抽出 → pptxgenjs 再構築
       ↓
[3] 自動品質ゲート（LibreOffice render → pixelmatch + pHash）
       ├─ pass → 「PPTX ダウンロード」ボタンが活性化
       ├─ warn → ダウンロード可、UI に "デザインに軽微なズレあり" バッジ表示
       └─ fail → UI に "デザインが大きくずれています、再生成しますか？" 選択肢
       ↓
[4] (任意・将来) variant search モード
       ユーザーが "もっと近づけて" を押すと、サーバが内部で 3〜5 variant を
       並列生成し、最良 metric のものを採用
```

### E.3 自動品質ゲートのフロー詳細

```ts
// /api/skills/pptx/route.ts 内
const pptxBuf = await runPptxgenCode(code);

// Stage 1: 構造検証（pptx-parser で slide 数・要素タイプ）
const structOk = await validateStructure(pptxBuf, scenario);
if (!structOk.ok) return { status: "fail", reason: "structure", details: structOk };

// Stage 2: レンダ比較（並列 N 枚）
const renderedPngs = await renderPptxToPngs(savePptxToTmp(pptxBuf));
const metricsPerSlide = await Promise.all(
  renderedPngs.map((p, i) => compareImages(originalImages[i], p))
);

// Stage 3: しきい値判定
const verdict = metricsPerSlide.every(m => m.diffPixelRatio <= 0.15) ? "pass" : "warn";

// Stage 4: pHash 補助確認（warn のときだけ）
if (verdict === "warn") {
  const hashOk = await checkPhashAll(originalImages, renderedPngs);
  if (!hashOk) return { status: "fail", reason: "perceptual", metrics: metricsPerSlide };
}

return { status: verdict, pptx: pptxBuf, metrics: metricsPerSlide };
```

**注意**: Stage 2-3 だけで 10–30 秒掛かる可能性が高い。**UX 設計上、品質ゲートは非同期 job** にして以下のいずれかにすべき:

- **オプション A (推奨)**: PPTX 生成完了時点で **すぐにダウンロード可** にし、品質ゲートは "デザイン精度: 検証中..." のバッジで非同期表示
- **オプション B**: PPTX 生成と品質ゲートを SSE で逐次配信し、PPTX バイナリは末尾の event で送る（重い）
- **オプション C**: 品質ゲートはオプトイン機能（"高精度モード" トグル）

### E.4 variant search のクォータ消費

gpt-image-2 / Azure Foundry の RPM 制限を踏まえ:
- 並列度 N=3 で 1 スライド × 3 候補生成 = **3 image-gen call** / 1 枚
- 10 スライド deck で全 variant search = **30 calls**
- フェーズ A では **variant search 機能を実装しない**（UI に "再生成" ボタンを置くのみ）

---

## F. Container Apps 制約

### F.1 ファイルシステム（`/tmp`）

- Container Apps の `/tmp` は **container-local ephemeral**（再起動で消失）
- 容量はベース image サイズと container app の "Ephemeral storage" 設定次第。Container Apps Consumption plan の既定は **2–4 GiB** 程度（明示的な公式数値が変動しているため、デプロイ時に `kubectl describe` 相当で確認推奨）
- LibreOffice の per-PID profile は **数 MB〜数十 MB**（既存設定なし時）
- 1 リクエストの中間生成物（生成画像 4MB × 10 + PPTX 数MB + PDF 数MB + render PNG 1MB × 10）= **〜80 MB / 並行 1**

→ 並行 2 でも 200 MB 程度。リクエスト終了時に `rm -rf /tmp/job-<uuid>` を必ず実行（**finally で**）。

### F.2 メモリ

| 内訳 | 目安 |
|---|---|
| Node.js / Next.js base | 200–400 MB |
| sharp (per-call buffer) | 50–100 MB/call |
| LibreOffice soffice (per spawn) | 200–400 MB（ピーク） |
| pptxgenjs 生成中 | 50–150 MB |
| pixelmatch + PNG decode (per slide) | 30–80 MB |

**並行 1 リクエスト時のピーク: 600–800 MB**
**並行 2 リクエスト時のピーク: 1.2–1.6 GB**

→ **Container Apps の `containers.resources.memory` は最低 2 GiB を要求**。AGENTS.md / infra/main.bicep には現状 containerApp リソースが見えない（acr / env / log analytics のみ）が、デプロイ時に明示設定が必要。

### F.3 CPU

- PPTX → PDF: 1〜3 秒/PPTX（10 スライド程度）
- PDF → PNG (150 dpi): 0.5〜1 秒/スライド（10 枚で 5〜10 秒）
- pixelmatch: 100–300 ms/スライド（1.2 MP）

→ **1 deck (10 スライド) のレンダ検証で 10〜20 秒 CPU 占有**
→ 1 vCPU 割り当てなら問題なし、ただし HTTP timeout（Container Apps の既定 240 秒）と SSE keepalive に注意

### F.4 スケール（minReplicas / maxReplicas）

| 設定 | 推奨 | 理由 |
|---|---|---|
| `minReplicas` | **1** | scale-to-zero すると LibreOffice cold start でユーザーが 10 秒以上待つ |
| `maxReplicas` | **1〜3** | session state を in-memory cache に持つなら 1。Blob 化後 N |
| Concurrency (per-replica) | **1〜2** | LibreOffice の並行制約 + メモリ制約。`p-queue` で in-process 制限 |

queue 化（外部キュー）の要否:
- **フェーズ A: 不要**。in-process p-queue で十分
- フェーズ B (production): Azure Storage Queue or Service Bus に job 投入 → worker container が処理、を検討（multi-replica にする場合）

### F.5 永続キャッシュの配置

| 対象 | 推奨 |
|---|---|
| 生成画像（gpt-image-2 出力） | **in-memory Map<jobId, Buffer>** で MVP 完結。session 終了 / 再起動で消える前提。production 用に Azure Blob (`container=images`) は将来 work item |
| layout.json（vision 抽出結果） | in-memory（再生成可能なので消えても OK） |
| 再レンダ PNG | **per-request `/tmp/job-<uuid>/`**、レスポンス後削除 |
| 最終 PPTX | レスポンスで即返却 → ブラウザ側ダウンロード後はサーバ保持不要 |

---

## 推奨実装フェーズ分割

### フェーズ A（**最小実装**、まずこちらを完了させる）

**目的**: 「画像生成 → 半透明背景貼り付け + 構造化テキストオーバーレイで PPTX 化」を動かす（参考 SKILL 哲学のうち "編集可能" だけ採用、レンダ検証はスキップ）

含めるもの:
- `src/infrastructure/image/azure-image-client.ts` — gpt-image-2 呼び出し（メイン研究の通り）
- `src/app/api/skills/image/route.ts` — 画像生成 endpoint
- `SlideItem` に `imageUrl`, `imagePrompt` 追加
- `slide-panel.tsx` で画像サムネ + 再生成ボタン
- 既存 `generate-pptx` スキルに「image-then-pptx モード時の追加プロンプト」セクション追加（方式 C: 画像を半透明背景に、`bullets`/`title` をオーバーレイ）
- **Dockerfile 変更なし、LibreOffice 追加なし**

含めないもの:
- LibreOffice / poppler
- 自動品質ゲート
- bbox 抽出
- variant search

### フェーズ B（**Linux 移植のコア**）

**目的**: 参考 SKILL の "render → 比較 → 数値判定" を Linux + Node で再現

含めるもの:
- Dockerfile に `libreoffice-impress`, `poppler-utils`, `fonts-noto-cjk` 追加
- `src/infrastructure/render/libreoffice-renderer.ts` — B.4 の `renderPptxToPngs`
- `src/infrastructure/diff/image-comparator.ts` — C.3 の `compareImages` + pHash
- `src/application/quality-gate-use-case.ts` — Stage 1-4 のオーケストレーション
- `infra/main.bicep` に Container App リソース追加（`minReplicas: 1`, `memory: 2Gi`, `cpu: 1.0`）
- `p-queue` で同時実行制限
- UI で品質バッジ表示

含めないもの:
- bbox 抽出（vision 経由）
- variant search

### フェーズ C（**高精度モード・opt-in**）

**目的**: 参考 SKILL の "vision で layout 抽出 → pptxgenjs ネイティブ要素再構築"

含めるもの:
- `src/application/layout-extraction-use-case.ts` — Copilot SDK vision call + sharp refine（ハイブリッド方式 A4）
- `src/domain/entities/slide-layout.ts` — D.2 の schema
- `src/infrastructure/pptx/layout-renderer.ts` — layout → pptxgenjs slide
- variant search（並列 3〜5 候補）
- 高精度モードトグル（UI）

含めないもの:
- 自動人手介入ループ（参考 SKILL の側道。本リポでは UI で「再生成」ボタンに置換）

---

## オープン質問（プランナー判断事項）

1. **方式 C（フェーズ A の半透明背景方式）で UX 上十分か、フェーズ B/C の高忠実度モードまでスコープに含めるか**
   先行研究（linux-pptx-rendering-research.md §2.3）の推奨は方式 C のみ。Option B 採用とは "フェーズ C まで実装" の意か、それとも "フェーズ B のレンダ検証を含む方式 C" 程度か。
2. **`minReplicas: 1` の月コスト増（scale-to-zero 不可）を許容するか**
   フェーズ B 以降は LibreOffice cold start 回避のため必須。Container Apps の最小構成（1 vCPU / 2GiB）で月 $30–40 程度（リージョン依存）。許容しない場合、品質ゲートは "オプトイン + 初回 10 秒待ち" になる。
3. **自動品質ゲート（pixelmatch + pHash）の閾値をどう決めるか**
   参考 SKILL の `0.15` は PowerPoint COM の render 前提。LibreOffice render は antialiasing 挙動が違うので **実測で再キャリブレーション必要**。フェーズ B 完了後にユーザー受け入れテストで決める手で良いか。
4. **gpt-image-2 のクォータ / コスト上限**
   variant search を導入する場合、deck 10 枚 × 3 variant = 30 image-gen call/deck。1 call $0.04–0.08 程度（モデル依存）= **$1.2–2.4/deck**。デモ用なら問題ないが、production ではコスト管理機能（ユーザーあたり生成数制限など）が必要。
5. **既存「コード生成モード」（`generate-pptx` スキル）との UI 共存方式**
   メイン研究では `generationMode: 'code' | 'image-then-pptx'` を SlideWork に追加と記載。**両モードで品質ゲートを共通化するか**（コード生成モードでも LibreOffice render → 構造検証だけは流す等）の方針確認が必要。

---

## ステータス

**Complete** — A〜F の全論点について比較表・推奨・実装サンプルコード・Container Apps 制約見積もりを提示済み。フェーズ A/B/C 分割案とオープン質問 5 件をプランナーに提示。

### 重要な発見事項（要点まとめ）

1. **参考 SKILL の "目視ループ" は本リポ UX に直接移植できない**。`diff_pixel_ratio <= 0.15` の数値ゲートを自動採用判定に使うと、findings.md の教訓「無いものは差分にしか出ない」「font 縮小で metric を取れてしまう」を踏むリスクが高い。**ダブル指標（pixelmatch + pHash）+ 段階的判定（pass/warn/fail）** に拡張すべき。
2. **bbox 抽出は LLM の非決定性が大きく**（findings.md `gpt-4o` で同一画像 25–37 elements ばらつき）、自動採用判定の数値根拠としては不安定。**方式 C（半透明背景 + 固定座標オーバーレイ）で bbox 推定そのものを回避**するのが最も実装コスト低・安定。
3. **LibreOffice headless + poppler は Linux で確立しているが**、UNO bootstrap 競合（per-PID profile 必須）と並行実行時のメモリ消費（200–400 MB/spawn）が制約。**`p-queue` での in-process concurrency=1〜2 制限と `minReplicas: 1` が必須**。
4. **既存 `sharp ^0.34.5` 依存はそのまま使え、pixelmatch + sharp-phash の追加だけで diff パイプラインが組める**。OpenCV ネイティブ依存は不要。
5. **Dockerfile への追加分は +500〜700 MB、最終 ~700 MB〜1 GB**。Container Apps + ACR 同一リージョン構成なら問題ない範囲。

### 次の調査（プランナーへの推奨）

- [ ] gpt-image-2 の出力解像度と aspect ratio の確認（API ドキュメント精読、フェーズ A 実装前）
- [ ] Copilot SDK の vision attachment 仕様詳細確認（フェーズ C 実装前。1 msg で複数画像渡せるか、レイテンシ実測）
- [ ] LibreOffice + 日本語フォント rendering の現物確認（Dockerfile 試作 + サンプル PPTX で sanity check）
- [ ] `infra/main.bicep` に Container App リソース追加の詳細設計（メモリ 2GiB、min/maxReplicas、env vars）

### 参考リンク補足

- pixelmatch npm: https://www.npmjs.com/package/pixelmatch（threshold/includeAA オプション仕様）
- sharp-phash 解説: https://www.context.dev/blog/perceptual-hashing-in-node-js-with-sharp-phash-for-developers
- LibreOffice headless 解説（既出）: https://oneuptime.com/blog/post/2023-09-20-how-to-run-libreoffice-in-docker-for-document-conversion/view
- pptxgenjs addImage / addShape: https://gitbrent.github.io/PptxGenJS/docs/api-image / https://gitbrent.github.io/PptxGenJS/docs/api-shape
