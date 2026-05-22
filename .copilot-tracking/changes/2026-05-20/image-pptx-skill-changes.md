<!-- markdownlint-disable-file -->
# Release Changes: 画像生成パス追加とストーリー精緻化（Option B: SKILL + LibreOffice）

**Related Plan**: image-pptx-skill-plan.instructions.md
**Implementation Date**: 2026-05-20

## Summary

Markdown ストーリー精緻化 + Azure Foundry gpt-image-2 による画像生成プレビューループ + 外部スキル `pptx-from-image` 取り込みによる PPTX ネイティブ再構築 + LibreOffice headless ベースの非同期品質ゲートを実装する。既存の Markdown→PPTX 直接パス（code モード）はモード切替で残す。

## Changes

### Added

* src/infrastructure/image/azure-image-client.ts - Azure Foundry Image API (gpt-image-2) ラッパー。`DefaultAzureCredential`（または API key）で認証し、`generateImage(prompt, opts)` で b64_json レスポンスを `Buffer` に変換して返す。`getImageClient()` は `AZURE_IMAGE_ENDPOINT` 未設定時に `null` を返してグレースフルに降格する（DD-07 / 環境変数で deployment 名差し替え対応）
* src/infrastructure/image/image-cache.ts - インメモリ画像キャッシュ（`Map<imageId, { data, mimeType, createdAt }>`）。`putImage` / `getImage` / `clearImageCache` を提供。TTL 1 時間 + 5 分ごとの purge interval（`unref()` で event loop 非保持）。マルチインスタンス時の Blob Storage 移行は WI-01 として follow-on
* src/infrastructure/tools/image-tool.ts - Copilot SDK 用カスタムツール 2 種：`createGenerateSlideImageTool`（1 枚生成）と `createGenerateAllImagesTool`（バッチ生成、並列度 3）。両者とも `ImageGeneratedEvent { slideNumber, imageId, imageUrl, prompt }` を `onImageGenerated` callback で発火し、chat route が SSE に転送できる形にしてある。`scenario-tool.ts` と同じ factory + `defineTool` パターンを踏襲
* src/application/image-prompt-builder.ts - `buildImagePrompt(slide, brief)` と `getEffectivePrompt(slide, brief)`。title / keyMessage / bodyMarkdown（先頭段落最大 500 字） or bullets と DesignBrief の tone / visualStyle / colorMood / density / audience を統合して英語の簡潔な画像生成 prompt を組み立てる。`slide.imagePrompt` がある場合は再利用（DR-05 対応）
* src/app/api/skills/image/route.ts - `POST /api/skills/image`。body `{ slideNumber, prompt }` を受けて `generateImage()` で 1 枚画像を生成し、`putImage()` でキャッシュ後 `{ imageId, slideNumber, imageUrl, prompt }` を返却。`getImageClient()` が `null` の場合は 503 で graceful degrade（Step 3.1）
* src/app/api/skills/image/[id]/route.ts - `GET /api/skills/image/[id]`。`getImage()` でキャッシュ参照し、PNG binary を `Content-Type: image/png` + `Cache-Control: private, max-age=3600` で返却。Next 16 の async params に準拠。キャッシュミスは 404（Step 3.2）
* skills/pptx-from-image/SKILL.md - 外部スキル `pptx-from-image` を `akhayash_microsoft/Hitachi-IT-Dev` から adapt。スライド画像 + シナリオ本文を入力に bbox 抽出用 JSON スキーマ（`textbox` / `auto_shape` / `line` / `picture` の 4 種、`bbox=[x,y,w,h]` 0..1 正規化、`z=1..4` の z-order 規約）と「フルスライドの単一 picture を返してはならない」というハードルールを定義。PowerPoint COM → pptxgenjs+sharp / EMU → 0..1 への適応ノートも含む（Step 4.1）
* skills/pptx-from-image/NOTICE.md - 外部スキル取り込みのアトリビューション（Step 4.1）
* src/domain/entities/slide-layout.ts - `Bbox` / `ZLayer` / `TextAlign` / `TextboxElement` / `AutoShapeElement` / `LineElement` / `PictureElement` / `LayoutElement` / `SlideLayout` 型と zod `SlideLayoutSchema`（`discriminatedUnion('type', ...)` + `superRefine` で id 一意・bbox 範囲・picture `sourceCrop` 範囲を検証）。bbox は 0..1 正規化、float 誤差は `> 1.000001` 閾値で許容（Step 4.2）
* src/infrastructure/image/bbox-extractor.ts - `extractLayout(imageBuffer, { slideNumber, signal, timeoutMs })` を実装。Copilot SDK の `attachments` API がファイルパスを要求するため `os.tmpdir()` + `randomUUID()` で一時 PNG に書き出して attach → `assistant.message` イベントで応答を捕捉 → ```json フェンスを剥がして `SlideLayoutSchema.safeParse` → 失敗時はスキーマエラーメッセージを hint に 1 回だけリトライ → 失敗継続なら `BboxExtractionError`、deadline 超過は `BboxTimeoutError`。`BBOX_VISION_MODEL`（既定 `gpt-4o`）と `BBOX_VISION_CONCURRENCY`（既定 3、`getBboxConcurrency()` で公開）の env を読む。一時ファイルは `finally` で確実に削除。SDK permission handler は `custom-tool` 許可 / `read` は当該 tmp ファイルと SDK tool-output のみ許可（Step 4.3）
* src/application/layout-to-pptx.ts - `applyLayoutToSlide(pres, layout, sourceImage)` を実装。bbox 0..1 を pptxgenjs インチ座標へ変換（`pres.layout` を見て 16:9=10×5.625 / LAYOUT_WIDE=13.33×7.5 / 16:10 / 4:3 を分岐）、要素を z 昇順でレンダリング。`picture` は sharp の `extract` で sourceCrop をクロップ → PNG → base64 data URI → `slide.addImage`、`auto_shape` は `pres.ShapeType.rect` + fill/line、`line` は `pres.ShapeType.line` + 線色幅、`textbox` は `slide.addText` で fontSize/bold/italic/align/color/`valign:'top'`。hex は `#` を剥がしてから pptxgenjs に渡す（Step 4.4）
* src/types/sharp-phash.d.ts - `sharp-phash` 本体 (`(image) => Promise<string>`) と subpath `sharp-phash/distance` (`(a,b) => number`) のための ambient type shim。npm パッケージが型を同梱していないため必要（Step 4B.2）
* src/infrastructure/render/libreoffice-renderer.ts - `renderPptxToPngs(pptxBuf, { jobId, dpi=150, timeoutMs=60000 })` と `cleanupRenderJob(jobId)` を実装。`fs.mkdtemp(path.join(os.tmpdir(), 'job-<jobId>-'))` で per-request workDir 作成 → `<workDir>/input.pptx` に書き出し → `soffice --headless -env:UserInstallation=file://<workDir>/lo-profile --convert-to pdf --outdir <workDir> input.pptx` → `pdftoppm -png -r <dpi> <workDir>/input.pdf <workDir>/slide` → `slide-<n>.png` を numeric sort して返却。`child_process.spawn` を `AbortController` で包み、`timeoutMs` 経過で `SIGKILL`。`LIBREOFFICE_CONCURRENCY`（既定 1, DD-16）を module-level `p-queue` で適用し soffice+pdftoppm 全体をキュー化。**workDir はここではクリーンアップしない** — 比較フェーズで PNG を読む必要があるため caller が `cleanupRenderJob(jobId)` を finally で呼ぶ責務（`jobWorkDirs: Map<jobId, string>` で追跡）（Step 4B.1）
* src/infrastructure/image/image-comparator.ts - `compareImages(originalPath, renderedPath): Promise<{ diffPixelRatio, phashDistance }>` を実装。両画像を `sharp().resize({ width: 1024, fit: 'inside' }).ensureAlpha().raw()` で同 width に整列 → 高さ差は短い方に crop して pixelmatch で per-pixel diff を計算 → 別途 `sharp-phash` で 64bit pHash を取り `sharp-phash/distance` で Hamming distance を併走。`evaluateQuality({diffPixelRatio, phashDistance})` で `pass`(diff≤0.12 && phash≤10) / `warn`(diff≤0.15 && phash≤14) / `fail`(それ以外) の 3 段判定。閾値は SKILL 参考値で WI として後続キャリブレーション（Step 4B.2）
* src/app/api/skills/pptx/quality/cache.ts - 品質判定結果のインメモリキャッシュ。`QualityState = { status: 'pending'|'done'|'error', verdict?, perSlide?, error?, updatedAt }` を `Map<jobId, QualityState>` に保持。`setQualityVerdict` / `getQualityVerdict` / `clearQualityCache` を export し、1 時間 TTL + 5 分 purge interval（`unref()` で event loop 非保持）（Step 4B.3）
* src/app/api/skills/pptx/quality/[jobId]/route.ts - `GET /api/skills/pptx/quality/[jobId]` のみ。`getQualityVerdict()` で cache 参照し `{ jobId, status, verdict?, perSlide?, error? }` を返却。未知 jobId は 404。Next 16 の async params に準拠（Step 4B.3）
* src/app/components/slides/mode-toggle.tsx - `'code' | 'image-then-pptx'` の segmented control。`GenerationMode` 型 export + `ModeToggle` コンポーネント。lucide `Code2` / `Image` アイコン、`aria-pressed` 付き 2 ボタン、`imageModeDisabled` / `imageModeDisabledHint` で AZURE_IMAGE_ENDPOINT 未設定時の表示制御をサポート（Step 6.1）
* src/app/components/slides/slide-image-card.tsx - `slide.imageStatus` に応じてサムネ表示を切替（idle→「画像生成」ボタン、generating→`Loader2` スピナー、error→`AlertCircle` + 再試行、ready→`<img>` サムネ + `Maximize2` でライトボックス）。ライトボックスは `fixed inset-0` + ESC キー検知 + click-outside で閉じる。`role="dialog"` / `aria-modal` / `aria-label` を付与（Step 6.2）
* src/app/components/slides/slide-body-editor.tsx - `bodyMarkdown` 編集用 textarea + react-markdown プレビュートグル。ローカル `draft` state + 同期トラッキング（`lastSynced` を render 中比較で更新し set-state-in-effect lint を回避）、blur / 保存ボタンで `onUpdate(slideNumber, body)` をコミット。「この本文で画像を再生成」ボタンは commit 後に `onRegenerateImage(slideNumber)` を呼ぶ（Step 6.3）

