<!-- markdownlint-disable-file -->
# Planning Log: 画像生成パス追加とストーリー精緻化

## Pivot Log

* **2026-05-20 PIVOT: Hybrid C → Option B** — ユーザー指示「LIBRE をつかえば解決する。その前提で実装」により、image-then-pptx モードの実装方針を **画像背景 + pptxgenjs 重ね（Hybrid C）** から **外部組織共有スキル `pptx-from-image` 取り込み + vision LLM bbox 抽出 + LibreOffice 品質ゲート（Option B）** に切替。Hybrid C はフォールバック手段として残す（bbox 抽出失敗時の safety net）。根拠: 外部 SKILL grep（`llm|gpt|vision|bbox`）で fully automated と確認 + Option B リサーチ subagent でフィージビリティ確認済み。

## Discrepancy Log

研究結果と実装プランのギャップ・差異を記録。

### Unaddressed Research Items

* DR-01: 外部参考スキル `pptx-from-image` の「LibreOffice headless によるレンダ検証」「目視必須ループ」を本プランでは **採用方針を反転**（Hybrid C → Option B PIVOT 後）
  * Source: C:\Users\akhayash\AppData\Local\Temp\pptx-from-image-ref\SKILL.md / Option B リサーチ §B
  * Resolution: **LibreOffice headless + poppler-utils を採用**（Phase 4B / Phase 7.1）。ただし「目視必須ループ」は本リポ UX に合わないため、**非同期品質バッジ**で代替（Option B リサーチ §E.3）
  * Impact: high — Option B 採用の根幹

* DR-02: 外部参考スキルの `crop_icons.py` / `visual_quality_gate.py` / `merge_pptx.py` 等のパイプライン
  * Source: 参考 SKILL.md / Option B リサーチ §D
  * Resolution: **TypeScript 等価実装に置き換え**:
    * `crop_icons.py` → `src/application/layout-to-pptx.ts` の `sharp.extract()` picture crop (Step 4.4)
    * `visual_quality_gate.py` → `src/infrastructure/image/image-comparator.ts` (Step 4B.2)
    * `merge_pptx.py` → 不要（pptxgenjs で 1 ファイル生成）
  * Impact: high

* DR-03: 参考スキルの perceptual hash (`sharp.phash`) による diff 比較
  * Source: Option B リサーチ §C
  * Resolution: **`sharp-phash` を採用**（Step 4B.2、pixelmatch とのダブル指標）
  * Impact: medium

* DR-04: `'imagining'` フェーズ遷移ロジック — **RESOLVED**
  * Resolution: client side state で imageStatus 管理、SSE `image_generated` で `'ready'` へ
  * Impact: medium

* DR-05: `bodyMarkdown` → 画像 prompt 導出ロジック — **RESOLVED**
  * Resolution: `src/application/image-prompt-builder.ts` Phase 2 Step 2.4
  * Impact: medium

* DR-06: `SlideItem.imagePrompt` の SSE 伝搬 — **RESOLVED**
  * Resolution: SSE `image_generated` payload に `prompt` を含める
  * Impact: medium

* DR-07: **NEW (Option B)** bbox 抽出の非決定性（findings.md: gpt-4o で同一画像 25–37 elements ばらつき）
  * Source: Option B リサーチ §A.1 表 / findings.md
  * Resolution: (a) bbox を採用判定の数値ゲートにしない、(b) 失敗時は **Hybrid C フォールバック**（Step 4.5）で safety net、(c) `unique(id)` / `w>0 && h>0` を zod assert
  * Impact: high

* DR-08: **NEW (Option B)** UNO bootstrap 競合と並行実行制御
  * Source: Option B リサーチ §B.3
  * Resolution: per-PID/uuid の `-env:UserInstallation` を必ず付与、p-queue concurrency=1〜2、`minReplicas: 1`（Step 4B.1 / Step 7.2）
  * Impact: high

* DR-09: **NEW (Option B)** Container Apps `/tmp` 容量制約
  * Source: Option B リサーチ Top 3 リスク #3
  * Resolution: per-request `/tmp/job-<uuid>/` に閉じ込め、finally で `rm -rf`（Step 4B.1）
  * Impact: medium

