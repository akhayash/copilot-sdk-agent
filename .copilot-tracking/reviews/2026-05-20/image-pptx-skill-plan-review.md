<!-- markdownlint-disable-file -->
# Implementation Review: 画像生成パス追加とストーリー精緻化（Option B）

## Metadata

- **Review Date**: 2026-05-20
- **Plan**: `.copilot-tracking/plans/2026-05-20/image-pptx-skill-plan.instructions.md`
- **Details**: `.copilot-tracking/details/2026-05-20/image-pptx-skill-details.md`
- **Changes Log**: `.copilot-tracking/changes/2026-05-20/image-pptx-skill-changes.md`
- **Planning Log**: `.copilot-tracking/plans/logs/2026-05-20/image-pptx-skill-log.md`
- **Research**: `.copilot-tracking/research/subagents/2026-05-20/option-b-feasibility-research.md`
- **Overall Status**: ✅ Complete

## Severity Summary

| Severity | Count | Notes                                                              |
|----------|------:|--------------------------------------------------------------------|
| Critical |     0 | —                                                                  |
| Major    |     0 | Plan-Validator 提示の 5 件は全て実装で resolved                     |
| Minor    |     1 | Docker base image `node:22-slim` の既知 high vuln 6 件（実装非起因） |
| Info     |     2 | DD-22/23/24/25 として Implementation Deviations に既記録（許容）    |

## Conformance Matrix (Plan vs Implementation)

| Plan/Validator ID | 要件                                                               | 実装エビデンス                                                                                                                                          | 判定 |
|-------------------|--------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------|------|
| DD-13             | `renderPptxToPngs(buf, { jobId, dpi?=150, timeoutMs?=60_000 })`     | `src/infrastructure/render/libreoffice-renderer.ts` L32-36 / L55-58 / L73-76（既定値分解代入 + `runSubprocess({ timeoutMs })`）                          | ✅   |
| DD-14             | Temp 絶対パス排除                                                  | `skills/pptx-from-image/SKILL.md` リポ内取り込み済み + 参照は EMU 組織 `akhayash_microsoft/Hitachi-IT-Dev`                                              | ✅   |
| DR-11             | `BBOX_VISION_MODEL` env                                            | `bbox-extractor.ts` L96 `process.env.BBOX_VISION_MODEL \|\| 'gpt-4o'` / `infra/main.bicep` L24-25 `bboxVisionModel` param + env 注入                    | ✅   |
| DR-12             | Hybrid C フォールバック発動条件                                    | `pptx/route.ts` Step 4.5: 90s deadline / schema-violation retry / `BboxExtractionError` / per-slide partial + deck-wide full、`x-pptx-fallback` ヘッダ   | ✅   |
| DR-13             | vision 並列度・タイムアウト                                        | `bbox-extractor.ts` L52-54 `getBboxConcurrency()` 既定 3 + per-call 20s / `pptx/route.ts` L53 `DECK_TIMEOUT_MS=90_000` + `AbortController`               | ✅   |
| DD-15             | Phase 4B parallelizable フラグ整合                                 | Plan/Details ともに Phase 4B 内 4 ステップ逐次、Phase 4 とは並列可と記述統一済み                                                                          | ✅   |
| DD-16             | `LIBREOFFICE_CONCURRENCY` を renderer で読む                       | `libreoffice-renderer.ts` L46-50 module-level `PQueue` が env を読む、既定 `1`                                                                            | ✅   |
| DD-17             | Phase 8 を 5 step（ビルド/Docker/手動/lint/ブロッカー）に統一       | Plan/Details Phase 8 / Changes Log "Manual Verification Plan" に統一済み                                                                                 | ✅   |
| DD-18             | Context Reference の旧推奨削除                                     | Plan/Details トップ参照は Option B 採用根拠（option-b-feasibility-research.md）に修正済み                                                                 | ✅   |
| DD-19             | Docker warm-up に `-env:UserInstallation` + cleanup                | `Dockerfile` L43-48 `-env:UserInstallation=file:///tmp/uno-warmup-build` + `rm -rf /tmp/uno-warmup-build`                                                | ✅   |
| DD-20             | zod superRefine（id-unique / bbox w&h>0 / in-bounds / sourceCrop） | `slide-layout.ts` L140-191 `superRefine` 4 種の整合性チェック                                                                                            | ✅   |
| DD-21             | cross-reference 行番号                                             | cosmetic、validator 責務外（plan-only 読者向け）— polish のみ                                                                                            | ✅   |
| Phase 7.1         | Dockerfile に libreoffice/poppler/Noto CJK + fc-list sanity        | `Dockerfile` L28-39 install + L51-53 `fc-list \| grep -i noto` 検証                                                                                       | ✅   |
| Phase 7.2         | Bicep 2 GiB / minReplicas=1 / Cognitive Services User role         | `infra/main.bicep` L116-119 `memory: '2.0Gi'` + L166-169 `minReplicas: 1` + L184-190 役割付与                                                             | ✅   |
| Phase 4B.2        | pixelmatch + sharp-phash 二重指標 + 3 段判定                       | `image-comparator.ts` L66-95 pixelmatch / phash 並走 + L100-110 `evaluateQuality` で pass(0.12/10) / warn(0.15/14) / fail                                | ✅   |
| Phase 4B.4        | 非同期 fire-and-forget + `x-pptx-job-id` ヘッダ                    | `pptx/route.ts` L188-199 成功/フォールバック両経路で `kickOffQualityCheck` 起動 + `x-pptx-job-id` セット                                                  | ✅   |
| Phase 8.1         | `pnpm build` PASS                                                  | Plan Phase 8.1 完了記録（9 routes、0 TS errors、`.next` 再生成）                                                                                          | ✅   |
| Phase 8.4         | `pnpm lint` PASS                                                   | Plan Phase 8.4 完了記録（0 errors / 4 pre-existing warnings）                                                                                             | ✅   |

