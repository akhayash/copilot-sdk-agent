---
applyTo: '.copilot-tracking/changes/2026-05-20/image-pptx-skill-changes.md'
---
<!-- markdownlint-disable-file -->
# Implementation Plan: 画像生成パス追加とストーリー精緻化（Option B: SKILL + LibreOffice）

## Overview

Markdown ストーリーを精緻化（段落含む `bodyMarkdown` 追加）し、Azure Foundry の gpt-image-2 でスライド画像をプレビュー生成→確認→再生成できるループを実装し、確認後に **外部組織共有スキル `pptx-from-image` を本リポに取り込み**、vision LLM で抽出した bbox を元に **pptxgenjs ネイティブ要素を再構築**して編集可能 PPTX を生成する。品質ゲートには **LibreOffice headless + poppler-utils** で PPTX→PNG レンダして `pixelmatch` + `sharp-phash` のダブル指標で比較するが、ダウンロードはブロックせず非同期バッジ表示にする。既存の Markdown→PPTX 直接パスはモード切替で残す。

## Objectives

### User Requirements

* Markdown スライドストーリーをポイント箇条書きだけでなく**精緻な段落**で記載できるようにする — Source: ユーザー指示「精緻に記載をおこなっていく」
* Azure Foundry にデプロイされた **gpt-image-2** を使って各スライドの画像イメージを生成する — Source: ユーザー指示「gpt-image 2.0 を使った画像イメージをつかってのスライド作成」「gpt-image-2 を azure の Foundry においたものをつかう」
* 生成画像を **Web 画面で確認**し、チャット または 直接編集でテキストを更新・改修してから、それをインプットに **画像を再生成**できる — Source: ユーザー指示 PD02 「Web がめんで生成画像をかくにんできればいい」「テキストを更新・改修してから、それをインプットにして画像を再生成」
* 画像確認後に PPTX へ戻し、その PPTX は **画像貼り付けではなく PPTX ネイティブ**にする — Source: ユーザー指示「PPTX にはスキルを使って PPTX ネイティブにする」
* 画像生成は **一括 と 個別 の両対応** — Source: PD03=C
* 既存の Markdown→PPTX 直接パスは **モード切替**で残す — Source: PD04=A
* Linux Container Apps で動作させる（PowerPoint COM 不可） — Source: ユーザー指示「Container App にデプロイされることもあり PowerPoint COM はつかえない」

### Derived Objectives

* `SlideItem` に `bodyMarkdown` / `imageUrl` / `imagePrompt` を追加 — Derived from: PD01=A + 画像 URL とプロンプトの永続化が再生成と PPTX 化の両方で必要
* `SlideWork` に `generationMode: 'code' | 'image-then-pptx'` と画像生成中フェーズを追加 — Derived from: PD04 のモード切替と UI 進捗表示
* 画像生成用 Azure Foundry クライアントを `src/infrastructure/image/` 配下に独立配置 — Derived from: 既存の Clean Architecture 構造（domain→application→infrastructure→presentation）
* 画像は base64 を SSE で流さず、`/api/skills/image/[id]` GET エンドポイントで取得 — Derived from: 調査リスク表「base64 を SSE で流すと重い」
* **外部組織共有スキル `pptx-from-image` を本リポ `skills/pptx-from-image/` に取り込む**（再発明禁止） — Derived from: ユーザー指示「SKILLを使ってPPTXを生成」
* **bbox 抽出は vision LLM（Copilot SDK の attachments）を一次・`sharp` mask を補助の hybrid 方式 A4** — Derived from: Option B リサーチ §A.2（fully automated, no human input）
* **LibreOffice headless + poppler-utils + fonts-noto-cjk を Dockerfile に追加** — Derived from: Option B リサーチ §B.1（SKILL の "render PPTX template to image for vision LLM" 段が Linux で動く前提）
* **品質ゲート（pixelmatch + sharp-phash）はクリティカルパスから外し非同期バッジ化** — Derived from: Option B リサーチ §E.3 オプション A
* **UNO bootstrap 競合回避**: 全 `soffice` 呼び出しに per-PID/uuid の `-env:UserInstallation` を付与し、Node 側は p-queue concurrency=1〜2 でキュー化 — Derived from: Option B リサーチ §B.3
* **per-request 作業ディレクトリ `/tmp/job-<uuid>/`** に中間生成物を閉じ込め、レスポンス後 `rm -rf` — Derived from: Option B リサーチ §エグゼクティブサマリ Top 3 リスク #3
* 新規スキル `skills/pptx-from-image/SKILL.md` を追加（既存 `generate-pptx` と並列） — Derived from: 既存 SDK の `skillDirectories` 配列で簡単に拡張できる構造

