<!-- markdownlint-disable-file -->
# Research: UX Revamp (画像生成ローディング / アイコン整理 / 命名 / 本文プレビュー / レイアウト並べ替え / 新規ページ追加 / 画像生成確認フロー)

## スコープ

ユーザー要望（2026-05-21 のチャット要旨）:

1. 画像生成中、待っていることを示すローディングが欲しい。
2. Lucide アイコンで `→` を置き換えてほしい。メニュー（アイコン）も今使っている UI アイコン群に揃える。
3. プロダクト名「Copilot SDK Agent」がわかりにくい。良い名前に変えたい。
4. 本文はプレビューで出ればよい。Markdown をコピーできて Markdown が見れる機能があればよい。
5. 画像の上端が見切れている。
6. 画像と本文の位置を入れ替えたい。テキストを上、画像を下、スピーカーノートも画像に寄せる。
7. 生成されているテキストは良い感じ。コンテキストをある程度の大きさで入れないと良い資料が出ない。
8. 右画面で新規ページの追加 → 手でテキスト入力 → 画像生成、というシナリオが欲しい。
9. いま画像生成にいきなり行っているので、ストーリーが確定したら「生成していいか」聞いてほしい。そのときデザイン方針も確認したい。
10. 画像生成のインプットは本文だけか？ 他は編集する必要ないか？

## 確認済みコードベース所見

### ブランディング / 表示名

* `src/app/layout.tsx` (Lines 17-20): `<title>Copilot SDK Agent</title>` / description "Create presentations with AI"。
* `src/app/components/chat/chat-container.tsx` (Lines 405-410): ヘッダーに `Copilot SDK Agent` を直書き、副題 `AI Presentation Generator`。
* `package.json` (Line 2): `"name": "copilot-sdk-agent"` — リポジトリ/インフラ (Bicep / Workflows) と連動するため変更しない。表示名のみ変更する。

### アイコン / `→` 利用箇所

* lucide-react は既に全コンポーネントで利用済（`Star`, `Send`, `Paperclip`, `PanelRightOpen` 等）。
* リテラル `→` の利用箇所:
  - `src/app/components/slides/mode-toggle.tsx` (Line 81): ラベル `画像 → PPTX`。
  - `src/app/components/slides/mode-toggle.tsx` (Line 4): JSDoc 内 `markdown → pptxgenjs`。
* 「メニューがない」と感じる箇所候補: ヘッダー右端のパネル開閉ボタンのみで、それ以外の主要 CTA (PPTX生成 / 全画像生成) はパネル内。CTA は既に `Sparkles`, `ImagePlus`, `Download`, `Check` 等の Lucide アイコンを使用済 → アイコン統一の不足は限定的。

### 画像カード / クロップ

* `src/app/components/slides/slide-image-card.tsx` (Lines 99-106): `<img class="h-full w-full object-cover" />`。
  - aspect は `aspect-video` (16:9) だが画像は gpt-image-2 の `1536x1024` (3:2)。 `object-cover` で縦横どちらかが必ずクロップされ「上端が見切れる」現象に直結。
* 修正案: `object-contain` + 背景色を中性 (`var(--surface-secondary)`) にして余白を許容。あるいはカードの aspect を `aspect-[3/2]` に変更してクロップを回避。

### スライドカード内の現在のレイアウト順

`src/app/components/slides/slide-panel.tsx` (Lines 410-490 周辺) の `SlideCard`:

```
1. header (番号 / title / icon / layout / keyMessage)
2. bullets
3. [画像モード] SlideImageCard
4. [画像モード] SlideBodyEditor
5. SpeakerNotes
```

要望のレイアウト:

```
1. header (同上)
2. bullets
3. SlideBodyEditor（プレビュー既定 / Markdown コピー / Markdown 表示）
─────────────  separator
4. SlideImageCard
5. SpeakerNotes（画像と同じグループ）
```

### 本文エディタの現状

* `src/app/components/slides/slide-body-editor.tsx`:
  - 既定: 編集モード (`showPreview = false`)。
  - プレビュー切替: あり (`Eye/Pencil`)。
  - 「Markdown コピー」機能なし。
  - 「Markdown raw 表示」モード（プレビューではなく生 Markdown を整形表示）なし — プレビュー = レンダリング、コードビューが無い。
  - rows=5 / min-height=90px → 大きなコンテキストの編集には窮屈。

要望解釈:

* 「本文はプレビューで出ればよい」= 既定モードを **プレビュー** にする。
* 「コピーして Markdown が取れる」= **Markdown コピー** ボタン。
* 「Markdown が見れる機能」= **生 Markdown を表示** するモード（コードビュー）。
* 編集は副次（タブ or ペンアイコンで開く）。

### 画像生成のローディング表現

* 既存:
  - `slide-image-card.tsx` (Lines 76-81): `Loader2` スピナー + 「生成中...」テキスト。
  - `slide-panel.tsx` 「全画像生成」ボタン (Lines 264-272): 文言だけ「生成中...」に変わる。
  - パネル全体には進捗バッジ無し。

要望: 「画像生成を待っている」ことを明示的に示すローディング。具体策:

* パネルヘッダーに進捗バッジ `画像生成中 X/N`（lucide `Loader2` 回転 + 数値）。
* スライドカード全体に薄いオーバーレイ + スピナー。
* スケルトンよりも「進行が分かる」プログレス表示。

### 画像生成の自動起動とユーザー確認