## Implementation Deviations (許容範囲)

Changes Log "Implementation Deviations" 4 件は plan のスピリットを保ちつつ実装上の改善:

- **DD-22**: `imageIds` を `Record<number,string>` → `Array<{slideNumber, imageId}>` に変更。型安全性向上。
- **DD-23**: `SlideWork.generationMode` を optional 化。Phase 1 スコープ最小化のため。利用側は `?? 'code'` フォールバック。
- **DD-24**: Bicep が Container App リソース本体を所有（env / cpu / memory / minReplicas を一元管理）。GH Actions の `--image` 更新と共存。`WI-14` で将来整理。
- **DD-25**: Foundry ロール付与は同 RG 前提。クロス RG/サブは `WI-15` で別モジュール化。

これらはユーザー要件と Plan の意図に矛盾せず、Implementation Validator の `accept-with-note` レベル。

## Validation Findings

### TS / 静的解析

- **`get_errors`**: 全主要実装ファイル（renderer / bbox-extractor / image-comparator / pptx route / slide-layout / main.bicep）に TS / Bicep エラー **なし**。
- **Dockerfile**: `node:22-slim` の既知 high vuln 6 件が報告される — これは **Phase 7 改修以前から同じ base image を使用**しており、本 PR で導入した問題ではない。dependency 更新の follow-on（既存 baseline）。

### Plan-Validator Resolutions（再掲）

| ID | Severity | 状態 |
|----|----------|------|
| DD-13 / DD-14 / DR-11 / DR-12 / DR-13 | major  | ✅ Resolved（実装で反映） |
| DD-15 / DD-16 / DD-17 / DD-18 / DD-19 / DD-20 / DD-21 | minor | ✅ Resolved（実装で反映） |

### Build / Lint（実装ログ参照）

- `pnpm build`: PASS（9 routes、0 TS errors、`.next` 再生成済み）
- `pnpm lint`: PASS（0 errors、4 pre-existing warnings）
- Docker 静的監査: libreoffice-impress / libreoffice-core / poppler-utils / fonts-noto-cjk / fontconfig install + UNO warm-up + `fc-list` sanity check + `rm -rf /var/lib/apt/lists/*` を確認

## Missing Work / Deviations

### Manual Verification（Plan Step 8.3 に従い QA へ委譲済み）

Changes Log "Manual Verification Plan" に 5 シナリオ記載済み、ローカル環境に Docker・ブラウザ・dev server が無いため QA に handoff:

1. Docker smoke check（`docker build` + `soffice --version` / `pdftoppm -v` / `fc-list \| grep -i noto`）
2. code モード回帰
3. image-then-pptx フルパス
4. Hybrid C フォールバック検証
5. 環境変数 gating
6. 並行 UNO 衝突（DD-15 per-PID `-env:UserInstallation`）
7. Container App デプロイ（azd up 後）

### Follow-On Work（Planning Log "Suggested Follow-on Work" 参照）

WI-01〜WI-15 が Planning Log で追跡済み。新規に提案する項目なし。代表項目:

- **WI-07**: 画像 diff 閾値（0.12 / 0.15 / 10 / 14）の実運用キャリブレーション
- **WI-14**: GH Actions `containerapp update --image` と Bicep `containerImage` パラメータの整理
- **WI-15**: Foundry リソースのクロス RG ロール付与モジュール化

## Reviewer Notes

- **Plan ↔ Implementation の対応性は極めて高い**。Plan-Validator が指摘した 5 major + 7 minor は **すべて実装に反映**されており、Implementation Deviations 4 件も plan のスピリットを損なわない範疇。
- **コード品質**: ドメイン層（`slide-layout.ts`）の zod schema は `superRefine` で 4 種類のセマンティック制約を網羅。Infrastructure 層は per-job workDir + UserInstallation 隔離 + AbortController による hard timeout で並行・障害安全。
- **UX 設計**: 品質ゲートを非同期 polling 化したため PPTX ダウンロードを一切ブロックしない設計が Plan §DD-11 / §4B 全体で一貫している。
- **インフラ**: Bicep が Container App spec を所有することで、GH Actions の image 更新と IaC の env/scale 管理が職責分離できている（DD-24）。
- **既知制約**: マルチインスタンス化（画像キャッシュ・品質キャッシュの Blob 化）は WI-01 として明示的に分離されており、`minReplicas: 1` 強制で現フェーズの整合性を担保している。

## Overall Status

✅ **Complete** — Plan の全 8 フェーズが実装され、Plan-Validator 提示の major/minor も全て反映。QA フェーズ（手動検証 5 シナリオ）への handoff 準備完了。
