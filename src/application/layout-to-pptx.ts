/**
 * Application Layer: apply a SlideLayout to a pptxgenjs slide
 *
 * Converts a `SlideLayout` (extracted by bbox-extractor) into pptxgenjs
 * native elements (text boxes, shapes, lines, cropped pictures) so the
 * resulting PPTX remains editable in PowerPoint.
 *
 * Coordinates:
 *   bbox is 0..1 slide-relative. The slide is 16:9 = 10 × 5.625 inches
 *   (pptxgenjs default `LAYOUT_WIDE_16x9` is actually 10x5.625 for the
 *   non-WIDE 16:9 layout; if `LAYOUT_WIDE` (13.33x7.5) is set we honor
 *   the caller-provided dimensions via getSlideDims()).
 */

import sharp from 'sharp';
import type PptxGenJS from 'pptxgenjs';

import type { SlideLayout, LayoutElement } from '@/domain/entities/slide-layout';

interface SlideDimsInches {
  w: number;
  h: number;
}

/**
 * Read the configured slide dimensions from the pptxgenjs instance.
 * Falls back to a 16:9 10x5.625 default if the layout name doesn't
 * map to a known size.
 */
function getSlideDims(pres: PptxGenJS): SlideDimsInches {
  const name = (pres.layout as string) || '';
  if (name === 'LAYOUT_WIDE') return { w: 13.333, h: 7.5 };
  if (name === 'LAYOUT_16x10') return { w: 10, h: 6.25 };
  if (name === 'LAYOUT_4x3') return { w: 10, h: 7.5 };
  // Default 16:9
  return { w: 10, h: 5.625 };
}

function bboxToInches(
  bbox: readonly [number, number, number, number],
  dims: SlideDimsInches,
) {
  const [bx, by, bw, bh] = bbox;
  return {
    x: bx * dims.w,
    y: by * dims.h,
    w: bw * dims.w,
    h: bh * dims.h,
  };
}

/** Strip leading '#' from a hex color; pptxgenjs expects no '#'. */
function hex(color: string | undefined): string | undefined {
  if (!color) return undefined;
  return color.startsWith('#') ? color.slice(1) : color;
}

/**
 * Crop a region of the source image (0..1 normalized) and return a PNG
 * data URI suitable for `slide.addImage({ data })`.
 */
async function cropToDataUri(
  sourceImage: Buffer,
  sourceCrop: readonly [number, number, number, number],
): Promise<string> {
  const meta = await sharp(sourceImage).metadata();
  const srcW = meta.width ?? 0;
  const srcH = meta.height ?? 0;
  if (srcW <= 0 || srcH <= 0) {
    throw new Error('source image has no dimensions');
  }
  const [sx, sy, sw, sh] = sourceCrop;
  // Clamp to integer pixel bounds inside the source.
  const left = Math.max(0, Math.min(srcW - 1, Math.floor(sx * srcW)));
  const top = Math.max(0, Math.min(srcH - 1, Math.floor(sy * srcH)));
  const width = Math.max(1, Math.min(srcW - left, Math.floor(sw * srcW)));
  const height = Math.max(1, Math.min(srcH - top, Math.floor(sh * srcH)));
  const png = await sharp(sourceImage)
    .extract({ left, top, width, height })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

/**
 * Apply a SlideLayout to a NEW slide added to `pres`. Elements are placed
 * in ascending z-order so later layers visually cover earlier ones.
 */
export async function applyLayoutToSlide(
  pres: PptxGenJS,
  layout: SlideLayout,
  sourceImage: Buffer,
): Promise<void> {
  const slide = pres.addSlide();
  const dims = getSlideDims(pres);

  // Sort by z ascending so background is added first.
  const ordered = [...layout.elements].sort((a, b) => a.z - b.z);

  for (const el of ordered) {
    await renderElement(pres, slide, el, sourceImage, dims);
  }
}

async function renderElement(
  pres: PptxGenJS,
  slide: PptxGenJS.Slide,
  el: LayoutElement,
  sourceImage: Buffer,
  dims: SlideDimsInches,
): Promise<void> {
  const rect = bboxToInches(el.bbox, dims);

  switch (el.type) {
    case 'picture': {
      const data = await cropToDataUri(sourceImage, el.sourceCrop);
      slide.addImage({ data, ...rect });
      return;
    }
    case 'auto_shape': {
      const opts: PptxGenJS.ShapeProps = { ...rect };
      if (el.fill) opts.fill = { color: hex(el.fill) as string };
      if (el.line) {
        opts.line = { color: hex(el.line.color) as string, width: el.line.width };
      }
      slide.addShape(pres.ShapeType.rect, opts);
      return;
    }
    case 'line': {
      slide.addShape(pres.ShapeType.line, {
        ...rect,
        line: { color: hex(el.line.color) as string, width: el.line.width },
      });
      return;
    }
    case 'textbox': {
      const textOpts: PptxGenJS.TextPropsOptions = {
        ...rect,
        fontSize: el.fontSize,
        bold: el.bold ?? false,
        italic: el.italic ?? false,
        align: el.align ?? 'left',
        valign: 'top',
      };
      if (el.color) textOpts.color = hex(el.color);
      slide.addText(el.text, textOpts);
      return;
    }
    default: {
      // Exhaustiveness check
      const _never: never = el;
      void _never;
    }
  }
}
