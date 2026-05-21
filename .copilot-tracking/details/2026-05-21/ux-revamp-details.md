<!-- markdownlint-disable-file -->
# Implementation Details: UX Revamp

## Context Reference

Sources: `.copilot-tracking/research/2026-05-21/ux-revamp-research.md` / ユーザーチャット (2026-05-21)

## Implementation Phase 1: ブランディング & アイコン統一

<!-- parallelizable: true -->

### Step 1.1: 新規 `src/app/brand.ts`

新規ファイル `src/app/brand.ts` を作成し、表示名を一箇所に集約する。

Files:
* src/app/brand.ts (new) - APP_NAME / APP_TAGLINE 定数

内容例:

```ts
export const APP_NAME = 'Slide Studio';
export const APP_TAGLINE = 'AI Presentation Workspace';
```

Success criteria:
* import 経路が `@/app/brand` で解決できる
* 後段ステップから参照可能

Dependencies:
* なし

### Step 1.2: `src/app/layout.tsx` のタイトル置換

`metadata.title` を `APP_NAME`、`metadata.description` を `APP_TAGLINE` を含む文に置換。

Files:
* src/app/layout.tsx - Lines 17-20 を APP_NAME 参照に変更

Success criteria:
* ブラウザタブが新名で表示される

### Step 1.3: `chat-container.tsx` ヘッダー置換

`Lines 405-410` の `<h1>Copilot SDK Agent</h1>` / `<p>AI Presentation Generator</p>` を `{APP_NAME}` / `{APP_TAGLINE}` に置換。

Files:
* src/app/components/chat/chat-container.tsx - ヘッダー部のみ

Success criteria:
* ヘッダーが新名で表示される
* `package.json` `name` は変更しない

### Step 1.4: `mode-toggle.tsx` の `→` 置換

ラベル `画像 → PPTX` を `<span>画像</span><ArrowRight size={12} /><span>PPTX</span>` 構成に変更。
JSDoc 内のコメント `markdown → pptxgenjs` は `markdown to pptxgenjs` へ。

Files:
* src/app/components/slides/mode-toggle.tsx - Lines 4, 81

Success criteria:
* UI 上の文字 `→` が消え Lucide アイコンに置き換わる
* 既存のレイアウト幅を大きく崩さない (gap-1.5 を維持)

Dependencies:
* lucide-react から `ArrowRight` を import

## Implementation Phase 2: 画像カードのクロップ修正

<!-- parallelizable: true -->

### Step 2.1: `<img>` を `object-contain` に

`src/app/components/slides/slide-image-card.tsx` Lines 99-106:

* `className="h-full w-full object-cover"` → `className="h-full w-full object-contain"`
* 親 `div` (Lines 67-71) の背景 `var(--surface-secondary)` を維持（contain 時の余白に出る）

Files:
* src/app/components/slides/slide-image-card.tsx

Success criteria:
* gpt-image-2 が返す 3:2 画像で上端が見切れない
* aspect-video コンテナ内で左右に薄い余白が出る（許容）

### Step 2.2: ライトボックスは挙動確認のみ

`max-h-full max-w-full` は既に contain 同等のため変更不要。

Files:
* src/app/components/slides/slide-image-card.tsx (確認のみ)

Success criteria:
* ライトボックスで画像全体が見える

## Implementation Phase 3: 本文エディタの再設計

<!-- parallelizable: true -->

### Step 3.1: 3 モード切替

`SlideBodyEditor` を `view: 'preview' | 'markdown' | 'edit'` の state に再構成。初期値 `'preview'`。

ヘッダーの右上にセグメントコントロール:
* `Eye` プレビュー
* `Code2` Markdown
* `Pencil` 編集

Files:
* src/app/components/slides/slide-body-editor.tsx

Success criteria:
* 初期表示はプレビュー
* 3 モード切替が動作

### Step 3.2: Markdown コピー

ヘッダーに `Copy` (lucide) ボタンを追加。クリックで `navigator.clipboard.writeText(draft)`、成功時 2 秒間アイコンを `Check` に切替。

Files:
* src/app/components/slides/slide-body-editor.tsx

Success criteria:
* クリップボードへ Markdown が貼られる
* フィードバックアイコンが動く

### Step 3.3: 生 Markdown 表示

`view === 'markdown'` のとき:

