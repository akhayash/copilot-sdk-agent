---
name: generate-pptx
description: スライドストーリーに基づき PptxGenJS コードを直接出力して PowerPoint（PPTX）ファイルを生成する。自由なレイアウト、カード、アイコン、図表等に対応。
allowed-tools:
  - web_search
---

# PPTX 生成スキル

PptxGenJS のコードを直接出力し、アプリがサーバーサイドで実行して PPTX を生成するスキルです。
JSON ではなく JavaScript コードを出力することで、カードレイアウト、マルチカラム、統計ハイライト等の自由なデザインが可能です。

## 出力フォーマット

` ```javascript ` コードブロックで PptxGenJS コードを出力すること。
コードは以下の変数がスコープに提供された状態で実行される：

- `pres` — PptxGenJS インスタンス（`layout: 'LAYOUT_WIDE'` 設定済み）
- `C` — カラー定数オブジェクト
- `F` — フォント定数（`F.JA`, `F.EN`）
- `SW`, `SH` — スライド幅(13.33)・高さ(7.5)
- `ML`, `MR` — 左右マージン(0.5)
- `CW` — コンテンツ幅(12.33)
- `HEADER_H` — ヘッダー帯高さ(0.45)

**重要**: コードでは `pres` にスライドを追加するだけでよい。`import`, `writeFile`, `new PptxGenJS()` は不要。

## スコープに提供される定数

### カラー定数 `C`

```javascript
C.BLUE       // '0078D4' — Microsoft Blue（プライマリ）
C.BLUE_DARK  // '005A9E'
C.BLUE_LIGHT // 'DEECF9' — 薄い青背景
C.BLUE_PALE  // 'EBF3FC' — 極薄い青背景
C.DARK       // '1B1B1B' — テキスト（メイン）
C.DARK_GRAY  // '2D2D2D' — テキスト（見出し）
C.MID_GRAY   // '505050' — テキスト（補足）
C.TEXT       // '3B3B3B' — テキスト（本文）
C.LIGHT_GRAY // 'F5F5F5' — カード背景
C.BORDER     // 'E1E1E1' — ボーダー
C.GREEN      // '107C10' — 成功・セキュリティ
C.GREEN_LIGHT// 'DFF6DD'
C.ORANGE     // 'D83B01' — 警告・重要
C.ORANGE_LIGHT // 'FFF4CE'
C.PURPLE     // '5C2D91' — セカンダリ
C.PURPLE_LIGHT // 'F0E6F6'
C.TEAL       // '008272'
C.WHITE      // 'FFFFFF'
```

### フォント定数 `F`

```javascript
F.JA  // 'Noto Sans JP' — 日本語テキスト
F.EN  // 'Segoe UI'     — 英数字・ヘッダー
```

## コードの書き方ルール

1. **必ず** ` ```javascript ` で囲む（アプリがコードブロックを検出してダウンロードボタンを表示する）
2. `pres.addSlide()` でスライドを追加し、`addText`, `addShape` 等で要素を配置
3. `import` 文は書かない（サーバーが提供する変数のみ使用）
4. `new PptxGenJS()` は書かない（`pres` が既に提供されている）
5. `pres.writeFile()` は書かない（サーバーが自動で出力する）
6. PptxGenJS のカラー値は `#` なしの 6桁 HEX で指定する

## デザインガイドライン

## Design-led generation rules

- `set_scenario` で承認された **story と designBrief を最優先の入力**として扱う
- 各スライドの `layout` / `icon` は **固定命令ではなく creative hint** とみなす
- 全体のリズム、余白、視線誘導、情報階層が改善されるなら、レイアウトを積極的に再解釈してよい
- 連続するスライドで同じ構図が続く場合は、意図的にメリハリをつける
- ユーザーが承認したストーリーの主張は維持しつつ、見せ方はより大胆に設計してよい
- `designBrief.layoutApproach` が `design-led` の場合、ストーリーを壊さない範囲で最も表現力の高い構図を選ぶ
- `designBrief.layoutApproach` が `structured` の場合、scenario の layout を比較的強く尊重する

### アイコンの使用（重要）

`public/icons/` に 64x64 PNG アイコンが用意されている。**積極的に使用すること。**

```javascript
// アイコンの使い方
slide.addImage({
  path: 'public/icons/brain.png',
  x: 0.5, y: 1.0, w: 0.5, h: 0.5,
});
```