## Context Summary

### Project Files

* src/domain/entities/slide-work.ts - `SlideItem` / `SlideWork` / `DesignBrief` の型定義（拡張対象）
* src/infrastructure/copilot/client.ts - Copilot SDK クライアントと Azure BYOM 認証（`DefaultAzureCredential` で bearer token 取得済み、画像 API も同パターンで実装可）
* src/infrastructure/tools/scenario-tool.ts - `set_scenario` / `update_slide` ツール（parameters schema に `bodyMarkdown` を追加する）
* src/app/api/chat/route.ts - SSE チャット + `skillDirectories` 渡し（モード切替で skill リストとシステムメッセージを切替）
* src/app/api/skills/pptx/route.ts - 既存 pptxgenjs 実行エンドポイント（image-then-pptx モード時の追加スコープ変数を提供）
* src/infrastructure/skills/pptxgen-adapter.ts - pptxgenjs アダプター（参考用、route.ts の executePptxCode が現行のエントリ）
* src/app/components/slides/slide-panel.tsx - 右パネル UI（画像サムネ・再生成ボタン・bodyMarkdown 編集欄を追加）
* skills/create-slide-story/SKILL.md - ストーリー作成スキル（bodyMarkdown ガイドライン追記）
* skills/generate-pptx/SKILL.md - PPTX 生成スキル（モード説明追記）
* Dockerfile - Linux Container Apps 向け（**Phase 7.1 で LibreOffice + poppler + fonts-noto-cjk を追加**）
* infra/main.bicep - Container Apps 用 Bicep（画像 API 用環境変数を追加）

### References

* .copilot-tracking/research/2026-05-20/image-pptx-skill-research.md - 全体研究（要件・設計方針・環境変数）
* .copilot-tracking/research/subagents/2026-05-20/linux-pptx-rendering-research.md - 先行 Linux 研究（Hybrid C 系・参考用 / 現在は fallback で利用）
* **.copilot-tracking/research/subagents/2026-05-20/option-b-feasibility-research.md** - Option B フィージビリティ調査（採用根拠：bbox 戦略 §A、LibreOffice 統合 §B、画像 diff §C、layout schema §D、UX 設計 §E）
* 外部スキル取り込み元: EMU 組織 `akhayash_microsoft/Hitachi-IT-Dev` の `.github/skills/pptx-from-image/SKILL.md`（Phase 4.1 で `skills/pptx-from-image/SKILL.md` として本リポへ取り込む）
* https://docs.github.com/en/copilot/how-tos/copilot-sdk/use-copilot-sdk/image-input - @github/copilot-sdk の画像入力 API
* https://learn.microsoft.com/azure/ai-services/openai/reference#image-generation - Azure OpenAI Image generation API

### Standards References

* AGENTS.md — Clean Architecture: domain → application → infrastructure → presentation。ドメイン層はゼロ依存。pnpm 必須。
* AGENTS.md "Tool System" — `set_scenario` で構造化データをパネルに送る原則。チャットにスライド構成を書かない。
* AGENTS.md "Safety" — Permission ハンドラーは custom-tool 許可・shell/write/mcp は denied-by-rules。

## Implementation Checklist

### [x] Implementation Phase 1: ドメイン型拡張

<!-- parallelizable: false -->

* [x] Step 1.1: `SlideItem` に `bodyMarkdown` / `imageUrl` / `imagePrompt` を追加し、`SlideWork` に `generationMode` と `'imagining'` フェーズを追加
  * Details: .copilot-tracking/details/2026-05-20/image-pptx-skill-details.md (Lines 8-48)
* [x] Step 1.2: TypeScript ビルド検証
  * Details: .copilot-tracking/details/2026-05-20/image-pptx-skill-details.md (Lines 50-58)

### [x] Implementation Phase 2: 画像生成インフラ層（Azure Foundry gpt-image-2）

<!-- parallelizable: true -->

* [x] Step 2.1: `src/infrastructure/image/azure-image-client.ts` を新規作成。`DefaultAzureCredential` で bearer token 取得し Foundry の Image API を呼ぶ。**deployment 名は env で受け取り**、`gpt-image-2` が無い tenant では `gpt-image-1` を設定できるようにする（DD-07 対応）
  * Details: .copilot-tracking/details/2026-05-20/image-pptx-skill-details.md (Lines 60-104)
