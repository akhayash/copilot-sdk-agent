/**
 * Infrastructure Layer: bbox extractor (vision LLM)
 *
 * Uses the Copilot SDK to send a slide image to a vision-capable model and
 * extract structured layout JSON conforming to `SlideLayoutSchema`.
 *
 * The SDK's `attachments` API takes file paths, so we write the buffer to a
 * temp file first and clean it up in a `finally` block.
 *
 * Environment variables:
 *   BBOX_VISION_MODEL        (default: unset → uses MODEL_NAME from env)
 *   BBOX_VISION_CONCURRENCY  (default: 3) — read by callers when queueing
 *
 * Per-call timeout defaults to 20s via AbortController.
 */

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  getCopilotClient,
  getSessionOptions,
} from "@/infrastructure/copilot/client";
import {
  SlideLayoutSchema,
  type SlideLayout,
} from "@/domain/entities/slide-layout";

const DEFAULT_TIMEOUT_MS = 300_000;

export class BboxExtractionError extends Error {
  constructor(
    message: string,
    public reason: string,
  ) {
    super(message);
    this.name = "BboxExtractionError";
  }
}

export class BboxTimeoutError extends BboxExtractionError {
  constructor(message: string) {
    super(message, "timeout");
    this.name = "BboxTimeoutError";
  }
}

export interface ExtractLayoutOptions {
  slideNumber: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Concurrency hint for callers wiring up p-queue. */
export function getBboxConcurrency(): number {
  const raw = Number(process.env.BBOX_VISION_CONCURRENCY);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 3;
}

const SYSTEM_PROMPT = [
  "You are a precision slide-layout extractor.",
  "Analyze the attached slide image and return a single JSON object that strictly matches the schema below.",
  "",
  "=== OUTPUT SCHEMA ===",
  "{",
  '  "slideNumber": <integer>,',
  '  "slideBackground": "#RRGGBB",  // REQUIRED if the slide has a solid background color',
  '  "elements": [',
  '    // textbox:',
  '    { "id": "t1", "type": "textbox", "bbox": [x,y,w,h], "z": 3,',
  '      "text": "exact text", "fontSize": <pt>, "bold": <bool>, "italic": <bool>,',
  '      "align": "left"|"center"|"right", "valign": "top"|"middle"|"bottom",',
  '      "fontFace": "Meiryo UI",  // use "Meiryo UI" for Japanese, "Calibri" for Latin',
  '      "color": "#RRGGBB" },',
  '    // auto_shape (non-background rectangles only):',
  '    { "id": "s1", "type": "auto_shape", "shape": "RECTANGLE", "bbox": [x,y,w,h], "z": 2,',
  '      "fill": "#RRGGBB", "line": { "color": "#RRGGBB", "width": <pt> } },',
  '    // line:',
  '    { "id": "l1", "type": "line", "bbox": [x,y,w,h], "z": 2,',
  '      "line": { "color": "#RRGGBB", "width": <pt> } },',
  '    // picture (photos/icons/charts only, NOT background):',
  '    { "id": "p1", "type": "picture", "bbox": [x,y,w,h], "z": 1, "sourceCrop": [x,y,w,h] }',
  "  ]",
  "}",
  "",
  "=== BBOX RULES ===",
  "- Coordinates are slide-relative fractions 0.0..1.0 (top-left origin). NOT pixels.",
  "- [x, y, w, h] = left edge, top edge, width, height.",
  "- For textboxes: extend bbox by +5% width and +15% height beyond the visible glyph boundary to prevent PowerPoint clipping.",
  "  Example: visible text x=0.05..0.45 → set bbox [0.03, y-0.01, 0.44, h+0.03].",
  "- z-order: 1=deep background, 2=shapes/dividers, 3=main text, 4=overlay highlights.",
  "",
  "=== BACKGROUND RULE ===",
  '- If the slide has a solid background color, set "slideBackground": "#RRGGBB" at the top level.',
  '- Do NOT create an auto_shape that covers the entire slide (bbox ≈ [0,0,1,1]) just for the background color. Use "slideBackground" instead.',
  '- Use auto_shape ONLY for non-background decorative rectangles (header bands, cards, dividers, etc.).',
  "",
  "=== TEXT EXTRACTION RULES ===",
  "- Extract ALL visible text — headings, body, labels, footnotes, page numbers.",
  '- Japanese text: transcribe exactly character by character. Use fontFace "Meiryo UI".',
  '- Latin/English text: use fontFace "Calibri" unless a clearly different font is visible.',
  "- ONE textbox per logical text block (heading, paragraph, bullet list). Never split a single line into multiple textboxes.",
  "- Bullet lists: concatenate all bullets into a single textbox with newline (\\n) between items.",
  "- fontSize: estimate in points. Heading ≈ 24-36pt, subheading ≈ 18-24pt, body ≈ 12-18pt, footnote ≈ 8-11pt.",
  "- valign: 'top' for headers/body, 'middle' for centered labels inside shapes.",
  "",
  "=== PICTURE RULE ===",
  '- Only use type "picture" for photographic content, charts, icons, or illustrations embedded in the slide.',
  '- For a "picture" element the sourceCrop field MUST be present. If the image occupies its full bbox, use [0, 0, 1, 1].',
  "- If the entire slide IS an image (no overlaid text), represent the image as a full-bleed picture: bbox=[0,0,1,1], sourceCrop=[0,0,1,1].",
  "",
  "=== STRICT FORMAT ===",
  "- Return ONLY the raw JSON object. No markdown fences, no explanation, no trailing text.",
  '- All hex colors include the leading "#" and are exactly 7 characters: #RRGGBB.',
  "- All IDs must be unique strings within the slide.",
].join("\n");

/**
 * Strip ```json fences and stray prose to recover the JSON object.
 */
function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  // Remove ```json ... ``` fences if present
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    return fenced[1].trim();
  }
  // Best effort: find first '{' and last '}'
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return trimmed.slice(first, last + 1);
  }
  return trimmed;
}

