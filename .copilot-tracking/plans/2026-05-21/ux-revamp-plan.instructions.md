---
applyTo: '.copilot-tracking/changes/2026-05-21/ux-revamp-changes.md'
---
<!-- markdownlint-disable-file -->
# Implementation Plan: UX Revamp — 画像生成ローディング / 命名 / 本文プレビュー / レイアウト並べ替え / 新規ページ追加 / 画像生成確認

## Overview

ワークスペース UX を全面的に改善し、画像生成の待機表示、本文プレビュー強化、スライドカードのレイアウト並べ替え、新規ページ手動追加、画像生成前のユーザー確認フロー、プロダクト命名刷新、Lucide アイコンによる `→` 置き換え、画像クロップ修正、画像生成プロンプトのコンテキスト容量拡大を一括で行う。

## Objectives

### User Requirements

* 画像生成中の待機を可視化する全体ローディング — Source: ユーザー要望 #1
* `→` リテラルを Lucide アイコンに置換、UI を既存アイコン系統で統一 — Source: ユーザー要望 #2
* プロダクト名 `Copilot SDK Agent` を分かりやすい名前に変更 — Source: ユーザー要望 #3
* 本文はプレビュー既定 / Markdown コピー / Markdown 表示機能を備える — Source: ユーザー要望 #4
* 画像の上端クロップを解消 — Source: ユーザー要望 #5
* スライドカード内の並び順を「テキスト上 / 画像と speaker notes は下」に変更 — Source: ユーザー要望 #6
* 画像プロンプトに与えるコンテキスト容量を拡大して品質を上げる — Source: ユーザー要望 #7
* 右画面で「新規ページ追加 → 手動でテキスト入力 → 画像生成」シナリオを成立させる — Source: ユーザー要望 #8
* ストーリー確定後にユーザーに画像生成可否を確認し、その際デザイン方針も確認する — Source: ユーザー要望 #9
* 画像生成のインプット（本文以外）も編集可能にする — Source: ユーザー要望 #10

### Derived Objectives

* 表示名の変更は `app/layout.tsx` `metadata.title` と UI ヘッダーのみに留め、`package.json`/Bicep/Workflow に波及させない — Derived from: `package.json` の name はインフラと連動（research 参照）
* `object-cover` を `object-contain` + 中性背景に変更し、aspect 比そのものは保持してライトボックスや既存レイアウトに副作用を出さない — Derived from: aspect 変更の波及リスク
* 自動 `generate_all_images` 起動を SKILL 側で抑止しつつ、UI 側にも確認バナーを置く二重防壁にする — Derived from: SKILL だけ修正しても AI 違反時に止められない
* 表示名は `Slide Studio` (PD-01 確定) を `src/app/brand.ts` に集約し、後日変更しやすくする — Derived from: 命名の一元管理
* 画像生成プロンプトの上限値拡張と本文エディタの行数拡張は同じ「コンテキスト容量拡大」目的のためセットで扱う — Derived from: 一貫性

## Context Summary

### Project Files

* src/app/layout.tsx - メタデータタイトル
* src/app/components/chat/chat-container.tsx - ワークスペース state / 画像ハンドラー / ヘッダー
* src/app/components/chat/message-list.tsx - 空状態カード（命名連動）
* src/app/components/slides/slide-panel.tsx - 右パネル本体 / SlideCard / CTA
* src/app/components/slides/slide-image-card.tsx - 画像サムネ + ライトボックス
* src/app/components/slides/slide-body-editor.tsx - bodyMarkdown 編集
* src/app/components/slides/mode-toggle.tsx - `→` リテラル
* src/application/image-prompt-builder.ts - コンテキスト上限 (MAX_BODY_CHARS, MAX_BULLETS)
* src/domain/entities/slide-work.ts - SlideItem 型（編集対象拡張）
* skills/create-slide-story/SKILL.md - シナリオ確定後の振る舞い
* skills/pptx-from-image/SKILL.md - 画像→PPTX モード文言