```tsx
<pre className="overflow-auto rounded-md border px-2.5 py-2 text-[11px] leading-relaxed"
     style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
  <code>{draft || '本文がまだありません'}</code>
</pre>
```

Success criteria:
* 生 Markdown が等幅で表示される

### Step 3.4: textarea 拡張

`rows={5}` → `rows={10}`、`minHeight: '90px'` → `'180px'`、`resize-y` 継続。

Success criteria:
* 入力域が大きくなり、長文を扱いやすい

## Implementation Phase 4: コンテキスト容量拡大

<!-- parallelizable: true -->

### Step 4.1: 上限拡張

`src/application/image-prompt-builder.ts`:

* `MAX_BODY_CHARS = 1600` → `5000`
* `MAX_BULLETS = 8` → `12`

Success criteria:
* ビルドが通る
* 既存テストへの影響なし（テスト無いため build と lint で確認）

### Step 4.2: notes 切り詰め拡張

同ファイル `trimTo(slide.notes, 300)` → `trimTo(slide.notes, 600)`。

Success criteria:
* notes の切り詰めが緩む

## Implementation Phase 5: スライドカード並べ替え

<!-- parallelizable: false -->

### Step 5.1: 構造再編

`src/app/components/slides/slide-panel.tsx` `SlideCard` を以下の順に再構成:

```
<header /> (番号 + title + メタ)
<contentBlock>
  <bullets />
  {showImageMode && <SlideBodyEditor />}        ← 上に移動
</contentBlock>
{showImageMode && (
  <visualBlock className="border-t">
    <SlideImageCard />                            ← 下に移動
    <SpeakerNotes />                              ← 画像と同グループ
  </visualBlock>
)}
{!showImageMode && <SpeakerNotes />}              ← code モードはそのまま
```

Files:
* src/app/components/slides/slide-panel.tsx

Success criteria:
* image モードで text 上 / image+notes 下
* code モードは現状の振る舞いを維持

### Step 5.2: 視覚的グルーピング

`visualBlock` を `border-top` + 軽い背景色 (`var(--surface)` よりわずかに濃いめ) で分離。

Success criteria:
* 画像とノートが「同じ枠」に見える

## Implementation Phase 6: 画像生成ローディング強化

<!-- parallelizable: false -->

### Step 6.1: ヘッダー進捗バッジ

`src/app/components/slides/slide-panel.tsx` パネルヘッダー右側 CTA 群の左に:

```tsx
{mode === 'image-then-pptx' && (anyImageGenerating || hasPendingImages) && (
  <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
       style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
    <Loader2 size={11} className="animate-spin" />
    画像生成中 {readyCount}/{slides.length}
  </div>
)}
```

`readyCount`, `hasPendingImages` は既存 useMemo を流用 / 追加。

Success criteria:
* 生成中はバッジが回る
* 全画像 ready で消える

### Step 6.2: カードオーバーレイ

`SlideCard` の `isGenerating === true` 時にカードへ `relative` を付与し、絶対配置のオーバーレイを重ねる:

```tsx
{isGenerating && (
  <div className="absolute inset-0 flex items-center justify-center rounded-lg backdrop-blur-[1px]"
       style={{ background: 'rgba(255,255,255,0.55)' }}>
    <div className="flex flex-col items-center gap-1.5">
      <Loader2 size={22} className="animate-spin" style={{ color: 'var(--accent)' }} />
      <span className="text-[11px] font-medium" style={{ color: 'var(--accent)' }}>画像を生成中...</span>
    </div>
  </div>
)}
```

Success criteria:
* 生成中はカードが半透明 + スピナー
* aria-busy="true" を付与

## Implementation Phase 7: 画像生成前ユーザー確認

<!-- parallelizable: false -->

### Step 7.1: 新規 `<ImageGenConfirmBanner>`

`src/app/components/slides/slide-panel.tsx` 内（小コンポーネントとして同ファイル内に閉じる）に追加:

* 条件: `mode === 'image-then-pptx' && slides.length > 0 && hasIdleOrErrorImage && !anyImageGenerating && !imagesReady && designBrief !== null`
* 配置: パネルヘッダー直下、designBrief セクションの上
* 内容:
  - 見出し「画像生成を開始しますか？」
  - 短いサマリ（`tone` / `visualStyle` / `colorMood`）
  - CTA: `全画像を生成` (Primary, `Sparkles`) / `デザイン方針を見直す` (Secondary, designBrief セクションへスクロール) / `画像生成をスキップ` (Tertiary, banner を非表示にする local state)