* DR-10: **NEW (Option B)** Image diff 閾値の実測キャリブレーション
  * Source: Option B リサーチ §C.3
  * Reason: 参考 SKILL の `diff_pixel_ratio <= 0.15` は同じレンダラの差分前提、本リポは gpt-image-2 vs LibreOffice の異質画像比較なので resize 必須＝閾値再キャリブレーションが必要
  * Resolution: 初期値は参考 SKILL の閾値を採用、運用後の実測で再調整は WI-07 に分離
  * Impact: low

* DR-11: **NEW (Validation 2026-05-20)** vision LLM 経由 bbox 抽出で **使用モデルが未指定**
  * Source: Option B リサーチ §A.1（GPT-4o / Claude vision を候補として列挙）/ Step 4.3 plan 記述
  * Reason: Plan Step 4.3 は「Copilot SDK の `attachments` 機能経由」とだけ記載。MODEL_PROVIDER=github の既定モデルが vision を持つか、Azure BYOM 時にどの deployment を使うか、画像系専用モデル切替（例: gpt-4o-vision deployment 別建て）の有無が未定義
  * Resolution: Step 4.3 もしくは Step 3.3 で `BBOX_VISION_MODEL` 環境変数を追加し、未設定時の fallback として方式 C を即時採用する分岐を明記する補強が必要
  * Impact: **major** — vision model が gpt-image-2 deployment と同居しないテナント運用時にブロッカー化し得る。Resolution は記録済みだが Plan Step 4.3 / 7.2 / 7.3、Details Step 2.1 / 4.3 / 7.2 のいずれにも `BBOX_VISION_MODEL` の追加記述が無く、未反映状態

* DR-12: **NEW (Validation 2026-05-20)** bbox 抽出 → 方式 C フォールバックの **trigger 条件が未定義**
  * Source: Option B リサーチ §A エグゼクティブサマリ（bbox 非決定性の緩和として方式 C を safety net とする）/ Plan Step 4.5 / Details Step 4.5
  * Reason: Plan も Details も「schema violation 再リトライも失敗時」とのみ記述。具体的に (a) リトライ回数（Step 4.3 details は「リトライ 1 回」と書くが Step 4.5 の判定との接続が曖昧）、(b) `elements: []`（要素 0 件）を fallback 起点に含めるか、(c) bbox 座標が EMU 範囲（0 〜 12192000 × 6858000）外の場合の扱い、(d) Copilot SDK 呼び出し自体のネットワークエラーを fallback に含めるか、が未定義
  * Resolution: Plan Step 4.5 / Details Step 4.5 に判定マトリクス（fallback trigger = `schema_invalid_after_retry | elements_empty | bbox_out_of_range | vision_api_error | vision_timeout`）と各分岐のテレメトリ（`x-pptx-fallback-reason` ヘッダ等）を明記する補強が必要
  * Impact: **major** — 未定義のままだと「正常系で全て fallback」「正常系で全て fail」のどちらかに偏ったブラックボックスになり得る

* DR-13: **NEW (Validation 2026-05-20)** vision LLM 経由 bbox 抽出の **N スライド並列度・タイムアウトが未定義**
  * Source: Option B リサーチ §A.1（1280×720 PNG 1 枚 ≒ 3〜8 秒/枚、10 枚で 30〜80 秒、並列化前提）/ Plan Step 4.5 / Details Step 4.5
  * Reason: Plan Step 4.5 は「各 slide について `extractLayout` を実行」とだけ記載で逐次/並列の指定なし。10 スライドを逐次実行すると 30〜80 秒、Container Apps の HTTP timeout（既定 240 秒）に対して安全だが、SSE keepalive と PPTX 応答までのレイテンシが UX 上の許容範囲を超え得る。並列化の場合、Copilot SDK 側の RPM/同時 attachments 制約も未確認
  * Resolution: Plan Step 4.5 / Details Step 4.5 で per-deck の bbox 抽出を p-queue (concurrency=3〜5) で並列化することを明記、各呼び出し timeout を 20 秒に設定、deck 全体の hard timeout を 90 秒として超過時は方式 C へ一括フォールバックする補強が必要
  * Impact: **major** — UX レイテンシと Container Apps timeout 双方の境界条件で失敗し得る