### References

* .copilot-tracking/research/2026-05-21/ux-revamp-research.md - 本タスクの軽量リサーチ

### Standards References

* AGENTS.md — Clean Architecture / kebab-case ファイル名 / PascalCase コンポーネント / lucide-react + Tailwind 規約

## Implementation Checklist

### [ ] Implementation Phase 1: ブランディング & アイコン統一

<!-- parallelizable: true -->

* [ ] Step 1.1: 新規 `src/app/brand.ts` を作成し `APP_NAME` / `APP_TAGLINE` を集約
  * Details: .copilot-tracking/details/2026-05-21/ux-revamp-details.md (Lines 5-25)
* [ ] Step 1.2: `src/app/layout.tsx` `metadata.title` を `APP_NAME` 参照に置換
  * Details: .copilot-tracking/details/2026-05-21/ux-revamp-details.md (Lines 27-40)
* [ ] Step 1.3: `chat-container.tsx` ヘッダーの直書き名を `APP_NAME` / `APP_TAGLINE` 参照に置換
  * Details: .copilot-tracking/details/2026-05-21/ux-revamp-details.md (Lines 42-58)
* [ ] Step 1.4: `mode-toggle.tsx` のラベル `画像 → PPTX` を `画像` + Lucide `ArrowRight` + `PPTX` の構成に置換、JSDoc 内の `→` も `to` に置換
  * Details: .copilot-tracking/details/2026-05-21/ux-revamp-details.md (Lines 60-78)

### [ ] Implementation Phase 2: 画像カードのクロップ修正

<!-- parallelizable: true -->

* [ ] Step 2.1: `slide-image-card.tsx` のサムネ `<img>` を `object-contain` に変更し、背景を中性色 (`var(--surface-secondary)`) で吸収
  * Details: .copilot-tracking/details/2026-05-21/ux-revamp-details.md (Lines 80-100)
* [ ] Step 2.2: ライトボックス側は `max-h-full max-w-full` のままで挙動確認のみ
  * Details: .copilot-tracking/details/2026-05-21/ux-revamp-details.md (Lines 102-115)

### [ ] Implementation Phase 3: 本文エディタのプレビュー既定化 / コピー / 生 Markdown 表示

<!-- parallelizable: true -->

* [ ] Step 3.1: `slide-body-editor.tsx` の表示モードを `'preview' | 'markdown' | 'edit'` の 3 タブ式に再設計、初期値 `'preview'`
  * Details: .copilot-tracking/details/2026-05-21/ux-revamp-details.md (Lines 117-160)
* [ ] Step 3.2: Markdown コピー (`navigator.clipboard.writeText`) ボタン + コピー成功時 `Check` アイコンへ一時切替
  * Details: .copilot-tracking/details/2026-05-21/ux-revamp-details.md (Lines 162-185)
* [ ] Step 3.3: `'markdown'` モードで raw Markdown を `<pre><code>` 整形表示
  * Details: .copilot-tracking/details/2026-05-21/ux-revamp-details.md (Lines 187-205)
* [ ] Step 3.4: textarea の `rows`/`min-height` を拡大（rows=10 / min-height=180px）
  * Details: .copilot-tracking/details/2026-05-21/ux-revamp-details.md (Lines 207-220)

### [ ] Implementation Phase 4: コンテキスト容量拡大（プロンプトビルダー）

<!-- parallelizable: true -->

* [ ] Step 4.1: `image-prompt-builder.ts` の `MAX_BODY_CHARS` を `1600 → 5000`、`MAX_BULLETS` を `8 → 12` に拡張
  * Details: .copilot-tracking/details/2026-05-21/ux-revamp-details.md (Lines 222-240)
* [ ] Step 4.2: `notes` 切り詰めも `300 → 600` に拡張
  * Details: .copilot-tracking/details/2026-05-21/ux-revamp-details.md (Lines 242-252)