* [x] Step 2.2: 生成画像のメモリキャッシュ（`src/infrastructure/image/image-cache.ts`）— Map<imageId, { data: Buffer; mimeType: string; createdAt: number }>、TTL 1 時間で自動削除
  * Details: .copilot-tracking/details/2026-05-20/image-pptx-skill-details.md (Lines 106-130)
* [x] Step 2.3: `src/infrastructure/tools/image-tool.ts` — `generate_slide_image`（個別1枚）と `generate_all_images`（バッチ）の 2 ツール
  * Details: .copilot-tracking/details/2026-05-20/image-pptx-skill-details.md (Lines 132-180)
* [x] Step 2.4: `src/application/image-prompt-builder.ts` 新規 — `buildImagePrompt(slide: SlideItem, brief: DesignBrief): string` で `title` / `keyMessage` / `bullets` / `bodyMarkdown` / `brief.industry` / `brief.tone` を簡潔な英語 prompt に組み立てる（client util として再利用）（DR-05 対応）
  * Details: .copilot-tracking/details/2026-05-20/image-pptx-skill-details.md (Lines 175-205)

### [x] Implementation Phase 3: API エンドポイント

<!-- parallelizable: true，ただし Phase 2 完了後 -->

* [x] Step 3.1: `src/app/api/skills/image/route.ts` — POST: `{ slideNumber, prompt }` → 画像生成→キャッシュ保存→`{ imageId, slideNumber }` を返却
  * Details: .copilot-tracking/details/2026-05-20/image-pptx-skill-details.md (Lines 182-220)
* [x] Step 3.2: `src/app/api/skills/image/[id]/route.ts` — GET: cache から binary を返却（Content-Type: image/png）
  * Details: .copilot-tracking/details/2026-05-20/image-pptx-skill-details.md (Lines 222-244)
* [x] Step 3.3: `src/app/api/chat/route.ts` を更新 — `generationMode` を受け取り、モードに応じて skillDirectories とシステムメッセージを切替。image-then-pptx モードでは画像ツールを tools に追加し、SSE で `image_generated` イベントを送出（payload に `prompt` も含める, DR-06）。システムメッセージで「image-then-pptx モードでは `update_slide` 直後に該当スライドの `generate_slide_image` も呼ぶ」と誘導（DD-06）
  * Details: .copilot-tracking/details/2026-05-20/image-pptx-skill-details.md (Lines 246-300)

### [x] Implementation Phase 4: 外部スキル取り込み + bbox 抽出 + PPTX 再構築（Option B コア）

<!-- parallelizable: true，ただし Phase 2 完了後 -->

* [x] Step 4.1: `skills/pptx-from-image/SKILL.md` を **EMU リポ `akhayash_microsoft/Hitachi-IT-Dev` の `.github/skills/pptx-from-image/SKILL.md`** から取り込み、本リポ向けに最小限のアダプテーション注記を追加（Windows/COM 前提部分は Node/Linux 等価実装へ参照リンク、共通フィロソフィー＝ z-order 規約・RECTANGLE 線描画・1 枚画像貼付禁止はそのまま継承）
  * Details: .copilot-tracking/details/2026-05-20/image-pptx-skill-details.md (Lines 302-360)
* [x] Step 4.2: `src/domain/entities/slide-layout.ts` を新規作成 — SKILL 互換 layout.json schema を TypeScript 型として定義（textbox / auto_shape / line / picture の 4 種、slide-relative bbox 0.0-1.0、z=1〜4）
  * Details: .copilot-tracking/details/2026-05-20/image-pptx-skill-details.md (Lines 362-410)
* [x] Step 4.3: `src/infrastructure/image/bbox-extractor.ts` 新規 — Copilot SDK の `attachments` API で生成画像を vision LLM に渡し、`SlideLayout` 形式の JSON を抽出。出力は zod 等で `unique(id)` / `w > 0 && h > 0` を assert。`sharp.stats()` / `sharp.extract().raw()` で抽出 bbox の edge refine を補助（hybrid A4）
  * Details: .copilot-tracking/details/2026-05-20/image-pptx-skill-details.md (Lines 412-470)
