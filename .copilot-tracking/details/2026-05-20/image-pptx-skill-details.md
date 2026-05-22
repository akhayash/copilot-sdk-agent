<!-- markdownlint-disable-file -->
# Implementation Details: 画像生成パス追加とストーリー精緻化

## Context Reference

Sources:
* .copilot-tracking/research/2026-05-20/image-pptx-skill-research.md — 全体要件・設計方針
* .copilot-tracking/research/subagents/2026-05-20/option-b-feasibility-research.md — **採用方針の根拠**（Option B: SKILL + LibreOffice + 非同期品質ゲート）
* .copilot-tracking/research/subagents/2026-05-20/linux-pptx-rendering-research.md — 先行 Linux 調査（Hybrid C 系・参考用 / 現在は fallback として利用）
* skills/pptx-from-image/SKILL.md — 本リポに取り込む外部スキル（Phase 4.1 で `akhayash_microsoft/Hitachi-IT-Dev` から取り込み）

## Implementation Phase 1: ドメイン型拡張

<!-- parallelizable: false -->

### Step 1.1: SlideItem / SlideWork 拡張

src/domain/entities/slide-work.ts を以下の通り拡張：

* `SlideItem` に optional フィールドを追加：
  * `bodyMarkdown: string | null` — 段落・小見出し含む詳細本文（精緻ストーリー用）
  * `imageUrl: string | null` — 生成画像取得 URL（`/api/skills/image/[id]`）。data URL は使わない
  * `imagePrompt: string | null` — 画像生成に使ったプロンプト（再生成用に保存）
  * `imageStatus: 'idle' | 'generating' | 'ready' | 'error'` — 各スライドの画像生成ステータス
* `SlideWork` に追加：
  * `generationMode: 'code' | 'image-then-pptx'` — 既定は 'code'
* `SlidePhase` に `'imagining'` を追加（画像生成中）

Files:
* src/domain/entities/slide-work.ts - SlideItem / SlideWork / SlidePhase の型拡張

Discrepancy references:
* なし（新規フィールドの追加）

Success criteria:
* TypeScript ビルドが通る
* 既存の SlideItem 利用箇所（slide-panel.tsx, scenario-tool.ts, slide-parser.ts）が型エラーなしで通る（optional フィールドのため互換性維持）

Context references:
* src/domain/entities/slide-work.ts (Lines 1-65) - 既存型定義

Dependencies:
* なし（最初のステップ）

### Step 1.2: TypeScript ビルド検証

`pnpm build` を実行し、ドメイン層の変更が他層に破壊的影響を与えていないことを確認。

Validation commands:
* `pnpm build` — TypeScript コンパイル
* `pnpm lint` — ESLint

## Implementation Phase 2: 画像生成インフラ層

<!-- parallelizable: true -->

### Step 2.1: Azure Foundry Image Client

src/infrastructure/image/azure-image-client.ts を新規作成：

* 環境変数を読む：
  * `AZURE_IMAGE_ENDPOINT` (必須)
  * `AZURE_IMAGE_DEPLOYMENT` (既定 `gpt-image-2`)
  * `AZURE_IMAGE_API_VERSION` (既定 `2025-04-01-preview`)
  * `IMAGE_AUTH_MODE` (`entra` 既定 / `key`)
  * `AZURE_IMAGE_API_KEY` (`IMAGE_AUTH_MODE=key` の時)
* `entra` モード時は既存の `DefaultAzureCredential` パターンに従い `getToken('https://cognitiveservices.azure.com/.default')`
* exported function: `generateImage(prompt: string, opts?: { size?: '1024x1024' | '1792x1024'; n?: number }): Promise<{ data: Buffer; mimeType: 'image/png' }[]>`
* `fetch` で POST `${endpoint}/openai/deployments/${deployment}/images/generations?api-version=${apiVersion}`、body は `{ prompt, size, n, response_format: 'b64_json' }`
* レスポンスの `data[].b64_json` を `Buffer.from(b64, 'base64')` に変換して返す
* エラー時は `Error` を throw（呼び出し側でハンドル）

Files:
* src/infrastructure/image/azure-image-client.ts - Azure Foundry Image API ラッパー

Discrepancy references:
* なし

Success criteria:
* `getImageClient()` が環境変数なしで呼ばれた場合は `null` を返す（ヘルシーな降格）
* 認証 mode が `entra` / `key` の両方で動く
* TypeScript ビルドが通る

Context references:
* src/infrastructure/copilot/client.ts (Lines 61-77) - 既存 Azure 認証パターン
* .copilot-tracking/research/2026-05-20/image-pptx-skill-research.md - 環境変数定義

Dependencies:
* Step 1.1 完了（型は使わないが整合性のため）

### Step 2.2: 画像メモリキャッシュ

src/infrastructure/image/image-cache.ts を新規作成：

* シングルトン `Map<string, { data: Buffer; mimeType: string; createdAt: number }>`
* `putImage(data: Buffer, mimeType: string): string` — `crypto.randomUUID()` で ID 発行、Map に格納、ID 返却
* `getImage(id: string): { data: Buffer; mimeType: string } | null`
* `setInterval` で 5 分ごとに TTL (1 時間) 超過エントリを削除
* スケール時の制約コメントを記載（複数インスタンスでは Blob Storage 推奨、follow-on work item WI-01）

Files:
* src/infrastructure/image/image-cache.ts - in-memory 画像キャッシュ

Success criteria:
* put → get で同じ Buffer が返る
* TTL 超過のエントリが自動削除される

Context references:
* .copilot-tracking/research/2026-05-20/image-pptx-skill-research.md (リスク表「in-memory cache の揮発」)

Dependencies:
* なし（独立）

### Step 2.3: 画像生成ツール