### [ ] Implementation Phase 5: スライドカード並べ替え (text 上 / image + notes 下)

<!-- parallelizable: false -->

* [ ] Step 5.1: `slide-panel.tsx` `SlideCard` の content 構造を `bullets → SlideBodyEditor → divider → SlideImageCard → SpeakerNotes` に再編
  * Details: .copilot-tracking/details/2026-05-21/ux-revamp-details.md (Lines 254-300)
* [ ] Step 5.2: 画像と speaker notes を一つのグループ枠で括る (border-top で視覚的に区分)
  * Details: .copilot-tracking/details/2026-05-21/ux-revamp-details.md (Lines 302-320)

### [ ] Implementation Phase 6: 画像生成ローディング表示の強化

<!-- parallelizable: false -->

* [ ] Step 6.1: `slide-panel.tsx` ヘッダー右側に進捗バッジ `<Loader2 spin /> 画像生成中 X/N` を追加（image モードかつ `anyImageGenerating || hasPending` の時）
  * Details: .copilot-tracking/details/2026-05-21/ux-revamp-details.md (Lines 322-355)
* [ ] Step 6.2: SlideCard 内、`imageStatus === 'generating'` 時にカード全体に薄いオーバーレイ + 大きめのスピナーを重ねる
  * Details: .copilot-tracking/details/2026-05-21/ux-revamp-details.md (Lines 357-385)

### [ ] Implementation Phase 7: 画像生成前のユーザー確認バナー

<!-- parallelizable: false -->

* [ ] Step 7.1: `slide-panel.tsx` に `<ImageGenConfirmBanner>` を新規追加、image モードかつ全スライド画像未生成 (`hasIdleOrErrorImage && !anyImageGenerating && !imagesReady`) のときに、デザイン方針サマリと「画像を生成する」「デザイン方針を編集」「画像生成をスキップ」CTA を出す
  * Details: .copilot-tracking/details/2026-05-21/ux-revamp-details.md (Lines 387-440)
* [ ] Step 7.2: バナーは右パネル最上部・デザイン方針セクションの直上に配置
  * Details: .copilot-tracking/details/2026-05-21/ux-revamp-details.md (Lines 442-455)
* [ ] Step 7.3: `skills/create-slide-story/SKILL.md` と `skills/pptx-from-image/SKILL.md` を更新し、`set_scenario` 後にすぐ `generate_all_images` を呼ばず、必ずユーザーへ確認質問を返すよう明文化
  * Details: .copilot-tracking/details/2026-05-21/ux-revamp-details.md (Lines 457-490)

### [ ] Implementation Phase 8: 新規ページ追加 + 編集可能フィールド

<!-- parallelizable: false -->

* [ ] Step 8.1: `chat-container.tsx` に `handleAddSlide()` を追加（空 SlideItem を末尾に追加、`number = max+1`、`layout='bullets'`、`accent` は cycle 継続）
  * Details: .copilot-tracking/details/2026-05-21/ux-revamp-details.md (Lines 492-525)
* [ ] Step 8.2: `slide-panel.tsx` ヘッダーに `+ ページ追加` ボタン (`Plus` アイコン) を追加し、`onAddSlide` プロパティ経由で呼ぶ
  * Details: .copilot-tracking/details/2026-05-21/ux-revamp-details.md (Lines 527-550)
* [ ] Step 8.3: `chat-container.tsx` に `handleUpdateSlideField(slideNumber, patch)` を追加し、title/keyMessage/bullets を更新可能にする
  * Details: .copilot-tracking/details/2026-05-21/ux-revamp-details.md (Lines 552-580)
* [ ] Step 8.4: SlideCard 内に inline 編集モード（ペンアイコンでトグル）を追加、title/keyMessage は `<input>`、bullets は行単位 `<input>` + 追加/削除
  * Details: .copilot-tracking/details/2026-05-21/ux-revamp-details.md (Lines 582-640)