### Modified

* src/app/api/skills/pptx/route.ts - `PptxCodeRequest` を `generationMode: 'code' \| 'image-then-pptx'` + `imageIds?: Array<{slideNumber, imageId}>` + `scenario?: ScenarioSlide[]` で拡張。`image-then-pptx` モードでは `image-cache` から画像を読み込み、p-queue（並列度 `getBboxConcurrency()`）で bbox 抽出 → `applyLayoutToSlide` を並走実行。デッキ全体に 90s の `AbortController` を張り、deadline 到達／全スライド失敗時はデッキ全体を Hybrid C フォールバック（背景画像 + シナリオタイトル帯 + bullets/bodyMarkdown の半透明本文パネル）で再構築し `x-pptx-fallback: hybrid-c` を返す。個別スライドだけ失敗した場合は当該スライドのみ Hybrid C 化して `x-pptx-fallback: hybrid-c-partial; slides=2,5` を返す。`image-then-pptx` のスライドサイズは 16:9 既定（10×5.625）。既存の `code` モードは（`LAYOUT_WIDE` 13.33×7.5）従来挙動を維持（Step 4.5）。**Phase 4B 追記**: 成功時／フォールバック時の両方で `crypto.randomUUID()` で `jobId` を発行し、レスポンスヘッダー `x-pptx-job-id` に乗せて即時返却。`kickOffQualityCheck()` を fire-and-forget で起動し、`setQualityVerdict({status:'pending'})` → `renderPptxToPngs(pptxBuf, {jobId})` → 各 rendered slide に対応する original image を `os.tmpdir()/quality-originals-<jobId>/slide-<n>.png` に書き出し → `compareImages(orig, rendered)` + `evaluateQuality` → worst-of-all 集約で overall verdict 算出 → `setQualityVerdict({status:'done', verdict, perSlide})`。finally で `cleanupRenderJob(jobId)` と originals dir 削除。例外は `setQualityVerdict({status:'error', error})` に記録（Step 4B.4）
* skills/generate-pptx/SKILL.md - 「生成モード」セクションを追加し、`code` モード（このスキル）と `image-then-pptx` モード（`pptx-from-image` SKILL）の役割分担、スライド寸法（13.33×7.5 vs 10×5.625）、Hybrid C フォールバックヘッダの存在を明記（Step 4.6）
* skills/create-slide-story/SKILL.md - フィールド表に `bodyMarkdown` 行を追加（1–3 短段落 + サブ見出し。スピーカーノートではなくスライド本体の精緻な本文。`image-then-pptx` の画像生成ソーステキストとしても利用）（Step 4.6）