* `skills/create-slide-story/SKILL.md`: `set_scenario` ツールを呼び、「確認して PPTX 生成しますか？」と返すよう指示。
* `skills/pptx-from-image/SKILL.md`: モード切替後に `generate_all_images` を呼ぶフローがある。
* `src/app/components/slides/slide-panel.tsx` (Lines 264-272): UI 上は **手動** で `onGenerateAllImages` を押す必要があるため、UI から自動起動はしない。
* ただしユーザー体感では「画像モードへ切り替えると即座に画像が出始める」と感じている → SKILL/AI 側が `generate_all_images` を即時呼んでいる可能性が高い。
* 要望: ストーリー確定後にチャット/UI 上で「画像を生成しますか？ デザイン方針はこれで良いですか？」とユーザーに確認する。
* 実装ポイント:
  1. SKILL 文言修正 — set_scenario 後にすぐ画像ツールを呼ばず、ユーザー承認を待つ。
  2. UI 側 — シナリオ確定 (`phase==='story'`) かつ image モードで画像が一枚も生成されていないときに、**確認バナー（デザイン方針サマリ + 画像生成 CTA）** を表示。
  3. 「デザイン方針」セクションは既にあるが、確認バナーから編集導線（任意）を出せると尚良い。

### 画像生成のインプット

* `src/application/image-prompt-builder.ts`:
  - インプット: `slide.title`, `slide.keyMessage`, `slide.layout`, `slide.bullets`, `slide.bodyMarkdown`, `slide.notes`, `brief.*` (objective/audience/tone/visualStyle/colorMood/density/directions)。
  - 上限: `MAX_BODY_CHARS = 1600`、`MAX_BULLETS = 8` → 大きなコンテキストを入れたい要望と相反。
* UI で編集可能なのは現在 **bodyMarkdown のみ**（`SlideBodyEditor`）。`title`, `keyMessage`, `bullets`, `notes`, `imagePrompt` は UI から直接編集できない。
* 「画像生成のインプットは本文だけか？」への回答:
  - 実装上は bodyMarkdown 以外（title/keyMessage/bullets/notes/designBrief）も全てプロンプトに混ぜている。
  - ただし **ユーザーが UI から触れるのは bodyMarkdown だけ**。
  - 要望に応える方向 = **imagePrompt 自体を編集可能にする**（最終的な生成プロンプトをユーザーが直接調整できる）、加えて **title/keyMessage の編集 UI** も任意で提供。
  - 新規ページ追加のためにも title/keyMessage/bullets の編集 UI は必要。

### 新規ページ追加

* `slideWork.slides` は `ChatContainer` 内 `setSlideWork` で管理 (`src/app/components/chat/chat-container.tsx`)。
* 追加用ハンドラー無し。AI 経由 (`set_scenario` / `update_slide`) でのみ slide が追加される。
* 必要な追加:
  - `handleAddSlide()` — 空の SlideItem を末尾に追加 (`number = max+1`, layout='bullets', 空 bullets, 空 bodyMarkdown, imageStatus='idle')。
  - SlidePanel ヘッダーに `+ ページ追加` ボタン (`Plus` アイコン)。
  - 新規ページは title/keyMessage/bullets を inline 編集できる必要 → 既存 `SlideCard` の表示を **編集可能フィールド** にスイッチする。

## 主要参考ファイル一覧

* `AGENTS.md` — プロジェクト構成と命名規約。
* `src/app/layout.tsx` — メタタイトル。
* `src/app/components/chat/chat-container.tsx` — ワークスペース state / 画像ハンドラー / ヘッダー。
* `src/app/components/chat/message-input.tsx` — 入力欄（既に Lucide `Send`/`Paperclip` 使用）。
* `src/app/components/chat/message-list.tsx` — 空状態のプロモーションカード。
* `src/app/components/slides/slide-panel.tsx` — 右パネル本体、SlideCard、PPTX ダウンロード CTA。
* `src/app/components/slides/slide-image-card.tsx` — 画像サムネ + ライトボックス。
* `src/app/components/slides/slide-body-editor.tsx` — bodyMarkdown 編集。
* `src/app/components/slides/mode-toggle.tsx` — `→` リテラルあり。
* `src/application/image-prompt-builder.ts` — 画像プロンプト生成、上限値。
* `src/infrastructure/tools/image-tool.ts` — `generate_slide_image` / `generate_all_images` ツール定義。
* `skills/create-slide-story/SKILL.md` — シナリオ作成フロー。
* `skills/pptx-from-image/SKILL.md` — 画像→PPTX モード文言。

## 既知の制約 / 注意

* `package.json` の `name` は GitHub Actions / Bicep / Container Apps と紐づくため変更しない。
* `app/layout.tsx` の `metadata.title` と UI ヘッダーの表示名のみを置換する。
* 画像クロップ修正は aspect 比そのものを変えると右パネル幅・ライトボックス・bbox 抽出にも影響するため `object-contain` + 背景色で吸収するのが安全。
* 新規ページ追加で title/keyMessage を編集可能にすると、AI 生成スライドにも同じ編集 UI が露出する → ロックフラグ無しでも実装可能 (toSlideItem 側で既存値を保持しているため)。
* 画像生成確認フローは SKILL とコード両方の整合が必要。SKILL だけ直しても AI が違反したら UI 側でも止められる構造が望ましい。

## 未確定（ユーザー確認が必要な事項）

1. **新しい表示名**（候補例: `Slide Studio`, `Deck Composer`, `Pitch Forge`, `スライドアトリエ`, `Story to Slides`, `AI Slide Maker`）。
2. **画像生成確認 UX**: チャットへ確認質問を返す vs 右パネル上部に確認バナー vs 両方。
3. **コンテキスト容量の目安**: 既定 1600 → どこまで拡張するか（例 4000 / 6000 / 8000 文字）。