* [ ] Step 8.5: `SlideImageCard` の隣 / 下に `imagePrompt` 編集アコーディオン（折り畳み既定）を追加。展開時は textarea + 「このプロンプトで再生成」CTA
  * Details: .copilot-tracking/details/2026-05-21/ux-revamp-details.md (Lines 642-690)

### [ ] Implementation Phase 9: SKILL ドキュメント整合

<!-- parallelizable: true -->

* [ ] Step 9.1: `skills/create-slide-story/SKILL.md` 既存「確認して PPTX 生成しますか？」文言を強化し、画像モード時は「画像を生成しますか？ デザイン方針はこれでよいですか？」を返すよう明文化
  * Details: .copilot-tracking/details/2026-05-21/ux-revamp-details.md (Lines 692-720)
* [ ] Step 9.2: `skills/pptx-from-image/SKILL.md` に「ユーザー承認なしに `generate_all_images` を呼ばない」節を追加
  * Details: .copilot-tracking/details/2026-05-21/ux-revamp-details.md (Lines 722-740)
* [ ] Step 9.3: AGENTS.md の主要ファイル表に `src/app/brand.ts` を追記、ヘッダー命名の変更点を反映
  * Details: .copilot-tracking/details/2026-05-21/ux-revamp-details.md (Lines 742-760)

### [ ] Implementation Phase N: 検証

<!-- parallelizable: false -->

* [ ] Step N.1: `pnpm lint` でリンタを通す
* [ ] Step N.2: `pnpm build` で Next.js ビルドを通す
* [ ] Step N.3: `pnpm dev` 起動 + 手動シナリオ確認
  * 命名・アイコン表示
  * 画像カードの上端クロップ解消
  * 本文プレビュー既定 / Markdown コピー / 生 Markdown 表示
  * カード並び替え
  * 画像生成中ローディング（バッジ + オーバーレイ）
  * 画像生成確認バナー → 承認後に生成
  * 新規ページ追加 → 手動入力 → 画像生成
  * imagePrompt 編集 → 再生成
* [ ] Step N.4: 軽微な lint/型エラーは直接修正、大きな問題は新規プランへ繰り上げ

## Planning Log

See `.copilot-tracking/plans/logs/2026-05-21/ux-revamp-log.md` for discrepancy tracking, implementation paths considered, and suggested follow-on work.

## Dependencies

* Node ≥ 24 / pnpm
* lucide-react (既存)
* react-markdown / remark-gfm (既存)
* `@github/copilot-sdk` (既存)

## Success Criteria

* 画像生成中、ヘッダーバッジ + カードオーバーレイで進行が明示される — Traces to: ユーザー要望 #1
* `→` リテラルが UI から消え、Lucide アイコンに統一される — Traces to: ユーザー要望 #2
* `metadata.title` と UI ヘッダーが新名 `Slide Studio` を表示する — Traces to: ユーザー要望 #3
* 本文エディタが初期プレビュー、Markdown コピー、生 Markdown 表示モードを備える — Traces to: ユーザー要望 #4
* 画像サムネに上端切れが発生しない — Traces to: ユーザー要望 #5
* スライドカードの並び順が text → image+notes になっている — Traces to: ユーザー要望 #6
* `image-prompt-builder` の上限が拡張され、エディタも大きなコンテキストを扱える — Traces to: ユーザー要望 #7
* 右パネルから新規ページ追加 → title/keyMessage/bullets/bodyMarkdown を手で入れて画像生成できる — Traces to: ユーザー要望 #8
* 画像モード切替後、ユーザー承認バナー + SKILL 指示の二重防壁で画像生成が暴発しない — Traces to: ユーザー要望 #9
* `imagePrompt` を UI から直接編集 → 再生成できる — Traces to: ユーザー要望 #10
* `pnpm build` と `pnpm lint` が成功する — Traces to: 品質ゲート