### Plan Deviations from Research

* DD-01: 画像 → PPTX 変換は **vision LLM で SlideLayout（textbox/auto_shape/line/picture）を抽出 → pptxgenjs で再構築**（Option B）
  * Research recommends: Option B リサーチ §A 採用、§D layout schema
  * Plan implements: Step 4.3 (bbox-extractor) + Step 4.4 (layout-to-pptx)
  * Rationale: ユーザー指示「SKILL を使って PPTX を生成」に整合。Hybrid C は Step 4.5 のフォールバックとして残す

* DD-02: 画像は base64 を SSE で送らず、別 GET エンドポイントで取得
  * Plan implements: `/api/skills/image/[id]` GET で binary 取得、SSE は `{ imageId, url }` のみ
  * Rationale: パフォーマンス最適化

* DD-03: gpt-image-2 への入力にロゴ・配色テンプレート参照画像は **含めない**（フェーズ A）
  * Plan implements: `/openai/images/generations` のみ使用
  * Rationale: 最小実装優先

* DD-04: 画像キャッシュは **in-memory Map**（Container Apps の単一インスタンス前提）
  * Plan implements: Map + TTL 1h、`minReplicas: 1` 強制（Step 7.2）
  * Rationale: マルチインスタンス化は WI-01 に分離

* DD-05: Phase 3, 4, 4B の parallelization ゲート明記 — **RESOLVED**

* DD-06: チャット経由 update_slide 後の画像自動再生成 — **RESOLVED**

* DD-07: Foundry API パス・モデル名の不一致 — **RESOLVED**

* DD-08: pptxgenjs `slide.background` / `slide.addImage` data 形式 — **RESOLVED**

* DD-09: **NEW (Option B)** SKILL の `crop_padding_px` 自動切り出しを **採用しない**
  * Research recommends: Option B リサーチ §D.5
  * Plan implements: vision LLM が `source.cropPx` に padding 込みで直接座標を指定する設計
  * Rationale: 参考 SKILL の自動切り出しは人手 layout 作成前提、本リポは LLM が一発で座標出力

* DD-10: **NEW (Option B)** SKILL の `transparent_background` 処理を **採用しない**（MVP）
  * Plan implements: MVP 段階では透過処理スキップ
  * Rationale: 最小実装優先、透過対応は将来 WI に分離

* DD-11: **NEW (Option B)** 品質ゲートは **PPTX ダウンロードをブロックしない非同期 job**
  * Research recommends: Option B リサーチ §E.3 オプション A 採用
  * Plan implements: Phase 4B.3 / 4B.4、UI は Step 6.6 でバッジ polling
  * Rationale: チャット UX の「数十秒で PPTX ダウンロード」要件を満たす

* DD-12: **NEW (Option B)** variant search 機能（複数候補生成）は **フェーズ A 対象外**
  * Research recommends: Option B リサーチ §E.4
  * Plan implements: 「再生成」ボタンのみ、内部 variant 並列生成は実装しない
  * Rationale: gpt-image-2 RPM 配慮 + UI 複雑度抑制。WI-08 に分離