async function runVisionOnce(args: {
  imagePath: string;
  slideNumber: number;
  retryHint?: string;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<string> {
  const { imagePath, slideNumber, retryHint, timeoutMs, signal } = args;

  // Normalize imagePath once so the permission check is OS-agnostic.
  // On Windows, tmpdir() uses backslashes but the CLI may send forward slashes.
  const normalizedImagePath = path.normalize(imagePath).toLowerCase();
  const imageBasename = path.basename(imagePath);

  // If BBOX_VISION_MODEL is unset, pass undefined so getSessionOptions falls back to MODEL_NAME.
  const model = process.env.BBOX_VISION_MODEL || undefined;
  const copilot = await getCopilotClient();
  const sessionOpts = await getSessionOptions({ streaming: false, model });

  console.log(
    `[bbox] slide=${slideNumber} model=${sessionOpts.model ?? "(default)"} timeout=${timeoutMs}ms`,
  );

  const session = await copilot.createSession({
    ...sessionOpts,
    systemMessage: { mode: "append" as const, content: SYSTEM_PROMPT },
    onPermissionRequest: (req, _invocation) => {
      if (req.kind === "custom-tool") return { kind: "approve-once" as const };
      if (req.kind === "read") {
        const p = String((req as unknown as Record<string, unknown>).path ?? "");
        const normalizedP = path.normalize(p).toLowerCase();
        // Allow reading the attachment temp file (compare by normalized path AND basename UUID)
        // to handle Windows backslash vs forward-slash differences.
        if (
          normalizedP === normalizedImagePath ||
          p.includes(imageBasename) ||
          p.includes("copilot-tool-output")
        ) {
          console.log(`[bbox] approved read: ${p}`);
          return { kind: "approve-once" as const };
        }
        console.log(`[bbox] denied read: ${p}`);
      } else {
        console.log(`[bbox] permission request kind=${req.kind}`);
      }
      return { kind: "reject" as const };
    },
  });

  const prompt = retryHint
    ? `Slide ${slideNumber}. Previous output failed schema validation: ${retryHint}. Return ONLY a valid JSON object per the schema, no commentary.`
    : `Extract the layout JSON for slide ${slideNumber}.`;

  // Combine caller signal with our own timeout
  const ac = new AbortController();
  const onParentAbort = () => ac.abort();
  if (signal) {
    if (signal.aborted) {
      ac.abort();
    } else {
      signal.addEventListener("abort", onParentAbort, { once: true });
    }
  }
  const abortPromise = new Promise<never>((_, reject) => {
    ac.signal.addEventListener(
      "abort",
      () =>
        reject(
          new BboxTimeoutError(
            `bbox extraction aborted/timeout (${timeoutMs}ms)`,
          ),
        ),
      { once: true },
    );
  });
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    // sendAndWait returns the last assistant.message event (or undefined).
    const result = await Promise.race([
      session.sendAndWait(
        { prompt, attachments: [{ type: "file", path: imagePath }] },
        timeoutMs,
      ),
      abortPromise,
    ]);
    const content = result?.data?.content ?? "";
    console.log(
      `[bbox] slide=${slideNumber} response length=${content.length} chars`,
    );
    return content;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onParentAbort);
  }
}

/**
 * Extract a structured `SlideLayout` from a slide image.
 *
 * Throws:
 *   - `BboxTimeoutError` on per-call timeout / abort
 *   - `BboxExtractionError` on schema validation failure (after 1 retry)
 *   - underlying SDK errors (network, auth) propagated as-is
 */