* [x] Step 4.4: `src/application/layout-to-pptx.ts` 新規 — `SlideLayout` → pptxgenjs slide 構築ロジック。z 昇順 sort、px↔inch 変換、`auto_shape RECTANGLE` で line 描画、`sharp.extract()` で source 画像から picture crop を切り出し base64 化して `slide.addImage({ data: 'data:image/png;base64,...' })` で配置
  * Details: .copilot-tracking/details/2026-05-20/image-pptx-skill-details.md (Lines 472-540)
* [x] Step 4.5: `src/app/api/skills/pptx/route.ts` を更新 — `generationMode='image-then-pptx'` 時は `imageIds` を受け取り、各画像について bbox-extractor → layout-to-pptx を実行して PPTX バッファを返す。`pres`, `images`, `layouts` をスコープに注入。失敗時は **方式 C フォールバック**（画像を背景に貼って既存 `set_scenario` のテキストを上に重ねる）で安全側に倒す
  * Details: .copilot-tracking/details/2026-05-20/image-pptx-skill-details.md (Lines 542-610)
* [x] Step 4.6: `skills/create-slide-story/SKILL.md` と `skills/generate-pptx/SKILL.md` を更新 — bodyMarkdown ガイドラインとモード説明追記
  * Details: .copilot-tracking/details/2026-05-20/image-pptx-skill-details.md (Lines 612-650)

### [x] Implementation Phase 4B: LibreOffice レンダ + 非同期品質ゲート

<!-- parallelizable: false，Phase 4 と Phase 7.1（Dockerfile に soffice 同梱）完了後 -->

* [x] Step 4B.1: `src/infrastructure/render/libreoffice-renderer.ts` 新規 — `renderPptxToPngs(pptxBuf: Buffer, { jobId, dpi=150, timeoutMs=60000 })`。`mkdtemp(/tmp/job-<jobId>-)` で per-request workDir 作成、PPTX を一時ファイルに書き出し、`soffice --headless -env:UserInstallation=file://<workDir>/lo-profile --convert-to pdf` → `pdftoppm -png -r 150` → ファイル列挙 → finally で `rm -rf`
  * Details: .copilot-tracking/details/2026-05-20/image-pptx-skill-details.md (Lines 652-720)
* [x] Step 4B.2: `src/infrastructure/image/image-comparator.ts` 新規 — `compareImages(originalPath, renderedPath)` で両画像を同 width に `sharp.resize()`、`pixelmatch` で `diffPixelRatio` 算出、`sharp-phash` で Hamming distance も併走。`evaluateQuality(m)` で `pass`(<=0.12) / `warn`(<=0.15) / `fail`(>0.15) を返す（参考 SKILL の閾値を初期値、実測で再キャリブレーション WI として残す）
  * Details: .copilot-tracking/details/2026-05-20/image-pptx-skill-details.md (Lines 722-790)
* [x] Step 4B.3: `src/app/api/skills/pptx/quality/[jobId]/route.ts` 新規 — GET エンドポイントのみ。`qualityCache: Map<jobId, QualityVerdict>` から `{ status: 'pending'|'done', verdict?, perSlide? }` を返す。enqueue は Step 4B.4 の fire-and-forget が直接 `runQualityCheck()` を呼ぶ（POST endpoint は不要）
  * Details: .copilot-tracking/details/2026-05-20/image-pptx-skill-details.md (Lines 792-860)
* [x] Step 4B.4: `src/app/api/skills/pptx/route.ts` を再更新 — PPTX 生成完了時に `jobId` を発行して即時返却、バックグラウンドで quality job を kick（fire-and-forget）。**ダウンロードはブロックしない**
  * Details: .copilot-tracking/details/2026-05-20/image-pptx-skill-details.md (Lines 862-905)

### [x] Implementation Phase 5: ツール schema 更新

<!-- parallelizable: false -->

* [x] Step 5.1: `src/infrastructure/tools/scenario-tool.ts` の `set_scenario` / `update_slide` parameters schema に `bodyMarkdown` (optional string) を追加。`createScenarioTool` / `createUpdateSlideTool` ハンドラーで受け取った値を SSE イベントに含める
  * Details: .copilot-tracking/details/2026-05-20/image-pptx-skill-details.md (Lines 442-484)
* [x] Step 5.2: `src/application/slide-parser.ts` を更新（あれば）— bodyMarkdown フィールドを SlideItem への変換時に保持
  * Details: .copilot-tracking/details/2026-05-20/image-pptx-skill-details.md (Lines 486-504)

