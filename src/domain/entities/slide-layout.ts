/**
 * Domain Entity: Slide Layout (bbox-based reconstruction schema)
 *
 * Schema for the JSON returned by the bbox-extractor (vision LLM). Used by
 * `src/application/layout-to-pptx.ts` to rebuild a PPTX slide natively
 * from a generated image. See `skills/pptx-from-image/SKILL.md` for the
 * philosophy (z-order, hard rules, etc.).
 *
 * NOTE: zod is imported here. Although the domain layer is typically
 * framework-agnostic, zod is treated as a pure schema-validation utility
 * (no IO, no framework coupling), which the project has standardized on
 * across boundaries. See `package.json` deps.
 */

import { z } from 'zod';

/** Slide-relative bounding box: [x, y, w, h] in 0.0–1.0. */
export type Bbox = readonly [number, number, number, number];

/** z-order layer (see SKILL.md): 1=background picture, 2=shapes, 3=text, 4=top highlights. */
export type ZLayer = 1 | 2 | 3 | 4;

export type TextAlign = 'left' | 'center' | 'right';

export interface TextboxElement {
  id: string;
  type: 'textbox';
  bbox: Bbox;
  z: ZLayer;
  text: string;
  fontSize: number;
  bold?: boolean;
  italic?: boolean;
  align?: TextAlign;
  /** Hex color WITH leading '#' (e.g. '#1B1B1B'). */
  color?: string;
}

export interface AutoShapeElement {
  id: string;
  type: 'auto_shape';
  /** Currently only RECTANGLE is supported (also used for thin border lines). */
  shape: 'RECTANGLE';
  bbox: Bbox;
  z: ZLayer;
  /** Hex color WITH leading '#' (e.g. '#0078D4'). */
  fill?: string;
  line?: {
    color: string;
    width: number;
  };
}

export interface LineElement {
  id: string;
  type: 'line';
  /** Line endpoints are derived from the bbox diagonal (top-left → bottom-right). */
  bbox: Bbox;
  z: ZLayer;
  line: {
    color: string;
    width: number;
  };
}

export interface PictureElement {
  id: string;
  type: 'picture';
  bbox: Bbox;
  z: ZLayer;
  /** Crop region in the SOURCE image (0..1 normalized). */
  sourceCrop: Bbox;
}

export type LayoutElement =
  | TextboxElement
  | AutoShapeElement
  | LineElement
  | PictureElement;

export interface SlideLayout {
  slideNumber: number;
  elements: LayoutElement[];
}

// ---------------------------------------------------------------------------
// zod schemas
// ---------------------------------------------------------------------------

const BboxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);
const ZLayerSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, {
  message: 'color must be #RRGGBB',
});

const TextboxSchema = z.object({
  id: z.string().min(1),
  type: z.literal('textbox'),
  bbox: BboxSchema,
  z: ZLayerSchema,
  text: z.string(),
  fontSize: z.number().positive(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  color: HexColorSchema.optional(),
});

const AutoShapeSchema = z.object({
  id: z.string().min(1),
  type: z.literal('auto_shape'),
  shape: z.literal('RECTANGLE'),
  bbox: BboxSchema,
  z: ZLayerSchema,
  fill: HexColorSchema.optional(),
  line: z
    .object({
      color: HexColorSchema,
      width: z.number().nonnegative(),
    })
    .optional(),
});

const LineElementSchema = z.object({
  id: z.string().min(1),
  type: z.literal('line'),
  bbox: BboxSchema,
  z: ZLayerSchema,
  line: z.object({
    color: HexColorSchema,
    width: z.number().nonnegative(),
  }),
});

const PictureSchema = z.object({
  id: z.string().min(1),
  type: z.literal('picture'),
  bbox: BboxSchema,
  z: ZLayerSchema,
  sourceCrop: BboxSchema,
});

const LayoutElementSchema = z.discriminatedUnion('type', [
  TextboxSchema,
  AutoShapeSchema,
  LineElementSchema,
  PictureSchema,
]);

export const SlideLayoutSchema = z
  .object({
    slideNumber: z.number().int().positive(),
    elements: z.array(LayoutElementSchema).min(0),
  })
  .superRefine((data, ctx) => {
    // (1) id uniqueness
    const seen = new Set<string>();
    for (const el of data.elements) {
      if (seen.has(el.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate element id: ${el.id}`,
          path: ['elements'],
        });
      }
      seen.add(el.id);
    }

    // (2) bbox w/h positive + (3) in-bounds 0..1
    for (const el of data.elements) {
      const [x, y, w, h] = el.bbox;
      if (w <= 0 || h <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `non-positive bbox w/h at ${el.id}: [${x},${y},${w},${h}]`,
          path: ['elements'],
        });
      }
      if (x < 0 || y < 0 || x + w > 1.000001 || y + h > 1.000001) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `bbox out of [0,1] bounds at ${el.id}: [${x},${y},${w},${h}]`,
          path: ['elements'],
        });
      }
    }

    // (4) picture sourceCrop bounds
    for (const el of data.elements) {
      if (el.type === 'picture') {
        const [sx, sy, sw, sh] = el.sourceCrop;
        if (sw <= 0 || sh <= 0 || sx < 0 || sy < 0 || sx + sw > 1.000001 || sy + sh > 1.000001) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `sourceCrop out of bounds at ${el.id}: [${sx},${sy},${sw},${sh}]`,
            path: ['elements'],
          });
        }
      }
    }
  });

export type SlideLayoutInput = z.input<typeof SlideLayoutSchema>;