* DD-13: **UPDATED (Validation 2026-05-20, CORRECTED)** LibreOffice レンダ DPI / signature が **plan 記述と details 実装で乖離**
  * Research recommends: Option B リサーチ §B.5（150 dpi を品質ゲート用に推奨）/ §B.4 reference 実装は `renderPptxToPngs(pptxPath, opts: { dpi?: number; timeoutMs?: number })` シグネチャを提示
  * Plan implements (記述): `renderPptxToPngs(pptxBuf, { jobId, dpi=150, timeoutMs=60000 })` で 150 dpi、timeout 60 秒（plan Step 4B.1）
  * Details implements (コードスタブ): signature は `opts: { jobId: string }` のみ（`dpi` / `timeoutMs` 未宣言）。それなのに body は `execFile('pdftoppm', ['-png', '-r', String(dpi), 'out.pdf', 'page'])` で **未宣言の `dpi` を参照** — そのまま実装すると `String(undefined) === 'undefined'` が `pdftoppm` の `-r` に渡り 100% 失敗する。**前回ログ記述「120 dpi ハードコード」は誤りで、実体は signature 抜けによる runtime 不整合**
  * Resolution: Details Step 4B.1 の signature を plan に合わせ `opts: { jobId: string; dpi?: number; timeoutMs?: number }` に修正、コード冒頭で `const { dpi = 150, timeoutMs = 60_000 } = opts` の分解代入を明記、`execFile` 第 4 引数に `{ timeout: timeoutMs }` を渡す
  * Impact: **major** — そのまま実装すると LibreOffice → PNG パスがビルドは通っても runtime で失敗する

* DD-14: **NEW (Validation 2026-05-20)** Details に **ローカルユーザーパスがコミット対象として残存**
  * Source: Details "Context Reference"（冒頭）/ Step 4.1 Context references — `C:\Users\akhayash\AppData\Local\Temp\pptx-from-image-ref\SKILL.md` および `findings.md` を直接参照
  * Reason: ユーザー preference「c:\Users\akhayash, c:\Repos は repo にコミットしない」に違反。Plan は `EMU リポ akhayash_microsoft/Hitachi-IT-Dev` を参照しているのに対し、Details は temp パスのまま
  * Resolution: Details の該当参照をすべて `EMU 組織 akhayash_microsoft/Hitachi-IT-Dev` の `pptx-from-image` SKILL（取得元）と本リポの `skills/pptx-from-image/SKILL.md`（取り込み先）に置換
  * Impact: **major** — secret 漏洩ではないが repo polish と reproducibility（他開発者がチェックアウトしても辿れない）の観点で要修正

* DD-15: **NEW (Validation 2026-05-20)** Plan Phase 4B と Details Phase 4B で **`<!-- parallelizable: ... -->` フラグが反対**
  * Research recommends: Option B リサーチ §E.3（品質ゲートはクリティカルパス外＝非同期、PPTX 生成と並列可）
  * Plan implements: Phase 4B ヘッダコメント `<!-- parallelizable: false，Phase 4 と Phase 7.1 完了後 -->`
  * Details implements: Phase 4B ヘッダコメント `<!-- parallelizable: true、ただし Phase 4 完了後 -->`
  * Resolution: 非同期 fire-and-forget は Phase 4B 内 4 ステップが相互依存（4B.1→4B.2→4B.3→4B.4）であり、Phase 4B "ステップ間" は逐次（false）、Phase 4 とは並列可（4B 全体は Phase 4 とパラレル）。Plan/Details いずれかに統一する。推奨は **Phase 4B 内 = false、Phase 4 との並列性は dependency 表記**
  * Impact: minor — 実行順序の解釈ぶれ

* DD-16: **NEW (Validation 2026-05-20)** `LIBREOFFICE_CONCURRENCY` env が **Bicep で宣言されるのみで renderer が読まない**
  * Research recommends: Option B リサーチ §B.3（p-queue concurrency=1〜2、メモリと CPU に応じて調整可能であるべき）
  * Plan implements: Step 7.2 で `LIBREOFFICE_CONCURRENCY` (既定 `2`) を env に追加と記載。一方 Step 4B.1 では「p-queue concurrency=1〜2」と range のみ
  * Details implements: Step 4B.1 で「concurrency=2 のキューに包む（モジュールスコープで singleton）」とハードコード値、env 参照の記述なし
  * Resolution: Details Step 4B.1 に「`const concurrency = Number(process.env.LIBREOFFICE_CONCURRENCY ?? '2')`」を追加、`new PQueue({ concurrency })` で受ける
  * Impact: minor — 動くが運用時のチューニングフックが不通