* src/domain/entities/slide-work.ts - `SlideItem` に `bodyMarkdown` / `imageUrl` / `imagePrompt` / `imageStatus` を optional 追加、`SlideWork` に `generationMode` optional 追加、`SlidePhase` に `'imagining'` を追加（既存利用箇所は後方互換）
* src/infrastructure/tools/scenario-tool.ts - `ScenarioSlide` interface と `set_scenario` / `update_slide` の parameters schema に `bodyMarkdown` (optional string) を追加。description にも refined story 用途を追記。ハンドラーは既存の `onScenario` / `onSlideUpdate` 経由で SSE payload に `bodyMarkdown` を含めて転送（Step 5.1）
* src/application/slide-parser.ts - markdown→SlideItem 変換時にヘッダ直下の生 body を `bodyMarkdown` として保持（fallback パス用、Step 5.2）
* src/app/api/chat/route.ts - `ChatRequest` に `generationMode: 'code' | 'image-then-pptx'`（既定 `'code'`）を追加。`image-then-pptx` かつ `getImageClient() !== null` の場合のみ `createGenerateSlideImageTool` / `createGenerateAllImagesTool` を tools に追加し、`onImageGenerated` callback で SSE `image_generated` イベント（`{ slideNumber, imageId, imageUrl, prompt }`）を送出（DR-06）。`skillDirectories` をモードで切替（`generate-pptx` ↔ `pptx-from-image`）。systemMessage にモード固有指示を追加（image-then-pptx では `generate_all_images` 呼び出しと、`update_slide` 直後の `generate_slide_image` 呼び出しを案内。画像 client 未設定時はその旨ユーザーに伝える）（Step 3.3、DD-01）
* src/app/components/slides/slide-panel.tsx - `SlidePanelProps` に `generationMode` / `onModeChange` / `onGenerateImage` / `onRegenerateImage` / `onGenerateAllImages` / `onUpdateSlideBody` / `imageModeDisabled` / `imageModeDisabledHint` を追加。ヘッダー右側に `<ModeToggle>` を配置し、`image-then-pptx` モード時は (1) 各 `<SlideCard>` に `<SlideImageCard>` + `<SlideBodyEditor>` を render、(2) `hasIdleOrErrorImage` 時に「全画像生成」ボタン表示、(3)「PPTX を生成」ボタンの活性条件を `slides.every(s => s.imageStatus === 'ready')` に切替。新規 `handleImageModePptx` は `imageUrl` から imageId を抽出して `imageIds[]` を構築し `{ generationMode, imageIds, scenario, title }` で `/api/skills/pptx` に POST、`x-pptx-fallback` ヘッダを警告として表示（Step 6.4）
* src/app/components/chat/chat-container.tsx - `slideWork.generationMode` を state に保持（既定 `'code'`、`generationMode ?? 'code'` で防御）。`/api/chat` POST に `generationMode` を含める。SSE 解析ループに `image_generated` ブランチを追加し、対応する `SlideItem` の `imageUrl` / `imagePrompt` / `imageStatus='ready'` を更新。`generateOneImage` / `handleRegenerateImage` / `handleGenerateAllImages` / `handleUpdateSlideBody` / `handleModeChange` を実装し `<SlidePanel>` に渡す。`generateOneImage` 内で `/api/skills/image` が 503 を返した場合は `setImageModeDisabled(true)` でトグルを抑制。`toSlideItem(s, previous?)` ヘルパで `set_scenario` / `slide_update` 受信時に既存スライドの画像状態を保持（Step 6.5）
* src/app/components/skills/pptx-download-card.tsx - ダウンロード時にレスポンスヘッダー `x-pptx-job-id` / `x-pptx-fallback` を捕捉。`jobId` がある場合のみ `/api/skills/pptx/quality/<jobId>` を 2 秒間隔で polling（最大 30 回 ≒ 60 秒）。`status === 'done'` で `pass`(緑) / `warn`(黄) / `fail`(赤) バッジを表示、`fail` 時は「デザインが大きくずれています。再生成しますか？」のヒントを併記。404 / エラーは無音で `unavailable` に降格し UI に影響させない。`fallback` ヘッダは別バッジで常時表示。ダウンロードボタンは polling と独立して即時活性（Step 6.6）
* Dockerfile - runner stage に `libreoffice-impress` + `libreoffice-core` + `poppler-utils` + `fonts-noto-cjk` + `fontconfig` を `--no-install-recommends` 付きで追加、`/var/lib/apt/lists/*` クリーンアップでイメージサイズ抑制。`-env:UserInstallation=file:///tmp/uno-warmup-build` の専用プロファイルで build-time warm-up を 1 回実行し `/tmp/uno-warmup-build` を削除（DD-19）。`fc-list \| grep -i noto` の sanity check で Noto フォント未導入時はビルド失敗。`ENV HOME=/tmp` を設定（Step 7.1）
* package.json - dependencies に `pixelmatch ^6.0.0`, `pngjs ^7.0.0`, `sharp-phash ^2.1.0`, `p-queue ^8.0.1`, `zod ^3.23.0` を追加。devDependencies に `@types/pixelmatch ^5.2.6`, `@types/pngjs ^6.0.5` を追加（Step 7.3）
* pnpm-lock.yaml - 自動更新（`pnpm install` 後、解決バージョン: p-queue 8.1.1 / pixelmatch 6.0.0 / pngjs 7.0.0 / sharp-phash 2.2.0 / zod 3.25.76）
* infra/main.bicep - Container App リソースを Bicep 管理下に追加し、image-then-pptx 用環境変数 7 つ（`AZURE_IMAGE_ENDPOINT` / `AZURE_IMAGE_DEPLOYMENT` 既定 `gpt-image-2` / `AZURE_IMAGE_API_VERSION` 既定 `2025-04-01-preview` / `IMAGE_AUTH_MODE` 既定 `entra` / `BBOX_VISION_MODEL` 既定 `gpt-4o` / `BBOX_VISION_CONCURRENCY` 既定 `3` / `LIBREOFFICE_CONCURRENCY` 既定 `1`）を `template.containers[0].env` に注入。`cpu: 1.0` / `memory: '2.0Gi'` / `scale.minReplicas: 1`（DD-04 cold-start 回避）を強制。`SystemAssigned` managed identity を付与し、`foundryAccountName` パラメータ指定かつ `azureImageEndpoint != ''` のときに **Cognitive Services User** ロール（roleDefinitionId `a97b65f3-24c7-4388-baec-2e87135dc908`）を Foundry リソースへ `guid()` 決定的名で付与。`containerImage` パラメータでイメージ参照を切り替え、GitHub Actions の `az containerapp update --image` と共存（Step 7.2）
* README.md - Environment Variables テーブルに新規 7 環境変数 + `AZURE_IMAGE_API_KEY` を追記。新セクション「Image-then-PPTX Mode」で 2 モード比較、image-then-pptx ワークフロー（シナリオ → 全画像生成 → レビュー → PPTX → 非同期品質バッジ）、LibreOffice/poppler/Noto フォントのランタイム依存、最小メモリ 2 GiB 要件、`minReplicas: 1` 推奨、Hybrid C フォールバック（`x-pptx-fallback` ヘッダ）を解説（Step 7.4）
* AGENTS.md - Overview を更新（infrastructure に「画像生成、LibreOffice レンダラー」を追記）。Key Files テーブルに `pptx/quality/[jobId]/route.ts` / `skills/image/route.ts` / `skills/image/[id]/route.ts` / `slide-layout.ts` / `image-prompt-builder.ts` / `layout-to-pptx.ts` / `image-tool.ts` / `azure-image-client.ts` / `image-cache.ts` / `bbox-extractor.ts` / `image-comparator.ts` / `libreoffice-renderer.ts` / `skills/pptx-from-image/SKILL.md` を追加。新セクション「Image Generation（image-then-pptx モード）」と「Quality Gate（非同期品質バッジ）」を追加し、各コンポーネント・フロー・閾値キャリブレーションの将来計画を記載。Skill System に `pptx-from-image` を追記（Step 7.4）