Files:
* src/app/components/slides/slide-panel.tsx

Success criteria:
* 画像未生成時に表示
* 「全画像を生成」で `onGenerateAllImages` を呼ぶ

### Step 7.2: 配置

designBrief セクションより上、シナリオリストより上。

Success criteria:
* 視覚的に最初に目に入る位置

### Step 7.3: SKILL 文言更新

`skills/create-slide-story/SKILL.md`:

* 「ツール呼び出し後、チャットには…」の節を、画像モード時に「画像を生成しますか？ デザイン方針はこれで良いですか？」を返すように修正。
* 「ユーザー承認なしに画像生成ツール (`generate_slide_image` / `generate_all_images`) を呼ばない」と明記。

`skills/pptx-from-image/SKILL.md`:

* 冒頭または「使い方」節に「ユーザーが明示的に画像生成を依頼するまで `generate_all_images` を呼んではならない」と追加。

Files:
* skills/create-slide-story/SKILL.md
* skills/pptx-from-image/SKILL.md

Success criteria:
* SKILL を読んだ AI が自発的な画像生成を抑止する文脈になる

## Implementation Phase 8: 新規ページ追加 + 編集可能フィールド

<!-- parallelizable: false -->

### Step 8.1: `handleAddSlide()`

`src/app/components/chat/chat-container.tsx`:

```ts
const handleAddSlide = useCallback(() => {
  setSlideWork((prev) => {
    const nextNumber = (prev.slides[prev.slides.length - 1]?.number ?? 0) + 1;
    const newSlide: SlideItem = {
      id: `slide-${nextNumber}-${crypto.randomUUID().slice(0, 6)}`,
      number: nextNumber,
      title: '新しいスライド',
      keyMessage: '',
      layout: 'bullets',
      bullets: [],
      notes: '',
      icon: null,
      code: null,
      accent: ACCENT_CYCLE[(nextNumber - 1) % ACCENT_CYCLE.length],
      bodyMarkdown: '',
      imageUrl: null,
      imagePrompt: null,
      imageStatus: 'idle',
    };
    return { ...prev, phase: prev.phase === 'empty' ? 'story' : prev.phase, slides: [...prev.slides, newSlide] };
  });
  setMobileView('scenario');
}, []);
```

Files:
* src/app/components/chat/chat-container.tsx

Success criteria:
* 末尾に新規スライドが追加され、scroll で見える

### Step 8.2: ヘッダーボタン

`src/app/components/slides/slide-panel.tsx` ヘッダー右側に:

```tsx
{onAddSlide && (
  <button onClick={onAddSlide}
          className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          title="新しいスライドを追加">
    <Plus size={12} /> ページ追加
  </button>
)}
```

`SlidePanelProps` に `onAddSlide?: () => void` を追加し、`ChatContainer` から渡す。

Files:
* src/app/components/slides/slide-panel.tsx
* src/app/components/chat/chat-container.tsx

Success criteria:
* ボタンクリックで Step 8.1 が走る

### Step 8.3: `handleUpdateSlideField()`

`src/app/components/chat/chat-container.tsx`:

```ts
const handleUpdateSlideField = useCallback(
  (slideNumber: number, patch: Partial<Pick<SlideItem, 'title' | 'keyMessage' | 'bullets' | 'imagePrompt'>>) => {
    setSlideWork((prev) => ({
      ...prev,
      slides: prev.slides.map((s) => (s.number === slideNumber ? { ...s, ...patch } : s)),
    }));
  },
  [],
);
```

`SlidePanel` 経由で `SlideCard` まで prop drilling。

Files:
* src/app/components/chat/chat-container.tsx
* src/app/components/slides/slide-panel.tsx

Success criteria:
* 任意フィールドを差分更新できる

### Step 8.4: SlideCard inline 編集

`SlideCard` に `editMode: boolean` state を追加。ヘッダー右側に `Pencil` トグルボタン。
編集時:

* title → `<input>` (font-bold)
* keyMessage → `<input>` (font-medium, accent color placeholder `💡 ...`)
* bullets → 各行 `<input>` + `+` 追加 + `×` 削除

`onBlur` でコミット。

Files:
* src/app/components/slides/slide-panel.tsx (SlideCard)

Success criteria:
* 任意のスライドで inline 編集できる