* DD-17: **NEW (Validation 2026-05-20)** Plan Phase 8 (4 steps) と Details Phase 8 (5 steps) で **step 数不一致**
  * Plan implements: 8.1 ビルド検証 / 8.2 ローカル両モード検証 / 8.3 ESLint / 8.4 ブロッカー報告
  * Details implements: 8.1 ビルド / 8.2 Docker smoke / 8.3 ローカル両モード検証 / 8.4 Lint / 8.5 ブロッカー報告
  * Resolution: Plan に Docker smoke step（`docker build` + `soffice --version` / `pdftoppm -v` / image サイズ確認）を 8.2 として明示追加し、後続を 8.3〜8.5 に繰り下げ
  * Impact: minor — 後で plan-only を読む人が Docker 検証を見落とすリスク

* DD-18: **NEW (Validation 2026-05-20)** Details トップの **Context Reference が Pivot 前の推奨を残置**
  * Source: Details "Context Reference"（冒頭）— `linux-pptx-rendering-research.md — Linux 代替手法（推奨：ハイブリッド方式 C、LibreOffice なし）` と記載
  * Reason: Planning Log の Pivot Log で 2026-05-20 に Option B 採用が宣言されているが、Details はそれ以前の編集状態（方式 C を推奨と記述）のまま
  * Resolution: Details 冒頭の参照を「`linux-pptx-rendering-research.md` — 旧方式 C 研究（**fallback 経路の参考資料**として保持）」と修正、`option-b-feasibility-research.md` を採用根拠として明記
  * Impact: minor — Details 単独で読むと方針判断を誤る恐れ

* DD-19: **NEW (Validation 2026-05-20)** Dockerfile warm-up に **per-PID `-env:UserInstallation` 指定が無く UNO profile 残骸が発生し得る**
  * Research recommends: Option B リサーチ §B.3（並行・連続実行で UNO bootstrap 競合を避けるため per-PID/uuid profile を毎回指定）
  * Plan implements: Step 7.1「同レイヤ末尾で `soffice --headless --convert-to pdf ... || true` を 1 回」
  * Details implements: 同様。`-env:UserInstallation` の指定なし。`ENV HOME=/tmp` のため `/tmp/.config/libreoffice/` に書き込まれ、runtime の per-job `/tmp/uno-<jobId>-<pid>` パスとは別 profile になるが、warm-up 残骸が再起動時 cleanup されず累積する恐れ
  * Resolution: Dockerfile warm-up にも `-env:UserInstallation=file:///tmp/lo-warmup` を付与し、warm-up 直後に `rm -rf /tmp/lo-warmup` で削除する手順を明記
  * Impact: minor — 実害は限定的だが clean image principle と一貫性のため

* DD-20: **NEW (Validation 2026-05-20)** Details Step 4.2 zod schema sample に **DR-07 が約束する `superRefine` 実装記述が欠落**
  * Research recommends: Option B リサーチ §D.5（負の bbox 幅・高さで PPTX が壊れる、同一 ID 重複で label 二重出力）
  * Plan implements: Step 4.2 で「`unique(id)` / `w > 0 && h > 0` を assert」と要求
  * Details implements: Step 4.2 の zod スキーマ簡略図示には `superRefine` も `unique` 制約も書かれていない。簡略図示の注記のみで、実装者が DR-07 の約束に気づきにくい
  * Resolution: Details Step 4.2 のサンプル末尾に `SlideLayoutSchema.superRefine((data, ctx) => { /* unique(id), bbox.w>0 && bbox.h>0 */ })` 例を追記
  * Impact: minor — レビュアー/実装者の見落とし防止用ガード

* DD-21: **NEW (Validation 2026-05-20)** Details Step 5.1 の cross-reference 行番号が **Phase 2/3 と重複**
  * Source: Plan Phase 5 の Step 5.1 が `Details ... (Lines 442-484)` を指している一方、Plan Phase 4 Step 4.3 も `(Lines 412-470)` を指しており、Details の現行行構成（Step 4.3 が Lines 412 前後、Step 5.1 が Lines 480 前後）と微妙にずれている
  * Reason: Plan の "Details: (Lines ...)" cross-reference が details 編集後に再採番されていない
  * Resolution: Plan の全 Step の `Details: (Lines ...)` 行番号を details 確定後に grep で再計算して更新する（plan-validator の責務ではなく task-planner の polish タスク）
  * Impact: minor — purely cosmetic、実装ブロッカーではない