src/infrastructure/tools/image-tool.ts を新規作成：

* `createGenerateSlideImageTool(onImageGenerated: (slideNumber: number, imageId: string) => void)` — 1 枚生成
  * parameters: `{ slideNumber: number, prompt: string, size?: string }`
  * handler: `generateImage(prompt, { size })` → `putImage` → callback で SSE 通知 → `{ success, imageId }` 返却
* `createGenerateAllImagesTool(onProgress: (slideNumber: number, imageId: string) => void)` — 全スライド一括
  * parameters: `{ slides: Array<{ slideNumber: number, prompt: string }> }`
  * handler: 並列度 3 で順次生成（rate limit 配慮）、各完了ごと callback
* 両ツールとも `getImageClient()` が `null`（env 未設定）の場合は明確なエラーメッセージを返す

Files:
* src/infrastructure/tools/image-tool.ts - 画像生成カスタムツール

Success criteria:
* 既存 `createScenarioTool` と同じ `defineTool` パターンを踏襲
* 並列生成が rate limit に引っかからない（concurrency 3）

Context references:
* src/infrastructure/tools/scenario-tool.ts (Lines 1-200) - 既存ツールパターン

Dependencies:
* Step 2.1, Step 2.2 完了

### Step 2.4: image-prompt-builder（DR-05 対応）

src/application/image-prompt-builder.ts を新規作成：

* exported function: `buildImagePrompt(slide: SlideItem, brief: DesignBrief | null): string`
* 入力 `slide.title` / `slide.keyMessage` / `slide.bullets` / `slide.bodyMarkdown` / `brief.industry` / `brief.tone` を統合し、英語の簡潔な image generation prompt（〜200 token 程度）を構築
* テンプレート例：`"Modern presentation slide illustration: <title>. Key message: <keyMessage>. Content: <bodyMarkdown summary or bullets>. Style: clean, professional, <brief.tone>, <brief.industry> context. No text, no logos."`
* bodyMarkdown が長い場合は最初の段落（〜500 文字）のみ使用
* slide.imagePrompt がすでにある場合（再生成時）はそれを優先利用するロジックも提供（`buildImagePrompt` とは別関数 `getEffectivePrompt(slide, brief)`）

Files:
* src/application/image-prompt-builder.ts - 画像 prompt 組み立てユーティリティ

Discrepancy references:
* DR-05 解消

Success criteria:
* client / server 両方から import 可能（application 層なのでフレームワーク非依存）
* TypeScript ビルドが通る

Dependencies:
* Phase 1 完了

## Implementation Phase 3: API エンドポイント

<!-- parallelizable: true -->

### Step 3.1: 画像生成 POST エンドポイント

src/app/api/skills/image/route.ts を新規作成：

* POST: body `{ slideNumber: number; prompt: string; size?: string }`
* `generateImage(prompt, { size })` を呼び `imageCache.putImage` でキャッシュ
* レスポンス: `{ imageId: string; slideNumber: number; url: string }` （url は `/api/skills/image/${imageId}`）
* バリデーション: prompt 必須・非空、size は許可リスト内
* エラー時は 500 + `{ error: string }`
* `getImageClient()` が null の場合は 503 + `{ error: 'Image generation not configured. Set AZURE_IMAGE_ENDPOINT.' }`

Files:
* src/app/api/skills/image/route.ts - 画像生成エンドポイント

Success criteria:
* 正常系で 200 + imageId
* env 未設定で 503

Context references:
* src/app/api/skills/pptx/route.ts (Lines 1-50) - 既存スキルエンドポイントパターン

Dependencies:
* Phase 2 完了

### Step 3.2: 画像取得 GET エンドポイント

src/app/api/skills/image/[id]/route.ts を新規作成：

* GET: `imageCache.getImage(params.id)` を返却
* Content-Type: image/png、Cache-Control: private, max-age=3600
* 見つからなければ 404

Files:
* src/app/api/skills/image/[id]/route.ts - 画像 binary 取得エンドポイント

Success criteria:
* 既存の image-then-pptx フローで `<img src="/api/skills/image/...">` が表示される

Context references:
* src/app/api/skills/pptx/route.ts (Lines 30-42) - binary レスポンスパターン

Dependencies:
* Step 2.2 完了

### Step 3.3: チャット route のモード対応

src/app/api/chat/route.ts を更新：

* `ChatRequest` に `generationMode?: 'code' | 'image-then-pptx'` を追加（既定 `'code'`）
* `skillDirs` をモードに応じて切替：
  * `code` モード: 既存どおり `create-slide-story` + `generate-pptx`
  * `image-then-pptx` モード: `create-slide-story` + `pptx-from-image`
* tools リストに、`image-then-pptx` モードかつ `getImageClient() !== null` の時のみ `createGenerateSlideImageTool` / `createGenerateAllImagesTool` を追加
* 画像生成 callback で SSE イベント `image_generated` を送出（`{ slideNumber, imageId, url, prompt }` — DR-06）
* システムメッセージにモード固有の指示を追加：
  * image-then-pptx モード: 「scenario 作成後に generate_all_images ツールで全スライドの画像を生成し、ユーザー確認後に pptxgenjs コードを出力」
  * **追加（DD-06）**: 「image-then-pptx モードで `update_slide` を呼んだ直後は、対応スライドの `generate_slide_image` も同じターン内で呼び、画像も最新化すること」

Files:
* src/app/api/chat/route.ts - チャットエンドポイントのモード分岐

Discrepancy references:
* DD-01: スキル切替を route.ts に集約する設計

Success criteria:
* code モード時、画像ツールが tools に含まれない
* image-then-pptx モード時、画像生成中も SSE で進捗が流れる