### Removed

## Additional or Deviating Changes

* Phase 8 ではアプリケーションソースは変更なし（検証のみ）。ビルドキャッシュ衝突回避のため `.next` を都度削除して `pnpm build` を実行する手順を採用（plan 注記参照）。

## Manual Verification Plan

以下は Docker / 実機での手動検証が必要なシナリオ。本 Phase 8 ではローカル環境（CI/シェル）に Docker・ブラウザ・dev server を持たないため、QA 担当が実行する手順としてここに残す。

### Docker smoke check（実機）

1. `docker build -t copilot-sdk-agent:phase8 .` で全 stage が成功すること（特に `fc-list \| grep -i noto` ステップで失敗しないこと）。
2. ビルド済みイメージで以下が成功すること:
   * `docker run --rm copilot-sdk-agent:phase8 soffice --version` → `LibreOffice 7.x` 系が表示
   * `docker run --rm copilot-sdk-agent:phase8 pdftoppm -v` → poppler のバージョン情報が表示
   * `docker run --rm copilot-sdk-agent:phase8 fc-list \| grep -i noto` → Noto CJK エントリが返る
3. 最終イメージサイズが `< 2 GB`（DD-17）。`docker image inspect --format='{{.Size}}'` で目視確認。
4. `docker run --rm -e PORT=3000 -p 3000:3000 copilot-sdk-agent:phase8` で起動し `/api/health` が 200。