利用可能アイコン: `arrow-trending-up`, `brain`, `building`, `calendar`, `chart`, `checkmark-circle`, `cloud`, `code`, `data-trending`, `document`, `globe`, `lightbulb`, `link`, `lock-closed`, `money`, `people-team`, `rocket`, `search`, `settings`, `shield`, `sparkle`, `star`, `target`, `warning`

**アイコン使用ルール:**
- カードの左上にアイコンを配置してビジュアルアクセントにする
- タイトルスライドやセクション区切りでアイコンを大きめに使う
- 箇条書きの先頭にアイコンを使ってリッチな印象にする
- 単調な箇条書きスライドを避け、アイコン付きカードレイアウトを優先する

### McKinsey式レイアウト原則

1. **スライドタイトル = 主張**: シナリオの `keyMessage` をスライドタイトルとして使う
2. **レイアウト多様性**: 3枚連続で同じレイアウトを使わない
3. **データ重視**: 数値がある場合は `stats` レイアウト（drawStat）で大きく見せる
4. **比較は並列**: Before/After や選択肢は `cards` レイアウトで横並び
5. **1スライド1メッセージ**: 詰め込みすぎない

### シナリオとの連動

`set_scenario` ツールで事前にシナリオが設定されている場合:
- シナリオの `title`, `keyMessage`, `layout`, `icon` を参照してスライドを生成する
- `keyMessage` をスライドのメインタイトル（大きな文字）として使用する
- `layout` はそのまま適用してもよいが、designBrief や全体の流れに合わせて再解釈してよい
- `icon` で指定されたアイコンは優先候補としつつ、不要なら無理に使わなくてもよい

### フォントサイズ

| 用途               | サイズ  | 太さ    |
| ------------------ | ------- | ------- |
| スライドタイトル   | 28-32pt | Bold    |
| セクションタイトル | 36-44pt | Bold    |
| 本文               | 16-20pt | Regular |
| 箇条書き           | 16-18pt | Regular |
| カード内テキスト   | 14-16pt | Regular |
| カードタイトル     | 15-17pt | Bold    |
| 統計数値           | 32-48pt | Bold    |
| キャプション       | 11-12pt | Regular |
| ヘッダー帯         | 9-10pt  | Regular |
| フッター           | 8pt     | Regular |

### Slide Master パターン

#### CONTENT（コンテンツスライド）

```javascript
pres.defineSlideMaster({
  title: 'CONTENT',
  background: { color: C.WHITE },
  objects: [
    { rect: { x: 0, y: 0, w: '100%', h: HEADER_H, fill: { color: C.BLUE } } },
    { rect: { x: 0, y: 0, w: 0.06, h: HEADER_H, fill: { color: C.BLUE_DARK } } },
    { text: {
        text: 'プレゼンタイトル',
        options: { x: 0.3, y: 0.08, w: 11, h: 0.3, fontSize: 9, fontFace: F.EN, color: C.WHITE }
    }},
    { rect: { x: ML, y: SH - 0.35, w: CW, h: 0.005, fill: { color: C.BORDER } } },
  ],
  slideNumber: { x: SW - 1.2, y: SH - 0.33, w: 0.8, h: 0.28, fontSize: 7.5, fontFace: F.EN, color: C.MID_GRAY, align: 'right' },
});
```

#### TITLE（タイトルスライド）

```javascript
pres.defineSlideMaster({
  title: 'TITLE',
  background: { color: C.BLUE },
  objects: [],
});
```

#### SECTION（セクション区切り）

```javascript
pres.defineSlideMaster({
  title: 'SECTION',
  background: { color: C.DARK },
  objects: [
    { rect: { x: 0, y: 0, w: 0.1, h: '100%', fill: { color: C.BLUE } } },
    { rect: { x: 1.0, y: SH - 0.7, w: 5, h: 0.04, fill: { color: C.BLUE } } },
  ],
});
```

### レイアウトパターン

#### スライドタイトル + アンダーバー

```javascript
function addSlideTitle(slide, title, opts = {}) {
  const { y = 0.6, fontSize = 26, color = C.DARK } = opts;
  slide.addText(title, {
    x: ML, y, w: CW, h: 0.6,
    fontSize, fontFace: F.JA, color, bold: true, valign: 'bottom',
  });
  slide.addShape(pres.ShapeType.rect, {
    x: ML, y: y + 0.62, w: 1.4, h: 0.04, fill: { color: C.BLUE },
  });
}
```