Context references:
* src/app/api/chat/route.ts (Lines 65-115) - 既存 tool 構築 + skillDirectories
* src/app/api/chat/route.ts (Lines 130-155) - 既存 SSE イベント送出

Dependencies:
* Phase 2, Step 5.1 完了

## Implementation Phase 4: PPTX 生成（Option B: SKILL + bbox + layout-to-pptx）

<!-- parallelizable: true、ただし Phase 2 完了後 -->

### Step 4.1: 外部スキル `pptx-from-image` を本リポに取り込み

EMU 組織 `akhayash_microsoft/Hitachi-IT-Dev` の `pptx-from-image` SKILL を本リポ `skills/pptx-from-image/` 配下にコピー（`$env:TEMP\pptx-from-image-ref\` にキャッシュ済み）。Copilot SDK の `skillDirectories` 設定（`src/infrastructure/copilot/client.ts`）に同パスを追加し、本リポの規約に合わせて以下のみ調整：

* frontmatter `name: pptx-from-image`、`description` を「画像から編集可能 PPTX を再構築する」に簡略化
* 参考 SKILL 内の Python パイプライン参照は注記として残し、本リポ実装側（`src/application/layout-to-pptx.ts`）への参照を冒頭に追記
* `allowed-tools: []`（コード出力のみ、ツール呼び出し不要）
* 重要原則を強調:
  * **1 枚画像貼り付け禁止**。テキストは必ず pptxgenjs ネイティブ要素
  * 画像は `images.get(slideNumber)` で `data URI` を取得
  * `SlideLayout` JSON から pptxgenjs オブジェクトを構築
* layout-to-pptx に渡す `SlideLayout` 型のスキーマを SKILL.md にも転記

Files:
* skills/pptx-from-image/SKILL.md - 取り込み済み SKILL（一部改訂）
* src/infrastructure/copilot/client.ts - `skillDirectories` に追加

Discrepancy references:
* DR-01 (Resolution: LibreOffice 採用 + 非同期バッジで「目視必須」を代替)
* DR-02 (TypeScript 等価実装に置換)

Success criteria:
* SKILL.md が Copilot SDK にロードされる
* `skillDirectories` のパスが既存 `skills/create-slide-story` / `skills/generate-pptx` と同形式

Context references:
* 取り込み元: EMU 組織 `akhayash_microsoft/Hitachi-IT-Dev` の `.github/skills/pptx-from-image/SKILL.md`（取り込み後はリポ内 `skills/pptx-from-image/SKILL.md` を正本とする）
* .copilot-tracking/research/subagents/2026-05-20/option-b-feasibility-research.md §B

Dependencies:
* なし

### Step 4.2: ドメイン型 `SlideLayout` の定義

src/domain/entities/slide-layout.ts を新規作成。zod スキーマで以下を定義：

```ts
// 簡略図示
export const TextRunSchema = z.object({ text: z.string(), bold: z.boolean().optional(), italic: z.boolean().optional(), color: z.string().optional(), size: z.number().optional() });
export const TextboxSchema = z.object({ kind: z.literal('textbox'), id: z.string(), bbox: BboxSchema, runs: z.array(TextRunSchema), align: z.enum(['left','center','right']).optional() });
export const AutoShapeSchema = z.object({ kind: z.literal('auto_shape'), id: z.string(), bbox: BboxSchema, shapeType: z.string(), fill: z.string().optional(), line: z.string().optional() });
export const LineSchema = z.object({ kind: z.literal('line'), id: z.string(), from: PointSchema, to: PointSchema, color: z.string().optional(), width: z.number().optional() });
export const PictureSchema = z.object({ kind: z.literal('picture'), id: z.string(), bbox: BboxSchema, source: z.object({ imageId: z.string(), cropPx: BboxPxSchema.optional() }) });
export const SlideLayoutSchema = z.object({ slideNumber: z.number().int().positive(), elements: z.array(z.discriminatedUnion('kind', [TextboxSchema, AutoShapeSchema, LineSchema, PictureSchema])) });
export type SlideLayout = z.infer<typeof SlideLayoutSchema>;
```

bbox は EMU (914400 EMU = 1 inch、16:9 で 12192000 × 6858000) を採用し、`x`/`y`/`w`/`h` を整数で持つ。

`SlideLayoutSchema` に **`.superRefine`** を必ず付ける（DR-07 / DD-20 対応）:

```ts
export const SlideLayoutSchema = z.object({
  slideNumber: z.number().int().positive(),
  elements: z.array(z.discriminatedUnion('kind', [...])),
}).superRefine((data, ctx) => {
  // (1) id 一意性
  const seen = new Set<string>();
  for (const el of data.elements) {
    if (seen.has(el.id)) ctx.addIssue({ code: 'custom', message: `duplicate id: ${el.id}` });
    seen.add(el.id);
  }
  // (2) bbox 寸法
  for (const el of data.elements) {
    if ('bbox' in el && (el.bbox.w <= 0 || el.bbox.h <= 0)) {
      ctx.addIssue({ code: 'custom', message: `non-positive w/h at ${el.id}` });
    }
  }
  // (3) スライド境界（16:9 EMU）内に収まる
  const SW = 12192000, SH = 6858000;
  for (const el of data.elements) {
    if ('bbox' in el && (el.bbox.x + el.bbox.w > SW || el.bbox.y + el.bbox.h > SH)) {
      ctx.addIssue({ code: 'custom', message: `bbox out of slide bounds at ${el.id}` });
    }
  }
});
```

Files:
* src/domain/entities/slide-layout.ts - 新規

Discrepancy references:
* DR-07, DD-20 (`superRefine` で id 一意性・w/h 正値・bbox 境界を assert)

Success criteria:
* `tsc --noEmit` が通る
* zod parse でサンプル JSON が pass する

Context references:
* .copilot-tracking/research/subagents/2026-05-20/option-b-feasibility-research.md §D

Dependencies:
* なし

### Step 4.3: bbox 抽出 — `src/infrastructure/image/bbox-extractor.ts`

vision LLM (Copilot SDK の `attachments` 機能経由) で `SlideLayout` を抽出する。

* `extractLayout(slideNumber: number, image: Buffer, prompt: string, opts?: { signal?: AbortSignal; timeoutMs?: number }): Promise<SlideLayout>` を export
* **モデル選定 (DR-11)**: `BBOX_VISION_MODEL` env で指定（既定 `gpt-4o`）。Copilot SDK の `client.sendAndWait({ model, attachments, ... })` に渡す
* **per-call timeout (DR-13)**: 既定 20 秒。`AbortController` で SDK 呼び出しを中断、超過時は `TimeoutError` を throw
* **並列実行制御 (DR-13)**: モジュール singleton の p-queue (`bboxQueue`) で concurrency=`Number(process.env.BBOX_VISION_CONCURRENCY) || 3`。10 スライド deck で 20s × ceil(10/3) ≈ 70s に収まる
* **per-deck hard timeout**: 呼び出し側 (`route.ts`) で 90 秒の `AbortController` を deck 全体に張り、超過時は fallback (DR-12) へ
* system prompt は SKILL.md と同じ「textbox/auto_shape/line/picture を bbox 付きで列挙、座標は 16:9 EMU 単位」を指示
* 返却 JSON を `SlideLayoutSchema.safeParse()` で検証、失敗時は throw
* `sharp.stats()` / `sharp(image).extract({...}).raw()` でエッジを再走査し、bbox 候補の `w`/`h` がエッジ密度の高い領域に揃うよう軽くスナップ調整
* リトライ 1 回（system prompt に「previous output failed schema validation: ...」を添えて再投）

Files:
* src/infrastructure/image/bbox-extractor.ts - 新規

Discrepancy references:
* DR-07, DR-10, DR-11 (`BBOX_VISION_MODEL` 既定 `gpt-4o`), DR-13 (concurrency 3 / per-call 20s / per-deck 90s)

Success criteria:
* 単体テスト用の固定画像で 1 件以上の textbox を bbox 付きで返す
* schema violation 時に自動リトライが 1 回走る
* timeout 超過時に `TimeoutError` を投げて呼び出し側で fallback できる

Context references:
* .copilot-tracking/research/subagents/2026-05-20/option-b-feasibility-research.md §A

Dependencies:
* Step 4.2 完了

### Step 4.4: `SlideLayout` → pptxgenjs 変換 — `src/application/layout-to-pptx.ts`

`renderSlideLayout(slide: PptxGenJS.Slide, layout: SlideLayout, images: Map<string, Buffer>): Promise<void>` を export。

* `textbox`: `slide.addText(runs, { x, y, w, h, align, ... })`。runs は `[{ text, options }]` 形式に変換
* `auto_shape`: `slide.addShape(pptxgen.shapes.RECTANGLE, { x, y, w, h, fill, line })`
* `line`: `slide.addShape(pptxgen.shapes.LINE, { x:from.x, y:from.y, w:to.x-from.x, h:to.y-from.y, line })`
* `picture`: `images.get(source.imageId)` で Buffer 取得、`source.cropPx` が指定されれば `sharp(buf).extract({ left, top, width, height }).png().toBuffer()` で切り出し、`slide.addImage({ data: 'data:image/png;base64,'+b64, x, y, w, h })`
* EMU → pptxgenjs inch 換算（`/914400`）はヘルパー関数で
* 全 element をループ後 Promise.all で並列化（sharp の I/O を活用）

Files:
* src/application/layout-to-pptx.ts - 新規

Discrepancy references:
* DR-02 (`crop_icons.py` → sharp.extract で代替)
* DD-09 (crop_padding は LLM 側で組み込み済み)

Success criteria:
* `renderSlideLayout` 後の pptxgenjs slide に期待数の要素が addX される
* textbox の bold/italic/color/size が反映される

Context references:
* .copilot-tracking/research/subagents/2026-05-20/option-b-feasibility-research.md §D.4
* src/infrastructure/skills/pptxgen-adapter.ts (Lines 1-200) - 既存 pres ビルドパターン

Dependencies:
* Step 4.2 完了

### Step 4.5: PPTX route の Option B パイプライン統合（方式 C フォールバック内包）

src/app/api/skills/pptx/route.ts を更新：

* `PptxCodeRequest` に `imageIds?: Record<number, string>` と `generationMode?: 'code' | 'image-then-pptx'` を追加
* `generationMode === 'image-then-pptx'` の分岐:
  1. 各 slide について `imageCache.getImage(id)` で Buffer 取得
  2. **per-deck `AbortController`** を 90s で fire し、deck 全 slide の bbox 抽出を `extractLayout(slideNumber, buffer, prompt, { signal, timeoutMs: 20000 })` で並列実行（p-queue concurrency=3, DR-13）
  3. 抽出成功 slide: `renderSlideLayout(slide, layout, imagesMap)` で pptxgenjs に積む
  4. **フォールバック発動条件 (DR-12, slide 単位)** — 以下のいずれかで該当 slide のみ方式 C へ:
     - schema violation を 1 回リトライしても失敗
     - `elements` が空配列で返る（vision が解釈できなかった）
     - bbox が slide 境界外 / 重複 id（`superRefine` で reject）
     - per-call timeout 20s 超過
     - vision SDK が network/auth エラー
  5. **deck 全体フォールバック発動条件** — per-deck 90s hard timeout 超過、または `imageCache.getImage()` 失敗の場合は deck 全 slide を方式 C で構築
  6. 方式 C フォールバック実装: `applyHybridFallback(slide, scenarioSlide, dataUri)` で `slide.background = { data: dataUri }` + `set_scenario` の `title` / `bullets` / `bodyMarkdown` を pptxgenjs ネイティブで上に重ねる（旧 Hybrid C ロジックを関数化）
  7. フォールバック発生時は response header に `x-pptx-fallback: hybrid-c`（deck 全体）または `x-pptx-fallback: hybrid-c-partial; slides=2,5` （slide 単位）を付与
* `generationMode === 'code'`（既定）の場合は従来の `executePptxCode` を呼ぶ（変更なし）

Files:
* src/app/api/skills/pptx/route.ts - 分岐追加 + fallback ヘルパー

Discrepancy references:
* DD-01, DD-08, DR-12 (fallback trigger 条件明示), DR-13 (per-deck hard timeout 90s)

Success criteria:
* code モードのリクエストが従来通り動く
* image-then-pptx で正常系/失敗系両方が PPTX を返す
* fallback ヘッダーが付く

Context references:
* src/app/api/skills/pptx/route.ts (Lines 46-95) - 既存 executePptxCode

Dependencies:
* Step 2.2, Step 4.3, Step 4.4 完了

### Step 4.6: 既存スキル更新

skills/create-slide-story/SKILL.md と skills/generate-pptx/SKILL.md を更新：

* create-slide-story: `bodyMarkdown` フィールド説明追加、code/image-then-pptx 両モードに共通であることを明記
* generate-pptx: モード分岐を説明、image-then-pptx モード時は `pptx-from-image` SKILL に委譲される旨を明記

Files:
* skills/create-slide-story/SKILL.md
* skills/generate-pptx/SKILL.md

Success criteria:
* frontmatter が壊れていない

Dependencies:
* Phase 1, Step 4.1 完了

## Implementation Phase 4B: LibreOffice 品質ゲート（非同期）

<!-- parallelizable: false、Phase 4 と Phase 7.1 完了後に直列 -->

### Step 4B.1: LibreOffice レンダラ — `src/infrastructure/render/libreoffice-renderer.ts`

* `renderPptxToPngs(pptxBuf: Buffer, opts: { jobId: string; dpi?: number; timeoutMs?: number }): Promise<Buffer[]>` を export（既定 `dpi=150`, `timeoutMs=60_000`）— **DD-13 対応**
* 処理:
  1. `/tmp/job-<jobId>/` を `mkdtemp` で作成
  2. PPTX を `out.pptx` として書き出し
  3. `child_process.execFile('soffice', ['--headless', `-env:UserInstallation=file:///tmp/uno-${jobId}-${process.pid}`, '--convert-to', 'pdf', '--outdir', dir, 'out.pptx'], { timeout: timeoutMs })` で PDF 変換
  4. `execFile('pdftoppm', ['-png', '-r', String(dpi), 'out.pdf', 'page'], { timeout: timeoutMs })` で PNG 化
  5. `page-*.png` を順に `fs.readFile` で Buffer 配列に
  6. **finally** で `fs.rm(dir, { recursive: true, force: true })`
* **モジュールスコープ singleton p-queue** で concurrency 制御 — `new PQueue({ concurrency: Number(process.env.LIBREOFFICE_CONCURRENCY) || 1 })`（DD-16 対応、既定 1 で 2 GiB スペックの安全側）
* `timeoutMs` 超過 / soffice 失敗時は throw（呼び出し側 quality job が `status: 'error'` に倒す）

Files:
* src/infrastructure/render/libreoffice-renderer.ts - 新規

Discrepancy references:
* DR-08 (UNO bootstrap 競合: per-PID/jobId UserInstallation), DR-09 (per-request workdir)

Success criteria:
* サンプル PPTX → PNG 1 ページ以上を返す
* 並行 2 リクエストで lock 衝突なし

Context references:
* .copilot-tracking/research/subagents/2026-05-20/option-b-feasibility-research.md §B

Dependencies:
* Phase 7.1 (Dockerfile に soffice / pdftoppm が同梱) 完了

### Step 4B.2: 画像比較 — `src/infrastructure/image/image-comparator.ts`

* `compareImages(rendered: Buffer, original: Buffer): Promise<{ diffPixelRatio: number; phashHamming: number; verdict: 'pass'|'warn'|'fail' }>` を export
* 処理:
  1. 両画像を同 width（min(原画像幅, レンダ画像幅)）に `sharp().resize(W, null, { fit: 'inside' }).png().toBuffer()` で正規化
  2. `sharp(original).resize(同サイズ).png().toBuffer()`
  3. `PNG.sync.read()` でデコード
  4. `pixelmatch(a.data, b.data, null, width, height, { threshold: 0.1 })` で differing pixel 数を取得
  5. `diffPixelRatio = diffPixels / (w*h)`
  6. `sharp-phash` の `phash(rendered)` / `phash(original)` で 64bit hash → Hamming distance
  7. 閾値: `diffPixelRatio <= 0.12 && hamming <= 10 → 'pass'` / `<= 0.15 && <= 16 → 'warn'` / その他 `'fail'`

Files:
* src/infrastructure/image/image-comparator.ts - 新規

Discrepancy references:
* DR-10 (初期閾値は参考 SKILL に倣う、運用後再キャリブ)

Success criteria:
* 同一画像で `'pass'` を返す
* 全く別の画像で `'fail'` を返す

Context references:
* .copilot-tracking/research/subagents/2026-05-20/option-b-feasibility-research.md §C

Dependencies:
* なし

### Step 4B.3: 品質ゲート API + 結果キャッシュ — `src/app/api/skills/pptx/quality/[jobId]/route.ts`

* `GET /api/skills/pptx/quality/[jobId]` で `{ status: 'pending'|'done'|'error', perSlide: [{ slideNumber, diffPixelRatio, phashHamming, verdict }], fallbackUsed: boolean }` を返す
* `qualityJobs: Map<string, QualityResult>` をモジュールスコープに保持（TTL 1h）
* job が `pending` でも 200 で `status: 'pending'` を返す（クライアントは polling）

Files:
* src/app/api/skills/pptx/quality/[jobId]/route.ts - 新規

Discrepancy references:
* DD-11

Success criteria:
* 不明 jobId で 404
* pending 中の jobId で 200 + pending
* 完了 jobId で per-slide 結果

Context references:
* .copilot-tracking/research/subagents/2026-05-20/option-b-feasibility-research.md §E.3

Dependencies:
* Step 4B.1, 4B.2 完了

### Step 4B.4: PPTX route から fire-and-forget で品質 job をキック

src/app/api/skills/pptx/route.ts を更新（Step 4.5 の続き）：

* PPTX 応答を Response として `return` する **直前**、`generationMode === 'image-then-pptx'` の場合に:
  1. `jobId = crypto.randomUUID()`
  2. response header に `x-pptx-quality-job-id: <jobId>` を付与
  3. `qualityJobs.set(jobId, { status: 'pending', perSlide: [], fallbackUsed: <header から> })`
  4. **await せずに** `runQualityCheck(jobId, pptxBuffer, originalImagesMap)` を Promise として発火（top-level `Promise.catch` でログ）
* `runQualityCheck` の流れ:
  1. `renderPptxToPngs(pptxBuffer, { jobId })`
  2. 各 slide で `compareImages(renderedPng[i], originalImagesMap[i])`
  3. `qualityJobs.set(jobId, { status: 'done', perSlide: [...] })`
  4. 失敗時は `status: 'error'` + `error: msg`

Files:
* src/app/api/skills/pptx/route.ts (Step 4.5 で更新済みファイル) - 追記

Discrepancy references:
* DD-11

Success criteria:
* PPTX 応答は数秒で返る（quality を待たない）
* job 完了後 GET /quality/[jobId] が `done` を返す

Context references:
* .copilot-tracking/research/subagents/2026-05-20/option-b-feasibility-research.md §E.3

Dependencies:
* Step 4.5, 4B.1, 4B.2, 4B.3 完了


## Implementation Phase 5: ツール schema 更新

<!-- parallelizable: false -->

### Step 5.1: scenario tool schema 拡張

src/infrastructure/tools/scenario-tool.ts を更新：

* `ScenarioSlide` interface に `bodyMarkdown?: string` を追加
* `set_scenario` の parameters.properties.slides.items.properties に bodyMarkdown を追加（type: string, optional）
* `set_scenario` の description に「bodyMarkdown は段落・小見出し含む詳細本文。ユーザーが精緻な内容を求めた場合に使う」追記
* `update_slide` の parameters にも同様に追加
* ハンドラーで受け取った bodyMarkdown を SSE payload に含める（既存 onScenario / onSlideUpdate コールバック経由）

Files:
* src/infrastructure/tools/scenario-tool.ts - bodyMarkdown フィールド追加

Discrepancy references:
* なし

Success criteria:
* TypeScript ビルドが通る
* `set_scenario({ slides: [{ ..., bodyMarkdown: '...' }] })` が AI から呼べる

Context references:
* src/infrastructure/tools/scenario-tool.ts (Lines 8-90) - 既存 schema

Dependencies:
* Phase 1 完了

### Step 5.2: slide-parser 更新

src/application/slide-parser.ts を確認・更新：

* 既存パーサーが SlideItem を構築する箇所で bodyMarkdown フィールドも保持する（fallback 用）
* SSE payload → SlideItem 変換で bodyMarkdown を引き継ぐ
* ファイルが存在しない場合はスキップ

Files:
* src/application/slide-parser.ts - SlideItem 変換時に bodyMarkdown 保持

Success criteria:
* TypeScript ビルドが通る

Context references:
* src/application/slide-parser.ts - 既存パース実装

Dependencies:
* Phase 1, Step 5.1 完了

## Implementation Phase 6: UI 拡張

<!-- parallelizable: true -->

### Step 6.1: モードトグル

src/app/components/slides/mode-toggle.tsx を新規作成：

* props: `{ mode: 'code' | 'image-then-pptx'; onChange: (mode) => void; disabled?: boolean }`
* 2 ボタン segmented control 風 UI（既存 model-selector のスタイルを踏襲）
* `disabled` が true（env 未設定など）の時、image-then-pptx ボタンを灰色化 + tooltip「AZURE_IMAGE_ENDPOINT 未設定」

Files:
* src/app/components/slides/mode-toggle.tsx - モード切替 UI

Success criteria:
* クリックで onChange が呼ばれる
* disabled 状態で image-then-pptx が選択できない

Context references:
* src/app/components/chat/model-selector.tsx - 既存 selector UI

Dependencies:
* なし（独立）

### Step 6.2: 画像カード

src/app/components/slides/slide-image-card.tsx を新規作成：

* props: `{ slide: SlideItem; onRegenerate: (slideNumber: number) => void; isStreaming: boolean }`
* 表示：
  * `imageUrl` ありなら `<img src={imageUrl}>` サムネ（クリックで lightbox 拡大）
  * `imageStatus === 'generating'` ならスケルトン + spinner
  * `imageStatus === 'error'` ならエラーメッセージ + 再試行ボタン
  * `imageStatus === 'idle'` なら placeholder + 「画像生成」ボタン
* 「再生成」ボタンは `imageStatus === 'ready'` の時だけ表示

Files:
* src/app/components/slides/slide-image-card.tsx - 画像サムネ＋再生成 UI

Success criteria:
* 各状態が UI に反映される
* 拡大プレビューが Esc キーで閉じる

Context references:
* src/app/components/slides/slide-panel.tsx (既存スライドカード描画) - スタイル参考

Dependencies:
* Phase 1 完了

### Step 6.3: 本文エディター

src/app/components/slides/slide-body-editor.tsx を新規作成：

* props: `{ slide: SlideItem; onUpdate: (bodyMarkdown: string) => void; onRegenerate: () => void }`
* textarea (markdown) + プレビューの toggle
* 編集中は dirty フラグ表示、blur or "保存" で onUpdate 呼び出し
* 「この内容で画像を再生成」ボタン
* react-markdown でプレビュー描画（既存利用済み）

Files:
* src/app/components/slides/slide-body-editor.tsx - bodyMarkdown エディター

Success criteria:
* 編集後 SlideItem.bodyMarkdown が更新される
* 再生成ボタンで onRegenerate が呼ばれる

Context references:
* src/app/components/slides/slide-panel.tsx (Lines 200+) - 既存 SlideItem 描画パターン
* package.json - react-markdown / remark-gfm が既存

Dependencies:
* Phase 1 完了

### Step 6.4: slide-panel 統合

src/app/components/slides/slide-panel.tsx を更新：

* ヘッダーに `<ModeToggle>` を配置
* image-then-pptx モード時：
  * 各スライドカードに `<SlideImageCard>` と `<SlideBodyEditor>` を含める
  * 「全画像生成」ボタンを表示（generationMode が image-then-pptx かつ全 imageStatus が idle の時）
  * 「PPTX を生成」ボタンの活性化条件を「全 imageStatus === 'ready'」に変更
* code モード時：既存挙動を維持
* `imageStatus` が `'generating'` のカードは半透明 + skeleton overlay

Files:
* src/app/components/slides/slide-panel.tsx - モード対応パネル統合

Success criteria:
* モード切替で UI が即時変わる
* 既存 code モードの挙動が壊れていない

Context references:
* src/app/components/slides/slide-panel.tsx (全体) - 既存実装

Dependencies:
* Step 6.1, 6.2, 6.3 完了

### Step 6.5: chat-container と SSE 統合

src/app/components/chat/chat-container.tsx を更新：

* state に `generationMode: 'code' | 'image-then-pptx'` を保持
* API call (`/api/chat`) の body に `generationMode` を含める
* SSE event ハンドラーに `image_generated` を追加：
  * payload: `{ slideNumber, imageId, url, prompt }` (DR-06)
  * 対応する SlideItem.imageUrl / imageId / imagePrompt / imageStatus を `'ready'` に更新
* **imageStatus 遷移責務（DR-04）**：個別/バッチ生成リクエスト発行時に該当 SlideItem の imageStatus を **client side で** `'generating'` に設定する。SSE `image_generated` 受信時に `'ready'` へ。エラー時に `'error'`。
* 個別再生成ハンドラーを実装：`buildImagePrompt(slide, brief)` または既存 `slide.imagePrompt` から prompt を作り、`POST /api/skills/image` を直接呼び、結果を SlideItem に反映
* 一括生成ハンドラー：チャット欄に「全スライドの画像を生成してください」を送るか、`/api/skills/image` を for ループで叩く（モード切替で前者を採用）

Files:
* src/app/components/chat/chat-container.tsx - state + SSE 拡張

Success criteria:
* モード切替が API に渡る
* `image_generated` イベント受信で UI が更新される
* 個別再生成ボタンが動作する

Context references:
* src/app/components/chat/chat-container.tsx - 既存 SSE handler

Dependencies:
* Step 3.3, 6.4 完了

## Implementation Phase 7: インフラ・環境変数

<!-- parallelizable: false（Dockerfile / Bicep / package.json は最終ビルドに影響） -->

### Step 7.1: Dockerfile に LibreOffice + poppler + 日本語フォントを追加

Dockerfile を更新：

* base image `node:24-slim`（既存）の `apt-get install` セクションに以下を追加:
  * `libreoffice-impress`（または `libreoffice-core` + `libreoffice-impress`）
  * `poppler-utils`（`pdftoppm`）
  * `fonts-noto-cjk`（日本語表示）
  * `fontconfig`
* `apt-get clean && rm -rf /var/lib/apt/lists/*` でレイヤサイズを削減
* **warm-up**: 同レイヤ末尾で `soffice --headless -env:UserInstallation=file:///tmp/uno-warmup-build --convert-to pdf --outdir /tmp /usr/share/doc/libreoffice-core/README || true` を 1 回走らせて UNO の初回 jar コンパイルキャッシュを image に焼く。warmup 専用の profile ディレクトリを選ぶことで、ランタイムの per-PID profile と衝突させない（DD-19 対応）。build 末尾で `rm -rf /tmp/uno-warmup-build /tmp/README.pdf` して残骨を残さない
* `ENV HOME=/tmp` を設定（LibreOffice が `$HOME/.config` に書き込もうとするため、書き込み可能領域へ）

Files:
* Dockerfile - apt パッケージ追加 + warm-up + HOME

Discrepancy references:
* DR-01 (Resolution: LibreOffice 採用), DR-08, DR-09, WI-09

Success criteria:
* `docker build` 成功
* `docker run ... soffice --version` が成功
* `docker run ... pdftoppm -v` が成功

Context references:
* .copilot-tracking/research/subagents/2026-05-20/option-b-feasibility-research.md §B.2 / §B.3

Dependencies:
* なし

### Step 7.2: Bicep の Container App スペック調整

infra/main.bicep を更新：

* Container App resources を `cpu: 1.0, memory: '2.0Gi'` 以上に引き上げ（LibreOffice 200〜400MB × 1〜2 concurrent + Node + sharp 想定、実測で 1.2〜1.6 GiB ピーク）
* `scale.minReplicas: 1` を強制（cold start での soffice 初回起動コスト 5〜10 秒回避）
* env 配列に追加:
  * `AZURE_IMAGE_ENDPOINT` (param 経由)
  * `AZURE_IMAGE_DEPLOYMENT` (既定 `gpt-image-2`)
  * `AZURE_IMAGE_API_VERSION` (既定 `2025-04-01-preview`)
  * `IMAGE_AUTH_MODE` (既定 `entra`)
  * **`BBOX_VISION_MODEL`** (既定 `gpt-4o`, DR-11)
  * **`BBOX_VISION_CONCURRENCY`** (既定 `3`, DR-13)
  * `LIBREOFFICE_CONCURRENCY` (既定 `1`、メモリ 2 GiB スペックの安全側。負荷試験後に設定調整。DD-16)
* managed identity に Foundry リソースの **Cognitive Services User** ロールの roleAssignment を追加（`imageEndpoint != ''` の condition 下）

Files:
* infra/main.bicep

Discrepancy references:
* DD-04 (minReplicas=1), DR-08

Success criteria:
* `az deployment group what-if` で diff を確認できる
* imageEndpoint 未指定でも既存デプロイが壊れない

Context references:
* infra/main.bicep (全体) - 既存定義

Dependencies:
* なし

### Step 7.3: package.json に新規依存追加

package.json の `dependencies` に追加：

* `pixelmatch`: `^6.0.0`
* `pngjs`: `^7.0.0`
* `sharp-phash`: `^2.1.0`（既存 `sharp` と併用）
* `p-queue`: `^8.0.1`
* `zod`: `^3.23.0`（既存にあれば不要）

devDependencies に：

* `@types/pixelmatch`, `@types/pngjs`

`pnpm install` 後 `pnpm-lock.yaml` をコミット対象に。

Files:
* package.json
* pnpm-lock.yaml (自動更新)

Success criteria:
* `pnpm install` 成功
* `pnpm build` で新規 import が解決

Context references:
* .copilot-tracking/research/subagents/2026-05-20/option-b-feasibility-research.md §C

Dependencies:
* なし

### Step 7.4: ドキュメント更新

* README.md: 新環境変数 + Docker image に LibreOffice 同梱の旨を追記、image-then-pptx モード説明
* AGENTS.md: 「Image Generation」セクション + 「Quality Gate」セクション追加、ファイル一覧に `src/infrastructure/render/libreoffice-renderer.ts` 等を追記

Files:
* README.md
* AGENTS.md

Success criteria:
* markdown lint OK

Dependencies:
* Phase 2, Phase 4, Phase 4B 完了

## Implementation Phase 8: 最終検証

<!-- parallelizable: false -->

### Step 8.1: ビルド検証

`pnpm install && pnpm build` で TypeScript エラーなしを確認。

### Step 8.2: Docker ビルドと smoke 検証

* `docker build -t copilot-sdk-agent:test .`
* `docker run --rm copilot-sdk-agent:test soffice --version` で LibreOffice バージョン確認
* `docker run --rm copilot-sdk-agent:test pdftoppm -v` で poppler 確認
* image サイズが許容範囲（< 2 GB を目安）か `docker images` で確認

### Step 8.3: 手動動作確認（ローカル `pnpm dev`）

1. code モードで既存 demo が破壊されていない
2. image-then-pptx モードに切替 → scenario 生成 → 「全画像生成」 → 各 SlideItem.imageUrl 更新 → 「PPTX を生成」 → PPTX ダウンロード → PowerPoint で開いてテキスト編集可能を確認
3. 品質バッジが数秒〜数十秒後に pass/warn/fail で表示される
4. fallback 経由（bbox 抽出を強制失敗させたケース）でも PPTX が返り、バッジに「fallback」が表示される
5. `AZURE_IMAGE_ENDPOINT` 未設定で image-then-pptx が disabled
6. 並行 2 リクエストで UNO bootstrap 競合なし（pull-down log で `Unable to bootstrap` がないこと）

### Step 8.4: Lint

`pnpm lint` で警告なしを確認。

### Step 8.5: ブロッカー報告

minor 以外の問題（API 仕様差、SDK の image 入力非互換、SSE 制限、LibreOffice の文字化け、image diff 閾値の不適合など）があれば、Planning Log の Suggested Follow-On Work に追記し、ユーザーに次の研究・計画フェーズを推奨。

## Dependencies

* Node ≥ 24, pnpm
* Azure Foundry に gpt-image-2 デプロイ
* Container App の managed identity に Foundry 読み取り権限
* 新規 npm: `pixelmatch`, `pngjs`, `sharp-phash`, `p-queue`, `zod`
* 新規 Docker: `libreoffice-impress`, `poppler-utils`, `fonts-noto-cjk`
* Container App メモリ最低 2 GiB / minReplicas=1

## Success Criteria

* code モード / image-then-pptx モードの両方で動作する
* image-then-pptx モードで一括・個別の画像再生成、bodyMarkdown 編集による再生成が動く
* 生成 PPTX のテキストが PowerPoint で編集可能（1 枚画像貼り付けではない）
* 外部スキル `pptx-from-image` が `skills/pptx-from-image/` に取り込まれ Copilot SDK にロードされる
* LibreOffice + poppler が Docker image に同梱され、コンテナ内で動作
* 品質バッジが非同期で表示され、PPTX ダウンロードはブロックされない
* bbox 抽出失敗時に方式 C へフォールバックし、必ず PPTX を返す
* Linux Container Apps で動作（PowerPoint COM 不要）