### code モード回帰（既存挙動の非破壊確認）

1. `pnpm dev` 起動 → 「PowerPoint で会社紹介スライドを 5 枚作って」のような指示。
2. パネルにスライドが `set_scenario` 経由で表示される。
3. 「PPTX を生成」ボタンを押下 → ダウンロードカードが表示され PPTX が落ちる。
4. PowerPoint で開いてテキスト要素が編集可能であること。

### image-then-pptx モード（フルパス）

1. `AZURE_IMAGE_ENDPOINT` / `AZURE_IMAGE_DEPLOYMENT` / `AZURE_IMAGE_API_VERSION` を `.env.local` に設定（または Container App env）。
2. UI でモードトグルを `image-then-pptx` に切替 → 既存スライドカードに画像エリアが現れる。
3. 「全画像生成」を押下 → 並列度 3 で `image_generated` SSE イベントが届き、各カードにサムネが表示される。
4. 任意の `slide-body-editor` で本文を修正 → 「この本文で画像を再生成」→ 単一スライドだけ `generating` → `ready` に遷移。
5. 「PPTX を生成」ボタン押下 → レスポンスヘッダー `x-pptx-job-id` を受けてダウンロードが即時開始（blocking なし）。
6. ダウンロード後 60s 以内に `pptx-download-card` が `/api/skills/pptx/quality/<jobId>` polling で `pass` / `warn` / `fail` バッジを表示。
7. PowerPoint で開き、各スライドが textbox / auto_shape / line / picture の 4 要素タイプから再構築されていること（**1 枚画像貼り付けではない**）。

