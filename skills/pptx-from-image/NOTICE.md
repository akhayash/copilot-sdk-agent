# NOTICE — pptx-from-image SKILL

このスキルディレクトリ (`skills/pptx-from-image/`) は、社内 EMU 組織リポ
`akhayash_microsoft/Hitachi-IT-Dev` の `.github/skills/pptx-from-image/SKILL.md`
を本リポ向けにアダプテーション（再実装）したものです。

## Attribution

- **元スキル**: `akhayash_microsoft/Hitachi-IT-Dev` の `.github/skills/pptx-from-image/SKILL.md`
- **継承したもの**: z-order 規約（1〜4）、4 要素タイプの分類（textbox/auto_shape/line/picture）、
  「1 枚全面 picture 禁止」のハードルール、bbox 構造化フィロソフィー
- **再実装したもの**:
  - 座標系: EMU (12192000 × 6858000) → 正規化 0.0–1.0
  - 実装言語: PowerShell + PowerPoint COM → TypeScript + pptxgenjs + sharp
  - 画像処理: PowerPoint COM の `Pictures.Insert` + crop →
    `sharp(buf).extract({...}).png().toBuffer()` + pptxgenjs `addImage({ data: dataUri })`

EMU リポ側のコンテンツを直接コピーしているわけではなく、本リポ用に新規に
書き起こしているため、ライセンス・配布制約は本リポ全体のライセンスに従います。
社内利用を想定したものであり、外部公開時は元リポメンテナへの確認を推奨します。
