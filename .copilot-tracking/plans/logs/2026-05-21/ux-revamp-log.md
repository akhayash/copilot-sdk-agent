<!-- markdownlint-disable-file -->
# Planning Log: UX Revamp

## Discrepancy Log

### Unaddressed Research Items

* DR-01: 画像生成キャッシュ (`image-cache.ts`) はインメモリのまま。複数インスタンス時の Blob Storage 化（WI-01 既出）
  * Source: AGENTS.md `image-cache.ts` 記述
  * Reason: 本タスクスコープ外（UX 改善であり永続化は別問題）
  * Impact: low

* DR-02: 品質ゲート（PPTX 後段の LibreOffice 比較）の閾値キャリブレーション
  * Source: AGENTS.md Quality Gate 節
  * Reason: 本タスクスコープ外
  * Impact: low

### Plan Deviations from Research

* DD-01: `<img>` のクロップ修正で `aspect-[3/2]` への変更ではなく `object-contain` を採用
  * Research recommends: `object-contain` または `aspect-[3/2]` のいずれか
  * Plan implements: `object-contain`
  * Rationale: aspect 変更は親レイアウト全般 (SlideCard 内サイズ・レスポンシブ) へ波及するため影響範囲を最小化。中性背景で余白を吸収する方が安全。

* DD-02: 新しい表示名 (APP_NAME) は `'Slide Studio'` で確定 (PD-01 = Option A)
  * Research recommends: ユーザー確認後に確定値を採用
  * Plan implements: `src/app/brand.ts` に確定値で投入
  * Rationale: 命名を一元化、後日変更も 1 行差し替え

* DD-03: 画像生成確認 UX は PD-02 Option C を採用 (チャット内デザイン方針サマリ + 右パネル『全画像を生成』ボタン承認)
  * Research recommends: チャット質問 / UI バナー / 両方 の三択
  * Plan implements: 両方 — SKILL でチャット内に短いサマリを貼り、承認動線は UI ボタンに固定
  * Rationale: 文脈をチャットログに残しつつ、承認イベントを 1 か所 (UI ボタン) に集約してログ追跡性を上げる

* DD-04: コンテキスト容量 PD-03 Option B (5000 / 12 / 600) 採用 (推奨値)
  * Research recommends: 4000〜8000 の範囲
  * Plan implements: 中庸値で実装
  * Rationale: ノイズと表現力のバランス

* DD-03 (minor): 確認バナーの「画像生成をスキップ」CTA を local state による非表示に留め、永続化しない
  * Research recommends: ユーザー要望 #9 は「ストーリー確定後に画像生成可否をユーザーに確認」とだけ要求
  * Plan implements: スキップは tab 再リロードで再出現 (永続化しない)
  * Rationale: 「スキップ＝意思」より「スキップ＝今は不要」と解釈、デザイン方針修正後に再判断できるよう保守的にした

* DD-04 (minor): SKILL.md (`create-slide-story` / `pptx-from-image`) の更新を Phase 7 Step 7.3 と Phase 9 Step 9.1/9.2 の 2 フェーズに分割
  * Research recommends: SKILL 改訂の単一作業として記述
  * Plan implements: Phase 7 で承認フロー骨子を、Phase 9 で文言精緻化と AGENTS.md 整合を別フェーズに分離
  * Rationale: Phase 7 は UI バナー実装と密結合のため一括テスト、Phase 9 は SKILL/ドキュメント整合の独立フェーズ。Phase 番号順実行を前提とするため上書き競合は発生しないが、実装者は Phase 9 で「再編集」ではなく「拡張」と認識する必要がある

## Implementation Paths Considered

### Selected: 単一ブランチで段階的フェーズ実装 (9 phase + validation)

* Approach: 関心領域ごと 9 フェーズに分割。レイアウト並べ替え (Phase 5)・ローディング (Phase 6)・確認バナー (Phase 7)・新規ページ機能 (Phase 8) は同じ `slide-panel.tsx` を触るため直列に。それ以外は parallelizable。
* Rationale: 関連する DOM/UX を一度に整え、段階的に手動確認でリグレッションを発見できる。プロダクト名のような独立変更は並列化可能。
* Evidence: `.copilot-tracking/research/2026-05-21/ux-revamp-research.md`

### IP-01: feature-flag による段階リリース

* Approach: 新 UI を flag 配下に置き、旧 UI と並行運用しながら順次切替
* Trade-offs: 移行リスクを最小化できるが、UI コードが二重化し保守コスト増。デモ用途では過剰
* Rejection rationale: 本リポはデモアプリで、明示的に新 UX への置き換えを依頼されているため

### IP-02: ヘッダー命名のみ先行 PR、他は後続 PR

* Approach: 命名変更だけ独立 PR
* Trade-offs: PR 数増・確認コスト増、ユーザー要望は一括の意図が強い
* Rejection rationale: 単一一括対応の方が文脈一致

## Suggested Follow-On Work

* WI-01: 画像キャッシュの Blob Storage 化 — マルチインスタンス対応 (medium)
  * Source: AGENTS.md
  * Dependency: 本タスク完了後でよい

* WI-02: imagePrompt の差分プレビュー — buildImagePrompt の自動値 vs ユーザー編集の差分表示 (low)
  * Source: Step 8.5 設計
  * Dependency: 本プラン Phase 8 完了

* WI-03: 新規ページ追加時のレイアウト選択 UI — bullets / image-only / quote 等を選択 (medium)
  * Source: Step 8.1 設計
  * Dependency: 本プラン Phase 8 完了

* WI-04: 画像生成確認バナーをチャットメッセージとしても表示するハイブリッド UX (low)
  * Source: PD-02 検討から
  * Dependency: 本プラン Phase 7 完了

* WI-05: 本文プレビュー / 編集 / Markdown 表示の状態を localStorage に永続化 (low)
  * Source: Step 3.1 設計
  * Dependency: なし