### Hybrid C フォールバック検証

1. `BBOX_VISION_MODEL` を存在しない値（例: `gpt-nonexistent`）に設定して再起動。
2. image-then-pptx で PPTX 生成 → レスポンスヘッダーに `x-pptx-fallback: hybrid-c` または `x-pptx-fallback: hybrid-c-partial; slides=...` が乗ること。
3. 落ちた PPTX を開き、背景画像 + タイトル帯 + 半透明本文パネルで構成されていること。
4. UI のダウンロードカードに fallback バッジが常時表示されること。

### 環境変数 gating

1. `AZURE_IMAGE_ENDPOINT` を未設定にして再起動。
2. モードトグルの `image-then-pptx` ボタンが disabled で、ホバーに "画像生成 API が構成されていません" 等のヒントが表示されること。
3. code モードのみで PPTX が問題なく生成できること。

### 並行 UNO 衝突（DD-15）

1. image-then-pptx モードで 2 つのブラウザタブから同時に「PPTX を生成」を実行。
2. サーバーログで `soffice` lock 衝突エラーが出ないこと（per-PID `-env:UserInstallation` で隔離されている）。
3. 両リクエストが正常に PPTX を返し、品質判定もそれぞれ独立して `done` になること。

### Container App デプロイ（azd up 後）

1. `minReplicas: 1` で常時 1 インスタンス稼働、cold start が発生しないこと。
2. メモリ使用量が 2 GiB 上限内に収まること（LibreOffice 同時 1 並列前提）。
3. Foundry managed identity が Cognitive Services User ロール持ち（`az role assignment list --assignee <principalId>`）。
4. Container Apps の log stream で `image_generated` ログと品質判定ログが流れること。

## Release Summary

### Phase 別実装サマリ