## Implementation Paths Considered

### Selected: Option B — 外部組織共有スキル `pptx-from-image` 取り込み + vision LLM bbox + LibreOffice 品質ゲート

* Approach:
  1. EMU 組織 `akhayash_microsoft/Hitachi-IT-Dev` の `pptx-from-image` SKILL を本リポ `skills/pptx-from-image/` に取り込み、Copilot SDK の `skillDirectories` から読み込ませる
  2. gpt-image-2 が生成した画像 → vision LLM (Copilot SDK の `attachments`) で `SlideLayout` (textbox / auto_shape / line / picture) を bbox 付きで抽出
  3. `layout-to-pptx.ts` で `SlideLayout` → pptxgenjs オブジェクトに変換（テキストはネイティブ要素、figure は `sharp.extract()` で切り出し `slide.addImage()`）
  4. 別途 LibreOffice headless で生成 PPTX を PNG レンダ → 元画像と pixelmatch + sharp-phash で diff → 品質バッジを **非同期** に表示
  5. bbox 抽出が失敗した場合は **方式 C（背景画像 + テキスト重ね）にフォールバック**し、ユーザーに必ず PPTX を返す
* Rationale:
  * ユーザー指示「SKILL を使って PPTX を生成」「LIBRE をつかえば解決する」に直接対応
  * EMU 組織で既に検証された SKILL を再利用することで実装コスト削減
  * テキストが完全に編集可能（参考 SKILL.md の哲学に準拠）
  * Linux Docker で完結（LibreOffice + poppler）
  * 品質ゲートを非同期化することで PPTX ダウンロード UX を維持
* Evidence:
  * .copilot-tracking/research/subagents/2026-05-20/option-b-feasibility-research.md §A〜§E
  * C:\Users\akhayash\AppData\Local\Temp\pptx-from-image-ref\SKILL.md / findings.md

### IP-01: Hybrid C — 画像背景 + pptxgenjs ネイティブテキスト（旧 Selected、現フォールバック）

* Approach: gpt-image-2 が生成した画像を `slide.background` で背景に貼り、`set_scenario` の構造化データを pptxgenjs ネイティブ要素として上にオーバーレイ
* Trade-offs: bbox 抽出を行わないため figure と text の重なり制御が粗い。逆に LLM 呼び出し不要で安価・高速
* Rejection rationale: ユーザー指示「SKILL を使って PPTX を生成」に完全には合致しない。ただし bbox 抽出失敗時の **フォールバック** として Step 4.5 に組み込んだ

### IP-02: 純テキスト抽出方式（画像なしで pptxgenjs 直接生成）

* Approach: 画像生成パスを採用せず、既存 code モードを拡張するのみ
* Trade-offs: 最小実装だがユーザー要件「画像イメージを使ったスライド作成」を満たせない
* Rejection rationale: ユーザー要求と不一致

### IP-03: 画像を `slide.addImage` で 1 枚貼り付け（テキストなし）

* Approach: 編集可能テキストを完全に省略し、画像のみ含む PPTX
* Rejection rationale: ユーザー要求「PPTX ネイティブ」と参考 SKILL.md の「1 枚画像貼り付け禁止」哲学に違反

### IP-04: 自前で `pptx-from-image` 相当のロジックを書き起こす（SKILL 取り込みなし）

* Approach: 参考 SKILL.md を読みながら本リポにスクラッチ実装
* Trade-offs: 学習・実装コスト大、EMU で既に検証されたロジックを再現できないリスク
* Rejection rationale: SKILL 取り込みのほうが工数小・信頼性高

### IP-05: 同期的に LibreOffice レンダ検証 → 不合格なら自動リトライ

* Approach: 品質ゲートを PPTX 生成パイプラインに直列で組み込み、不合格なら bbox 再抽出 → 再生成のループ
* Trade-offs: 自動品質保証になるが 10〜30 秒のレイテンシが追加され、UX を阻害
* Rejection rationale: チャット UX を優先、非同期バッジで代替（DD-11）

