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
  "You are a layout extractor for slide images.",
  "Analyze the attached slide image and return a JSON object that strictly matches this schema:",
  "{",
  '  "slideNumber": <int>,',
  '  "elements": [',
  '    { "id": "<unique>", "type": "textbox", "bbox": [x,y,w,h], "z": 1|2|3|4, "text": "...", "fontSize": <number>, "bold": <bool?>, "align": "left"|"center"|"right"?, "color": "#RRGGBB"? },',
  '    { "id": "<unique>", "type": "auto_shape", "shape": "RECTANGLE", "bbox": [x,y,w,h], "z": 1|2|3|4, "fill": "#RRGGBB"?, "line": { "color": "#RRGGBB", "width": <number> }? },',
  '    { "id": "<unique>", "type": "line", "bbox": [x,y,w,h], "z": 1|2|3|4, "line": { "color": "#RRGGBB", "width": <number> } },',
  '    { "id": "<unique>", "type": "picture", "bbox": [x,y,w,h], "z": 1|2|3|4, "sourceCrop": [x,y,w,h] }',
  "  ]",
  "}",
  "",
  "Constraints:",
  "- All bbox values are slide-relative in 0.0..1.0 (NOT pixels, NOT EMU).",
  "- z-order: 1=background picture, 2=shapes/borders, 3=textboxes, 4=top-level highlights.",
  '- ALL readable text on the slide MUST be represented as separate "textbox" elements. NEVER return a single full-slide picture with no textboxes.',
  "- ids must be unique within the slide.",
  '- Hex colors include the leading "#".',
  "- CRITICAL: For each textbox bbox, add 5% extra width and 10% extra height beyond the visible text region to prevent font-metric clipping in PowerPoint. Example: if text visually spans x=0.05..0.45, set bbox x=0.03, w=0.44.",
  '- CRITICAL: Do NOT split a single logical text run into multiple textbox elements. If a heading reads "Foo Bar", return ONE textbox with text="Foo Bar", not two.',
  "- If text appears in two columns, create one textbox per column — never split a column's text into multiple boxes.",
  "",
  "Output ONLY the JSON object, no markdown fences, no commentary.",
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
    onPermissionRequest: (req) => {
      if (req.kind === "custom-tool") return { kind: "approved" };
      if (req.kind === "read") {
        const p = String((req as Record<string, unknown>).path ?? "");
        const normalizedP = path.normalize(p).toLowerCase();
        // Allow reading the attachment temp file (compare by normalized path AND basename UUID)
        // to handle Windows backslash vs forward-slash differences.
        if (
          normalizedP === normalizedImagePath ||
          p.includes(imageBasename) ||
          p.includes("copilot-tool-output")
        ) {
          console.log(`[bbox] approved read: ${p}`);
          return { kind: "approved" };
        }
        console.log(`[bbox] denied read: ${p}`);
      } else {
        console.log(`[bbox] permission request kind=${req.kind}`);
      }
      return { kind: "denied-by-rules" };
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

function safeJsonParse(raw: string): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(extractJsonObject(raw));
  } catch {
    return null;
  }
}