* **Phase 1 — ドメイン型拡張**: `SlideItem` に `bodyMarkdown` / `imageUrl` / `imagePrompt` / `imageStatus`、`SlideWork` に `generationMode`、`SlidePhase` に `'imagining'` を追加。
* **Phase 2 — 画像生成インフラ**: Azure Foundry gpt-image-2 クライアント、TTL 1h インメモリ画像キャッシュ、`generate_slide_image` / `generate_all_images` カスタムツール、image prompt builder。
* **Phase 3 — API**: `/api/skills/image` POST / `/api/skills/image/[id]` GET、`/api/chat` route のモード切替と画像ツール装着、SSE `image_generated` イベント。
* **Phase 4 — bbox + 再構築コア**: 外部スキル `pptx-from-image` 取り込み、`SlideLayout` zod schema、Copilot SDK Vision での bbox extractor、`applyLayoutToSlide` による pptxgenjs 再構築、`/api/skills/pptx` の image-then-pptx モード + 90s deadline + Hybrid C フォールバック。`create-slide-story` / `generate-pptx` SKILL.md にモード解説追加。
* **Phase 4B — 品質ゲート**: LibreOffice headless レンダラー（per-PID `-env:UserInstallation` + p-queue concurrency=1）、pixelmatch + sharp-phash の hybrid 比較、`evaluateQuality` 3 段判定、`/api/skills/pptx/quality/[jobId]` polling endpoint、`/api/skills/pptx` への fire-and-forget kickoff。
* **Phase 5 — ツール schema**: `set_scenario` / `update_slide` に `bodyMarkdown` 追加、`slide-parser` も対応。
* **Phase 6 — UI**: `mode-toggle` / `slide-image-card` / `slide-body-editor` 新規、`slide-panel` の image モードレイアウト、`chat-container` の SSE / generationMode 連携、`pptx-download-card` の品質バッジ polling。
* **Phase 7 — インフラ**: Dockerfile に LibreOffice + poppler + Noto CJK + warm-up + sanity check、Bicep に Container App + 環境変数 7 種 + 2 GiB / minReplicas=1 + Cognitive Services User ロール、package.json に新規依存 7 種、README / AGENTS.md 更新。
* **Phase 8 — 検証**: `pnpm build` (0 errors) / `pnpm lint` (既存 4 warnings のみ) 通過、Dockerfile 静的監査 OK、手動検証手順を「Manual Verification Plan」として記録。

### 全 Phase 集計

* **追加ファイル (19)**:
  * `src/infrastructure/image/azure-image-client.ts`
  * `src/infrastructure/image/image-cache.ts`
  * `src/infrastructure/image/bbox-extractor.ts`
  * `src/infrastructure/image/image-comparator.ts`
  * `src/infrastructure/render/libreoffice-renderer.ts`
  * `src/infrastructure/tools/image-tool.ts`
  * `src/application/image-prompt-builder.ts`
  * `src/application/layout-to-pptx.ts`
  * `src/domain/entities/slide-layout.ts`
  * `src/app/api/skills/image/route.ts`
  * `src/app/api/skills/image/[id]/route.ts`
  * `src/app/api/skills/pptx/quality/cache.ts`
  * `src/app/api/skills/pptx/quality/[jobId]/route.ts`
  * `src/app/components/slides/mode-toggle.tsx`
  * `src/app/components/slides/slide-image-card.tsx`
  * `src/app/components/slides/slide-body-editor.tsx`
  * `src/types/sharp-phash.d.ts`
  * `skills/pptx-from-image/SKILL.md`
  * `skills/pptx-from-image/NOTICE.md`
* **変更ファイル (14)**:
  * `src/app/api/skills/pptx/route.ts`
  * `src/app/api/chat/route.ts`
  * `src/app/components/slides/slide-panel.tsx`
  * `src/app/components/chat/chat-container.tsx`
  * `src/app/components/skills/pptx-download-card.tsx`
  * `src/domain/entities/slide-work.ts`
  * `src/infrastructure/tools/scenario-tool.ts`
  * `src/application/slide-parser.ts`
  * `skills/generate-pptx/SKILL.md`
  * `skills/create-slide-story/SKILL.md`
  * `Dockerfile`
  * `infra/main.bicep`
  * `package.json` / `pnpm-lock.yaml`
  * `README.md` / `AGENTS.md`
* **削除ファイル**: なし

### 依存追加

| 種別 | パッケージ | バージョン | 用途 |
|------|-----------|-----------|------|
| dep | pixelmatch | ^6.0.0 (resolved 6.0.0) | 品質ゲート per-pixel diff |
| dep | pngjs | ^7.0.0 (resolved 7.0.0) | pixelmatch の入力デコード |
| dep | sharp-phash | ^2.1.0 (resolved 2.2.0) | pHash + Hamming distance |
| dep | p-queue | ^8.0.1 (resolved 8.1.1) | bbox / LibreOffice 並列制御 |
| dep | zod | ^3.23.0 (resolved 3.25.76) | `SlideLayoutSchema` validation |
| devDep | @types/pixelmatch | ^5.2.6 | TS 型 |
| devDep | @types/pngjs | ^6.0.5 | TS 型 |

### インフラ変更