## Validator Resolution Summary

Plan Validator (2026-05-20) で 5 major + 7 minor の指摘を受領し、すべて反映済み。

| ID    | Severity | 内容                                        | 解決                                                                                                  |
|-------|----------|---------------------------------------------|-------------------------------------------------------------------------------------------------------|
| DD-13 | major    | renderer のシグネチャ・タイムアウト未定義   | `renderPptxToPngs(buf, { jobId, dpi?=150, timeoutMs?=60_000 })` を Step 4B.1 に明文化                 |
| DD-14 | major    | ローカル Temp 絶対パス参照が残存            | `skills/pptx-from-image/SKILL.md` 等のリポ内パスに置換（Plan References、Step 4.1）                   |
| DR-11 | major    | vision モデル指定が曖昧                     | `BBOX_VISION_MODEL=gpt-4o` を env 化、Step 4.3 / Step 7.2 に明記                                      |
| DR-12 | major    | Hybrid C フォールバックの発動条件未定義     | Step 4.5 を再構築：schema-violation×retry / 空 elements / 範囲外 / 20s timeout / network・auth で発動 |
| DR-13 | major    | vision 並列度・タイムアウト未指定           | `BBOX_VISION_CONCURRENCY=3`、per-call 20s、per-deck 90s を Step 4.3 / Step 4.5 / Step 7.2 に追加      |
| DD-15 | minor    | Phase 4B の parallelizable フラグ過大       | `parallelizable: false` に修正                                                                        |
| DD-16 | minor    | `LIBREOFFICE_CONCURRENCY` の使用箇所未記載  | Step 4B.1 の p-queue で読み取り、Step 7.2 で default `1`（2 GiB 安全値）を Bicep env に追加           |
| DD-17 | minor    | Plan Phase 8 と Details Phase 8 のステップ差 | Plan/Details ともに Phase 8 を 5 step（ビルド・Docker smoke・手動・lint・ブロッカー）で統一           |
| DD-18 | minor    | Context Reference に旧推奨が残存            | "推奨：Hybrid C, LibreOffice なし" を削除、Option B 前提に書き換え                                    |
| DD-19 | minor    | Docker warm-up が UserInstallation を汚染   | `-env:UserInstallation=file:///tmp/uno-warmup-build` を使い、`rm -rf` でクリーンアップ                |
| DD-20 | minor    | zod の意味検証不足                          | `superRefine` で id-unique / w&h>0 / bbox-in-bounds をチェック（Step 4.2 にスニペット）               |
| DD-21 | minor    | 行番号参照のずれ                            | 修正後の最終整合は Task Implementor フェーズで確認（cosmetic）                                        |

## Suggested Follow-On Work

* WI-01: 画像キャッシュ & job 結果の **Blob Storage 化** — 複数インスタンス・サーバー再起動に対応 (medium)
  * Source: DD-04 / Option B リサーチ リスク #3
  * Dependency: スケール要件発生時

* WI-02: gpt-image-2 への reference image 入力（ブランドテンプレート反映） (medium)
  * Source: 旧 DD-03
  * Dependency: テンプレート画像の用意

* WI-03: bodyMarkdown / bullets を画像プロンプトに自動反映する prompt builder の高度化 (low)
  * Dependency: フェーズ A の運用結果

* WI-04: LibreOffice 不要な代替レンダ（`apryse-docx` / `docx-pdf` SaaS 等）の検証 (low)
  * Source: Option B リサーチ §B.4 代替案
  * Dependency: LibreOffice 起因の問題が顕在化したとき

* WI-05: スケール時のレート制限制御 — gpt-image-2 の TPM/RPM クォータ管理、リトライバックオフ (medium)
  * Dependency: 利用ボリューム増加時

* WI-06: 生成画像の cosmetic edit（cropping / blur / overlay 等）の UI (low)
  * Dependency: フェーズ A の運用結果

* WI-07: **NEW (Option B)** image diff 閾値の **実測キャリブレーション** — pass / warn / fail を本リポの典型ケースで再調整 (medium)
  * Source: DR-10 / Option B リサーチ §C.3
  * Dependency: フェーズ A 運用開始 + サンプル蓄積