### Step 8.5: imagePrompt 編集

`SlideImageCard` の直下に折り畳みアコーディオン（既定折り畳み）:

* ヘッダー「画像プロンプト編集 (上級)」 + `ChevronDown` / `ChevronUp`
* 展開時: textarea (rows=8) + 「このプロンプトで再生成」CTA
* 空のときは `buildImagePrompt(slide, brief)` をプレースホルダー表示

`SlideImageCard` プロパティに `onUpdatePrompt?: (n: number, prompt: string | null) => void` を追加。
`ChatContainer` で `handleUpdateSlideField` を再利用して `imagePrompt` を更新。

Files:
* src/app/components/slides/slide-image-card.tsx
* src/app/components/slides/slide-panel.tsx
* src/app/components/chat/chat-container.tsx

Success criteria:
* imagePrompt を直接編集 → 再生成できる
* 編集をクリア (`null`) すると次回は `buildImagePrompt` から再計算される

## Implementation Phase 9: SKILL ドキュメント整合

<!-- parallelizable: true -->

### Step 9.1: create-slide-story SKILL

Files:
* skills/create-slide-story/SKILL.md

「重要: 出力方法」節を以下のように追記:

* set_scenario 呼び出し直後の応答テンプレートを 2 パターン用意
  - code モード: 「シナリオを作成しました。PPTX を生成しますか？」
  - image モード (PD-02 Option C): 「シナリオとデザイン方針を作成しました。
    - **デザイン方針**: tone=◯◯ / visualStyle=◯◯ / colorMood=◯◯（実値を short summary で貼る）
    - これで良ければ右パネル上部の『全画像を生成』ボタンを押してください。修正点があればチャットで教えてください。」
* 「ユーザーから明示的な承認 (UI ボタン押下 or 明示的なチャット指示) を得るまで `generate_slide_image` / `generate_all_images` を呼ばない」を明記

Success criteria:
* SKILL を読んだ AI が確認質問を返す

### Step 9.2: pptx-from-image SKILL

Files:
* skills/pptx-from-image/SKILL.md

冒頭近くに「画像生成のトリガー」節を追加:

* 「画像生成ツールは、ユーザーが『画像を生成して』『進めて』『OK』など明示的に承認した後にのみ呼ぶこと」
* 「set_scenario / update_slide 直後に自動で画像ツールを呼んではならない」

Success criteria:
* 二重防壁としての文言が入る

### Step 9.3: AGENTS.md 更新

Files:
* AGENTS.md

* `src/app/brand.ts` を Key Files 表に追記
* ヘッダー命名の変更点（旧名→新名）を 1 行で言及

Success criteria:
* ファイル表が最新

## Implementation Phase N: Validation

<!-- parallelizable: false -->

### Step N.1: Lint

```pwsh
pnpm lint
```

### Step N.2: Build

```pwsh
pnpm build
```

### Step N.3: 手動確認シナリオ

1. `pnpm dev`
2. ヘッダー名・タブ名が新名であること
3. `画像 → PPTX` のラベルが `画像 [→アイコン] PPTX` になっていること
4. 画像モードに切替、シナリオ作成 → 確認バナーが出て、自動生成が走らないこと
5. 「全画像を生成」ボタン押下 → ヘッダーバッジ + 各カードオーバーレイ
6. 生成された画像の上端が見切れていないこと
7. SlideCard の並びが text → image+notes になっていること
8. SlideBodyEditor がプレビュー既定、Markdown コピーが動作、生 Markdown 表示モードがあること
9. 新規ページ追加ボタンで空スライド追加、inline 編集で title/keyMessage/bullets を入れる
10. imagePrompt 編集アコーディオンを開いて編集 → 再生成
11. code モードに戻して既存挙動が回帰していないこと

### Step N.4: 軽微修正 / ブロッキング報告

* `pnpm lint` / `pnpm build` の軽微エラーは直接修正
* レンダリング崩れ・型エラーで大規模な追加リサーチが必要なら新規プランへ繰り上げ

## Dependencies

* lucide-react から `ArrowRight`, `Plus`, `Copy`, `ChevronDown`, `ChevronUp` を追加 import
* それ以外は既存依存のみ

## Success Criteria

* Plan の Success Criteria 全項目を満たす
* `pnpm build` / `pnpm lint` が成功
* code モードでの既存挙動が回帰していない
