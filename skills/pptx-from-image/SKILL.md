---
name: pptx-from-image
description: gpt-image-2 が一発出力した完成済みの 16:9 スライド画像（日本語タイポグラフィを含む）を、そのまま pptxgenjs で 16:9 PPTX のスライドに full-bleed 配置するスキル。bbox 抽出やテキスト重畳は行わず、画像 == スライドとして扱う。
allowed-tools: []
---

# pptx-from-image スキル（one-shot mode）

gpt-image-2 が生成した **完成済みスライド画像** を、そのまま PPTX の 1 スライドとして配置する。
画像にはタイトル・本文・統計・ソースキャプションなどがすべて日本語タイポグラフィで描き込まれている前提。
PowerPoint 側でテキストを再構築せず、画像をスライド全面に貼って終わる。

## フィロソフィー

1. **画像 == スライド**: gpt-image-2 がレイアウト・タイポグラフィ・装飾を含めて 1 ショットで描き切る。
2. **オーバーレイ禁止**: タイトル帯・テキストボックス・ロゴ等を pptxgenjs 側で追加しない。
   画像の上に重ねると視覚的にも文字も衝突する。
3. **解像度依存にしない**: 画像は 16:9 PPTX の `0,0,10,5.625` (inch) に full-bleed で配置するだけ。
   gpt-image-2 の出力は `1536x1024` (3:2) を既定とし、cover で吸収する。
4. **スピーカーノート**: シナリオ側の `notes` があれば `slide.addNotes()` で添付し、
   発表者用ノートと検索性を担保する。
5. **シナリオ本文は briefing**: シナリオ panel の `bodyMarkdown` / `bullets` / `notes` は
   gpt-image-2 への **コンテキスト（調査結果）** として渡される。スライド上に literal に
   出す文字列ではなく、モデルがどの数字・フレーズ・構成を選ぶかの素材になる。

## 入力

`/api/skills/pptx` を `generationMode: 'image-then-pptx'` で呼ぶ：

```json
{
  "generationMode": "image-then-pptx",
  "title": "プレゼンタイトル",
  "imageIds": [
    { "slideNumber": 1, "imageId": "img-xxxx" },
    { "slideNumber": 2, "imageId": "img-yyyy" }
  ],
  "scenario": [
    { "number": 1, "title": "...", "notes": "...", ... }
  ]
}
```

- `imageIds[].imageId` は `/api/skills/image` で生成済み画像の cache key。
- `scenario` は **speaker notes 添付用** にのみ使う（オーバーレイには使わない）。

## 出力 PPTX 構造

各スライド：
```
slide = pres.addSlide()
slide.addImage({ data: 'data:image/png;base64,...', x: 0, y: 0, w: 10, h: 5.625 })
slide.addNotes(scenario.notes)  // optional
```

PPTX レイアウトはデフォルトの 10×5.625 inch（16:9）を使用。`LAYOUT_WIDE`（13.33×7.5）は使わない。

## エラー降格

- **画像欠落（cache miss）**: 該当スライドは白背景 + タイトル文字のプレースホルダ。レスポンスヘッダ `x-pptx-missing-images: 1,3` で通知。
- **全スライド欠落**: 410 Gone を返し、画像を再生成するよう促す。

## 品質ゲート（非同期）

PPTX 生成後に LibreOffice で各スライドを PNG レンダリングし、原画像と比較して pass/warn/fail バッジを返す。
ただし one-shot mode では原画像と PPTX のレンダ結果がほぼ同一になるはずなので、warn/fail はファイル破損のシグナルとして扱える。
詳細は `route.ts` の `kickOffQualityCheck` を参照。

## 関連ファイル

- `src/app/api/skills/pptx/route.ts` — `handleImageThenPptx`
- `src/application/image-prompt-builder.ts` — 1 ショット完成スライド用プロンプトビルダー
- `src/infrastructure/tools/image-tool.ts` — `generate_slide_image` / `generate_all_images` ツール
- `src/infrastructure/image/azure-image-client.ts` — gpt-image-2 ラッパー