* **Dockerfile**: `libreoffice-impress` / `libreoffice-core` / `poppler-utils` / `fonts-noto-cjk` / `fontconfig` を runner stage に追加（`--no-install-recommends` + `apt-get clean` + `rm -rf /var/lib/apt/lists/*` でイメージ抑制）。`-env:UserInstallation=file:///tmp/uno-warmup-build` 専用プロファイルで build-time warm-up を 1 回実行、`/tmp/uno-warmup-build` を後始末。`fc-list \| grep -i noto` sanity check で Noto 未導入時はビルド失敗。`ENV HOME=/tmp`。
* **Bicep (`infra/main.bicep`)**: Container App リソースを Bicep 管理下に追加。image-then-pptx 用環境変数 7 種（`AZURE_IMAGE_ENDPOINT` / `AZURE_IMAGE_DEPLOYMENT` 既定 `gpt-image-2` / `AZURE_IMAGE_API_VERSION` 既定 `2025-04-01-preview` / `IMAGE_AUTH_MODE` 既定 `entra` / `BBOX_VISION_MODEL` 既定 `gpt-4o` / `BBOX_VISION_CONCURRENCY` 既定 `3` / `LIBREOFFICE_CONCURRENCY` 既定 `1`）。`cpu: 1.0` / `memory: '2.0Gi'` / `scale.minReplicas: 1`（cold-start 回避）。`SystemAssigned` managed identity + Foundry リソースへの **Cognitive Services User** ロール（roleDefinitionId `a97b65f3-24c7-4388-baec-2e87135dc908`）の `guid()` 決定的名付与。
* **新規環境変数 (8)**: `AZURE_IMAGE_ENDPOINT` / `AZURE_IMAGE_DEPLOYMENT` / `AZURE_IMAGE_API_VERSION` / `AZURE_IMAGE_API_KEY`（任意・key auth 用） / `IMAGE_AUTH_MODE` / `BBOX_VISION_MODEL` / `BBOX_VISION_CONCURRENCY` / `LIBREOFFICE_CONCURRENCY`。

### デプロイ Notes

* Container App は **2 GiB memory / 1.0 vCPU / minReplicas=1** が最小要件（LibreOffice 200–400 MB + 並列 1–2 で 600–800 MB のため）。
* `gpt-image-2` deployment が Foundry に存在しない tenant では `AZURE_IMAGE_DEPLOYMENT` で別 deployment 名（例: `gpt-image-1`）を指す（DD-07）。
* `AZURE_IMAGE_ENDPOINT` 未設定で起動すると UI 側で image-then-pptx モードトグルが disabled になり、code モードのみで動く（graceful degrade）。
* managed identity に Foundry リソースの **Cognitive Services User** ロール付与が必須（Bicep 側で `foundryAccountName` パラメータ指定時に自動付与）。
* GitHub Actions の `az containerapp update --image` と Bicep の `containerImage` パラメータが共存する設計（イメージ更新は CI／インフラ管理は Bicep）。

### 既知の Follow-on 項目（Planning Log 参照）

Planning Log (`.copilot-tracking/plans/logs/2026-05-20/image-pptx-skill-log.md`) の "Suggested Follow-on Work" セクションを正本とする。

* **WI-01**: 画像キャッシュを Blob Storage（または Cosmos DB）へ移行（マルチインスタンス対応）。
* **WI-02 〜 WI-03**: image-then-pptx の E2E テスト・品質ゲートの実測値ベースキャリブレーション。
* **WI-04 〜 WI-08**: bbox 抽出のリトライ戦略強化、`sharp` mask 補助の本格適用、prompt versioning、画像生成の cost telemetry、Foundry deployment 互換テストマトリクス。
* **WI-09 〜 WI-12**: LibreOffice + poppler の Linux distroless 移行検討、フォント追加（Noto Sans JP / Noto Emoji 等）、quality gate の Workers Pool 化、`x-pptx-fallback` 統計の Application Insights 連携。
* **WI-13 〜 WI-15**: Bicep の private endpoint 化、Container App の zone redundancy、Cognitive Services User 以外の least-privilege ロール検討。

### 検証成績（Phase 8）

* `pnpm build`: **PASS** — 0 TypeScript errors、9 routes 生成。
* `pnpm lint`: **PASS** — 0 errors / 4 既存 warnings（`chat-use-case.ts` 3 件、`pptxgen-adapter.ts` 1 件、いずれも未使用変数で新規導入ではない）。
* Dockerfile 静的監査: **PASS** — `libreoffice-impress` / `poppler-utils` / `fonts-noto-cjk` / warm-up (`-env:UserInstallation=file:///tmp/uno-warmup-build`) / `fc-list \| grep -i noto` / `rm -rf /var/lib/apt/lists/*` の 5 項目全て確認。
* `docker build` / 実機 UI 動作 / Hybrid C フォールバック: **要 QA 実機検証**（Manual Verification Plan 参照）。