export async function extractLayout(
  imageBuffer: Buffer,
  opts: ExtractLayoutOptions,
): Promise<SlideLayout> {
  if (!imageBuffer || imageBuffer.length === 0) {
    throw new BboxExtractionError("empty image buffer", "empty-input");
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const tmpFile = path.join(tmpdir(), `bbox-${randomUUID()}.png`);
  await fs.writeFile(tmpFile, imageBuffer);

  try {
    // First attempt
    const raw1 = await runVisionOnce({
      imagePath: tmpFile,
      slideNumber: opts.slideNumber,
      timeoutMs,
      signal: opts.signal,
    });
    const parsed1 = SlideLayoutSchema.safeParse(safeJsonParse(raw1));
    if (parsed1.success) {
      return parsed1.data as SlideLayout;
    }

    // Retry once with the schema error as hint
    const hint = parsed1.error.issues
      .slice(0, 3)
      .map((i) => i.message)
      .join("; ");
    const raw2 = await runVisionOnce({
      imagePath: tmpFile,
      slideNumber: opts.slideNumber,
      retryHint: hint,
      timeoutMs,
      signal: opts.signal,
    });
    const parsed2 = SlideLayoutSchema.safeParse(safeJsonParse(raw2));
    if (parsed2.success) {
      return parsed2.data as SlideLayout;
    }

    throw new BboxExtractionError(
      `bbox extraction validation failed after retry: ${parsed2.error.issues.map((i) => i.message).join("; ")}`,
      "schema-violation",
    );
  } finally {
    fs.unlink(tmpFile).catch(() => undefined);
  }
}

/** Normalize hex color to #RRGGBB, or return raw string if unrecognized. */
function normalizeColor(raw: string): string {
  const trimmed = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9a-fA-F]{8}$/.test(trimmed)) return trimmed.slice(0, 7);
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    return "#" + [...trimmed.slice(1)].map((c) => c + c).join("");
  }
  const rgb = trimmed.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (rgb) {
    return (
      "#" +
      [rgb[1], rgb[2], rgb[3]]
        .map((v) => parseInt(v).toString(16).padStart(2, "0"))
        .join("")
    );
  }
  return trimmed;
}

/** Clamp bbox values to [0,1] with positive w/h. */
function clampBbox(bbox: unknown): unknown {
  if (!Array.isArray(bbox) || bbox.length !== 4) return bbox;
  let [x, y, w, h] = bbox as number[];
  x = Math.max(0, Math.min(1, x));
  y = Math.max(0, Math.min(1, y));
  w = Math.max(0.001, Math.min(1 - x, w));
  h = Math.max(0.001, Math.min(1 - y, h));
  return [x, y, w, h];
}

/**
 * Normalize LLM-produced layout JSON to fit strict schema constraints:
 * - z-layer clamped to 1-4
 * - hex colors normalized to #RRGGBB
 * - bbox values clamped to [0,1]
 * - picture.sourceCrop defaulted to full-image if missing
 * - slideBackground normalized to #RRGGBB
 * - valign/fontFace passed through if present
 */
function normalizeLayout(obj: unknown): unknown {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const layout = obj as Record<string, unknown>;

  // Normalize top-level slideBackground
  if (typeof layout.slideBackground === "string") {
    layout.slideBackground = normalizeColor(layout.slideBackground);
  }

  if (!Array.isArray(layout.elements)) return layout;

  layout.elements = layout.elements.map((el: unknown) => {
    if (!el || typeof el !== "object" || Array.isArray(el)) return el;
    const e = { ...(el as Record<string, unknown>) };

    if (typeof e.z === "number") {
      e.z = Math.max(1, Math.min(4, Math.round(e.z)));
    }
    if (Array.isArray(e.bbox)) {
      e.bbox = clampBbox(e.bbox);
    }
    for (const key of ["color", "fill"] as const) {
      if (typeof e[key] === "string") {
        e[key] = normalizeColor(e[key] as string);
      }
    }
    if (e.line && typeof e.line === "object" && !Array.isArray(e.line)) {
      const line = { ...(e.line as Record<string, unknown>) };
      if (typeof line.color === "string") {
        line.color = normalizeColor(line.color);
      }
      e.line = line;
    }
    if (e.type === "picture") {
      if (!Array.isArray(e.sourceCrop)) {
        e.sourceCrop = [0, 0, 1, 1];
      } else {
        e.sourceCrop = clampBbox(e.sourceCrop);
      }
    }
    // Normalize valign to allowed values
    if (typeof e.valign === "string" && !["top", "middle", "bottom"].includes(e.valign as string)) {
      delete e.valign;
    }
    return e;
  });

  return layout;
}

function safeJsonParse(raw: string): unknown {
  if (!raw) return null;
  try {
    return normalizeLayout(JSON.parse(extractJsonObject(raw)));
  } catch {
    return null;
  }
}