### [x] Implementation Phase 6: UI 拡張（パネル + チャット）

<!-- parallelizable: true，ただし Phase 1 と Phase 3 完了後 -->

**Phase 遷移責務**: `imageStatus` は **client side state** で管理する。「個別/バッチ生成」開始時に `'generating'` に設定し、SSE `image_generated` イベント受信で `'ready'` + `imageUrl` / `imagePrompt` を更新する。サーバーは phase イベントを別途送らない（DR-04 対応）。

* [x] Step 6.1: `src/app/components/slides/mode-toggle.tsx` を新規作成 — `'code' | 'image-then-pptx'` 切替ボタン
  * Details: .copilot-tracking/details/2026-05-20/image-pptx-skill-details.md (Lines 506-528)
* [x] Step 6.2: `src/app/components/slides/slide-image-card.tsx` を新規作成 — サムネ表示・拡大プレビュー・再生成ボタン
  * Details: .copilot-tracking/details/2026-05-20/image-pptx-skill-details.md (Lines 530-566)
* [x] Step 6.3: `src/app/components/slides/slide-body-editor.tsx` を新規作成 — bodyMarkdown を textarea で編集可能にする。「この内容で画像を再生成」ボタンを内包
  * Details: .copilot-tracking/details/2026-05-20/image-pptx-skill-details.md (Lines 568-598)
* [x] Step 6.4: `src/app/components/slides/slide-panel.tsx` を更新 — モードトグル、画像生成中の進捗表示、image-then-pptx モード時のレイアウト切替、「全画像生成」「PPTX 生成」ボタンの活性化条件
  * Details: .copilot-tracking/details/2026-05-20/image-pptx-skill-details.md (Lines 600-650)
* [x] Step 6.5: `src/app/components/chat/chat-container.tsx` を更新 — `generationMode` を state に保持し API call に含める。SSE の `image_generated` イベントを受けて SlideItem.imageUrl を更新
  * Details: .copilot-tracking/details/2026-05-20/image-pptx-skill-details.md (Lines 652-690)
* [x] Step 6.6: `src/app/components/skills/pptx-download-card.tsx` を更新 — 受け取った `jobId` で `/api/skills/pptx/quality/[jobId]` を polling し、`pass`/`warn`/`fail` バッジを表示。ダウンロードボタンは即時活性、`fail` 時のみ「デザインが大きくずれています、再生成しますか？」のヒントを併記
  * Details: .copilot-tracking/details/2026-05-20/image-pptx-skill-details.md (Lines 692-740)

### [x] Implementation Phase 7: インフラ・環境変数

<!-- parallelizable: false（Dockerfile / Bicep / package.json は最終ビルド連動） -->

* [x] Step 7.1: **`Dockerfile` を更新 — runner stage に `libreoffice-impress` + `poppler-utils` + `fonts-noto-cjk` を追加**。最終イメージ +500〜700MB、warm-up として起動スクリプトで空 PPTX のダミー変換を 1 回叩いて UNO を pre-init。`fc-list | grep -i noto` の sanity check も追加
  * Details: .copilot-tracking/details/2026-05-20/image-pptx-skill-details.md (Lines 907-970)
* [x] Step 7.2: `infra/main.bicep` を更新 — `AZURE_IMAGE_ENDPOINT` / `AZURE_IMAGE_DEPLOYMENT` / `AZURE_IMAGE_API_VERSION` / `IMAGE_AUTH_MODE` / **`BBOX_VISION_MODEL`** (既定 `gpt-4o`, DR-11) / **`BBOX_VISION_CONCURRENCY`** (既定 `3`, DR-13) / **`LIBREOFFICE_CONCURRENCY`** (既定 `1`, DD-16) を Container App env として追加。**`minReplicas: 1` を強制**（cold start 回避）、**メモリを 2 GiB 以上**に設定（LibreOffice 起動 200–400MB + 並行 1〜2 で 600〜800MB）。managed identity に Foundry の Cognitive Services User ロールを付与
  * Details: .copilot-tracking/details/2026-05-20/image-pptx-skill-details.md (Lines 972-1020)
* [x] Step 7.3: `package.json` に新規依存追加 — `pixelmatch`, `pngjs`, `sharp-phash`, `p-queue`, `zod`（layout schema validation 用）
  * Details: .copilot-tracking/details/2026-05-20/image-pptx-skill-details.md (Lines 1022-1050)