#### カード描画

```javascript
function drawCard(slide, x, y, w, h, opts = {}) {
  const { bg = C.LIGHT_GRAY, accentTop = null, title, body, bodyBullet = false } = opts;
  slide.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, fill: { color: bg }, rectRadius: 0.08,
    shadow: { type: 'outer', blur: 4, offset: 2, color: '000000', opacity: 0.1 },
  });
  if (accentTop) {
    slide.addShape(pres.ShapeType.rect, {
      x: x + 0.12, y: y + 0.1, w: w - 0.24, h: 0.045, fill: { color: accentTop },
    });
  }
  let textY = y + (accentTop ? 0.22 : 0.15);
  if (title) {
    slide.addText(title, {
      x: x + 0.2, y: textY, w: w - 0.4, h: 0.4,
      fontSize: 15, fontFace: F.JA, color: C.DARK, bold: true, valign: 'middle',
    });
    textY += 0.42;
  }
  if (body) {
    const items = Array.isArray(body) ? body : [body];
    const textArr = items.map(t => ({
      text: t,
      options: {
        fontSize: 13, fontFace: F.JA, color: C.TEXT, breakLine: true,
        bullet: bodyBullet ? { type: 'bullet', color: C.MID_GRAY } : false,
        lineSpacingMultiple: 1.4,
      },
    }));
    slide.addText(textArr, {
      x: x + 0.2, y: textY, w: w - 0.4, h: h - (textY - y) - 0.15, valign: 'top',
    });
  }
}
```

#### 統計ハイライト

```javascript
function drawStat(slide, x, y, w, h, { value, label, color = C.BLUE }) {
  slide.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, fill: { color: C.WHITE }, line: { color, width: 2 }, rectRadius: 0.08,
  });
  slide.addText(value, {
    x, y: y + 0.08, w, h: h * 0.55,
    fontSize: 28, fontFace: F.EN, color, bold: true, align: 'center', valign: 'middle',
  });
  slide.addText(label, {
    x: x + 0.1, y: y + h * 0.55, w: w - 0.2, h: h * 0.4,
    fontSize: 10, fontFace: F.JA, color: C.MID_GRAY, align: 'center', valign: 'top',
  });
}
```

#### 箇条書き

```javascript
function addBullets(slide, x, y, w, h, bullets, opts = {}) {
  const { fontSize = 15, color = C.TEXT, bulletColor = C.BLUE } = opts;
  const items = bullets.map(t => ({
    text: t,
    options: {
      fontSize, fontFace: F.JA, color,
      bullet: { type: 'bullet', color: bulletColor },
      breakLine: true, lineSpacingMultiple: 1.4,
    },
  }));
  slide.addText(items, { x, y, w, h, valign: 'top', paraSpaceAfter: 6 });
}
```

## コンテンツルール

- **絵文字を使用しない**: `💡` `🔄` `✅` 等は Noto Sans JP で表示崩れの原因になる
- **矢印は可**: テキストの `→` `↑` は使用可
- **チェックマーク**: 絵文字ではなく `✔`（U+2714）を使用
- **行間**: 日本語テキストは `lineSpacingMultiple: 1.5` を推奨
- **最小フォント**: 8pt 未満は使用しない
- ユーザーの言語に合わせてスライドを作成する
- 専門用語は原語を併記（例:「検索拡張生成（RAG）」）

## 品質チェックリスト

- [ ] `import` 文を書いていない
- [ ] `new PptxGenJS()` を書いていない
- [ ] `writeFile` を書いていない
- [ ] カラーは `#` なしの 6桁 HEX
- [ ] 絵文字を使用していない
- [ ] フォントは `F.JA` または `F.EN` を使用
- [ ] タイトルスライドとまとめスライドが含まれている
- [ ] 各スライドにノートが設定されている（`slide.addNotes()`）

## ワークフロー

1. ユーザーのリクエストが曖昧な場合、トピック・対象者・目的を確認する
2. Web検索ツールが利用可能な場合、最新情報を収集する
3. Slide Master を定義する（CONTENT, TITLE, SECTION）
4. ヘルパー関数を定義する（addSlideTitle, drawCard, addBullets 等）
5. スライドを順番に追加する
6. 各スライドに `slide.addNotes()` でスピーカーノートを追加する
7. コードの前に構成の簡単な説明を添える