* WI-08: **NEW (Option B)** variant search 機能 — 1 スライドで n 個の bbox 候補を並列レンダして best score を採用 (low)
  * Source: DD-12 / Option B リサーチ §E.4
  * Dependency: gpt-image-2 RPM 余裕 + UI 設計

* WI-09: **NEW (Option B)** LibreOffice warm-up sidecar — cold start の最初の `soffice` 起動 5〜10 秒を吸収 (low)
  * Source: Option B リサーチ §B.3 / Top 3 リスク #1
  * Dependency: cold start 影響が顕在化したとき

* WI-10: **NEW (Option B)** UNO bootstrap 競合の Sentry/監視 (low)
  * Source: DR-08
  * Dependency: 並行実行時の障害発生時

* WI-11: **NEW (Implementation 2026-05-20)** `SlideLayout` 型の名前衝突解消 — `src/domain/entities/slide-work.ts` の `type SlideLayout` (string union for slide layout hint) と `src/domain/entities/slide-layout.ts` の `interface SlideLayout` (bbox layout) を同時 import する箇所が将来発生したら、片方を rename（候補: `SlideLayoutHint`）。現状は破壊的変更を避け並列定義 (low)
  * Source: Phase 4 implementor report
  * Dependency: 両型を同時利用する消費者の発生

* WI-12: **NEW (Implementation 2026-05-20)** code モードと image-then-pptx モードのスライド寸法統一 — code モードは 13.33×7.5 (LAYOUT_WIDE)、image-then-pptx モードは 10×5.625 (LAYOUT_16x9 default)。両モード混在表示時に違和感が出る可能性あり (low)
  * Source: Phase 4 implementor report
  * Dependency: ユーザーフィードバック

* WI-13: **NEW (Implementation 2026-05-20)** `DesignBrief.industry` フィールドの追加検討 — Plan/Details では `brief.industry` を image-prompt で使う想定だが、現行 `DesignBrief` には industry なし。`image-prompt-builder.ts` は `tone` / `visualStyle` / `colorMood` / `density` / `audience` で代替実装。後付け可能 (low)
  * Source: Phase 2 implementor report
  * Dependency: ユーザー要望

## Implementation Deviations

* DD-22: **NEW (Implementation 2026-05-20)** PPTX route の `imageIds` 形式
  * Plan/Details specifies: `Record<number, string>` (Details Step 4.5)
  * Implementation: `Array<{ slideNumber: number; imageId: string }>` (より明示的・型安全)
  * Rationale: ユーザー指示の更新と Array 形式の方が型推論に優しい

* DD-23: **NEW (Implementation 2026-05-20)** `SlideWork.generationMode` を optional に
  * Plan specifies: 既定 'code' でフィールド追加
  * Implementation: optional `?` で追加（既存初期化箇所を変更せずに段階導入）
  * Rationale: Phase 1 のスコープ「`src/domain/entities/slide-work.ts` 以外を変更しない」を満たすため。利用側で `?? 'code'` フォールバック前提

* DD-24: **NEW (Implementation 2026-05-20)** Bicep が Container App 自体を所有
  * Plan specifies: Bicep に env vars を「追加」（既存 GH Actions の `az containerapp` 管理を維持する前提だった可能性）
  * Implementation: Bicep に Container App リソース本体を追加して env / cpu / memory / minReplicas を一元管理。GH Actions の deploy workflow は `--image` 更新で共存
  * Rationale: env 配列・memory 2GiB・minReplicas=1 の Plan 要件を Bicep だけで担保するため。GH Actions workflow 側の `create` ステップは将来 `update --image` のみに簡素化する follow-on (WI-14) で整理

* DD-25: **NEW (Implementation 2026-05-20)** Foundry ロール付与は同 RG 前提
  * Plan specifies: Foundry リソースに Cognitive Services User ロール付与
  * Implementation: 同 RG 前提で実装。クロス RG / クロスサブスクリプションは別モジュール化が必要（WI-15）
  * Rationale: Bicep の role assignment scope 制約