* [x] Step 7.4: `README.md` / `AGENTS.md` に新環境変数とモード説明、LibreOffice 依存・コンテナサイズ増・最小 2GiB 要件を追記
  * Details: .copilot-tracking/details/2026-05-20/image-pptx-skill-details.md (Lines 1052-1080)

### [x] Implementation Phase 8: 最終検証

<!-- parallelizable: false -->

* [x] Step 8.1: `pnpm build` で TypeScript ビルド検証 — PASS（`.next` クリーン後、0 TS errors、9 routes）
* [x] Step 8.2: **Docker smoke 検証** — 実 `docker build` は当環境で不可のため Dockerfile を静的監査。`libreoffice-impress` / `libreoffice-core` / `poppler-utils` / `fonts-noto-cjk` / `fontconfig` の apt install、`-env:UserInstallation=file:///tmp/uno-warmup-build` の warm-up、`fc-list | grep -i noto` sanity check、`rm -rf /var/lib/apt/lists/*` cleanup を全て確認。実機 `soffice --version` / `pdftoppm -v` / 最終イメージサイズ確認は Manual Verification Plan で QA に委譲（changes log 参照）
* [x] Step 8.3: 手動検証は当環境でブラウザ／dev server を起動できないため、Manual Verification Plan として changes log に記録（code モード回帰、image-then-pptx フルパス、Hybrid C フォールバック、env gating、並行 UNO の 5 シナリオ）
* [x] Step 8.4: ESLint チェック (`pnpm lint`) — PASS（0 errors / 4 既存 warnings、新規エラーなし）
* [x] Step 8.5: ブロッカー報告 — なし。残作業は Planning Log の WI-01 〜 WI-15 に整理済み

## Planning Log

See `.copilot-tracking/plans/logs/2026-05-20/image-pptx-skill-log.md` for discrepancy tracking, implementation paths considered, and suggested follow-on work.

## Dependencies

* Node ≥ 24, pnpm
* Azure Foundry に **gpt-image-2** がデプロイ済み
* Container App の managed identity に Foundry リソースへの読み取り権限（Cognitive Services User 等）
* `@azure/identity` — 既存依存（`DefaultAzureCredential` 用）
* `@github/copilot-sdk` — 既存依存（vision attachments を bbox 抽出に利用）
* `pptxgenjs` — 既存依存
* **新規 npm 依存**: `pixelmatch`, `pngjs`, `sharp-phash`, `p-queue`, `zod`
* **新規 Docker 依存**: `libreoffice-impress`, `poppler-utils`, `fonts-noto-cjk`
* **Container App 最小スペック**: 2 GiB memory / minReplicas=1

## Success Criteria

* `SlideItem.bodyMarkdown` が set_scenario ツールから受け渡され、パネルで編集できる — Traces to: User Req「精緻に記載」+ PD01=A
* code モード / image-then-pptx モードを UI で切り替えられ、両方で既存と同等の品質の PPTX が出力できる — Traces to: PD04=A
* image-then-pptx モードで「全画像生成」「個別再生成」がどちらも動く — Traces to: PD03=C
* 生成 PPTX を PowerPoint で開いたとき、テキスト要素が **編集可能** である（1 枚画像貼り付けでない） — Traces to: User Req「PPTX ネイティブにする」 + 参考 SKILL.md 哲学
* **外部組織共有スキル `pptx-from-image` が本リポに取り込まれ Copilot SDK の `skillDirectories` から読み込まれる** — Traces to: User Req「SKILL を使って PPTX を生成」
* **LibreOffice + poppler が Docker image に同梱され、`soffice` / `pdftoppm` がコンテナ内で動く** — Traces to: User Req「LIBRE をつかえば解決する」+ Option B リサーチ §B
* **品質ゲート（pixelmatch + sharp-phash）が非同期で動き、PPTX ダウンロードはブロックされない** — Traces to: Option B リサーチ §E.3 オプション A
* **bbox 抽出の失敗時は方式 C（背景画像 + テキスト重ね）にフォールバックし、ユーザーに PPTX を必ず返す** — Traces to: Option B リサーチ §A エグゼクティブサマリ
* Linux Docker (`pnpm build` ベース) で動作する — Traces to: User Req「Container App で動く」
* `AZURE_IMAGE_ENDPOINT` 未設定時は image-then-pptx モードが UI で無効化され、code モードのみ利用可能 — Traces to: 既存の env-var-driven graceful degradation パターン
