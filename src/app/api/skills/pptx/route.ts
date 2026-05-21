/**
 * API Route: PPTX Generation Skill
 * POST /api/skills/pptx
 *
 * Three generation modes:
 *   - 'code' (default): execute AI-produced pptxgenjs code (legacy path).
 *   - 'image-bleed' (formerly 'image-then-pptx'): each cached gpt-image-2 image
 *     is placed full-bleed on a PPTX slide. Fast, non-editable.
 *   - 'image-editable': vision LLM extracts bbox layout from each slide image
 *     → native pptxgenjs elements are reconstructed → editable PPTX.
 */

// Allow up to 5 minutes for image-editable mode (Vision LLM can take 90–120 s per slide)
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import PptxGenJS from 'pptxgenjs';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { getImage } from '@/infrastructure/image/image-cache';
import { extractLayout } from '@/infrastructure/image/bbox-extractor';
import { applyLayoutToSlide } from '@/application/layout-to-pptx';
import {
  renderPptxToPngs,
  cleanupRenderJob,
} from '@/infrastructure/render/libreoffice-renderer';
import {
  compareImages,
  evaluateQuality,
  type QualityVerdict,
} from '@/infrastructure/image/image-comparator';
import {
  setQualityVerdict,
  type PerSlideQuality,
} from './quality/cache';
import type { ScenarioSlide } from '@/infrastructure/tools/scenario-tool';

interface PptxCodeRequest {
  /**
   * Generation mode.
   * 'image-then-pptx' is treated as an alias for 'image-bleed' for backward compat.
   */
  generationMode?: 'code' | 'image-bleed' | 'image-editable' | 'image-then-pptx';
  code?: string;
  title?: string;
  imageIds?: Array<{ slideNumber: number; imageId: string }>;
  /** Scenario slides — used to attach speaker notes in image modes. */
  scenario?: ScenarioSlide[];
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PptxCodeRequest;
    const mode = body.generationMode ?? 'code';
    const title = body.title;

    if (mode === 'image-bleed' || mode === 'image-then-pptx') {
      return handleImageBleedPptx(body);
    }

    if (mode === 'image-editable') {
      return handleImageEditablePptx(body);
    }

    // Legacy 'code' mode
    if (!body.code || typeof body.code !== 'string' || body.code.trim().length === 0) {
      return NextResponse.json(
        { error: 'code is required and must be a non-empty string' },
        { status: 400 },
      );
    }

    const pptxBuffer = await executePptxCode(body.code);

    const safeTitle = (title || 'presentation').replace(/[^\w\s\-]/g, '_');
    const encodedTitle = encodeURIComponent(title || 'presentation');

    return new NextResponse(pptxBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="${safeTitle}.pptx"; filename*=UTF-8''${encodedTitle}.pptx`,
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Failed to generate PPTX';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

/**
 * Image-bleed mode (formerly 'image-then-pptx'):
 * place each gpt-image-2 render full-bleed on a slide — fast, non-editable.
 */
async function handleImageBleedPptx(body: PptxCodeRequest): Promise<NextResponse> {
  const imageIds = body.imageIds ?? [];
  if (imageIds.length === 0) {
    return NextResponse.json(
      { error: 'imageIds is required for image-bleed mode' },
      { status: 400 },
    );
  }

  const slideEntries: Array<{ slideNumber: number; image: Buffer | null; scenario: ScenarioSlide | null }> =
    imageIds
      .slice()
      .sort((a, b) => a.slideNumber - b.slideNumber)
      .map((entry) => {
        const cached = getImage(entry.imageId);
        const scenarioSlide = (body.scenario ?? []).find((s) => s.number === entry.slideNumber);
        return {
          slideNumber: entry.slideNumber,
          image: cached?.data ?? null,
          scenario: scenarioSlide ?? null,
        };
      });

  const missing = slideEntries.filter((s) => s.image === null).map((s) => s.slideNumber);
  if (missing.length === slideEntries.length) {
    return NextResponse.json(
      { error: `All slide images are missing from cache (slides: ${missing.join(',')}). Re-generate images first.` },
      { status: 410 },
    );
  }

  const pres = new PptxGenJS();
  // Default pptxgenjs layout is 10x5.625 (16:9). Keep it so the image fills exactly.
  const SW = 10;
  const SH = 5.625;

  for (const entry of slideEntries) {
    const slide = pres.addSlide();
    if (entry.image) {
      const dataUri = `data:image/png;base64,${entry.image.toString('base64')}`;
      slide.addImage({ data: dataUri, x: 0, y: 0, w: SW, h: SH });
    } else {
      slide.background = { color: 'FFFFFF' };
      slide.addText(
        entry.scenario?.title ?? `Slide ${entry.slideNumber} (image unavailable)`,
        { x: 0.5, y: SH / 2 - 0.3, w: SW - 1, h: 0.6, fontSize: 24, bold: true, color: '1B1B1B', align: 'center' },
      );
    }
    // Always attach speaker notes if we have them — useful for the presenter
    // and adds searchable text to the deck.
    const notes = entry.scenario?.notes?.trim();
    if (notes) {
      slide.addNotes(notes);
    }
  }

  const pptxBuffer = (await pres.write({ outputType: 'arraybuffer' })) as ArrayBuffer;
  const headers: Record<string, string> = {};
  if (missing.length > 0) {
    headers['x-pptx-missing-images'] = missing.join(',');
  }
  const jobId = randomUUID();
  kickOffQualityCheck(jobId, pptxBuffer, slideEntries);
  headers['x-pptx-job-id'] = jobId;
  return pptxResponse(pptxBuffer, body.title, headers);
}

/**
 * Image-editable mode: vision LLM extracts bbox layout from each slide image
 * → pptxgenjs native elements are reconstructed for a fully editable deck.
 * Slides that fail bbox extraction fall back to full-bleed image (Hybrid C).
 */
async function handleImageEditablePptx(body: PptxCodeRequest): Promise<NextResponse> {
  const imageIds = body.imageIds ?? [];
  if (imageIds.length === 0) {
    return NextResponse.json(
      { error: 'imageIds is required for image-editable mode' },
      { status: 400 },
    );
  }

  const sorted = imageIds.slice().sort((a, b) => a.slideNumber - b.slideNumber);
  const slideEntries = sorted.map((entry) => {
    const cached = getImage(entry.imageId);
    const scenarioSlide = (body.scenario ?? []).find((s) => s.number === entry.slideNumber);
    return {
      slideNumber: entry.slideNumber,
      imageId: entry.imageId,
      image: cached?.data ?? null,
      scenario: scenarioSlide ?? null,
    };
  });

  const missing = slideEntries.filter((s) => s.image === null).map((s) => s.slideNumber);
  if (missing.length === slideEntries.length) {
    return NextResponse.json(
      { error: `All slide images are missing from cache (slides: ${missing.join(',')}).` },
      { status: 410 },
    );
  }

  const pres = new PptxGenJS();
  // 16:9 inches — must match applyLayoutToSlide expectations
  const SW = 10;
  const SH = 5.625;
  let fallbackCount = 0;

  // Parallel bbox extraction with per-slide timeout.
  // Vision LLM inference can take 90-120 s per slide in practice.
  const BBOX_TIMEOUT_MS = 150_000;
  await Promise.all(
    slideEntries.map(async (entry) => {
      if (!entry.image) {
        // Cache miss — full-bleed fallback
        const slide = pres.addSlide();
        slide.background = { color: 'FFFFFF' };
        slide.addText(
          entry.scenario?.title ?? `Slide ${entry.slideNumber}`,
          { x: 0.5, y: SH / 2 - 0.3, w: SW - 1, h: 0.6, fontSize: 24, bold: true, color: '1B1B1B', align: 'center' },
        );
        fallbackCount++;
        return;
      }

      try {
        const layout = await extractLayout(entry.image, {
          slideNumber: entry.slideNumber,
          timeoutMs: BBOX_TIMEOUT_MS,
        });
        await applyLayoutToSlide(pres, layout, entry.image);
      } catch (err) {
        console.warn(
          `[pptx] bbox extraction failed for slide ${entry.slideNumber} — using full-bleed fallback:`,
          err instanceof Error ? err.message : String(err),
        );
        // Full-bleed fallback (Hybrid C)
        const slide = pres.addSlide();
        const dataUri = `data:image/png;base64,${entry.image.toString('base64')}`;
        slide.addImage({ data: dataUri, x: 0, y: 0, w: SW, h: SH });
        fallbackCount++;
      }

      // Attach speaker notes regardless of mode
      const notes = entry.scenario?.notes?.trim();
      if (notes) {
        // pptxgenjs exposes slides array at runtime but not in typings
        const slides = (pres as unknown as { slides: Array<{ addNotes: (n: string) => void }> }).slides;
        const lastSlide = slides[slides.length - 1];
        if (lastSlide) lastSlide.addNotes(notes);
      }
    }),
  );

  const pptxBuffer = (await pres.write({ outputType: 'arraybuffer' })) as ArrayBuffer;
  const headers: Record<string, string> = {
    'x-pptx-fallback-count': String(fallbackCount),
  };
  return pptxResponse(pptxBuffer, body.title, headers);
}

function pptxResponse(
  buffer: ArrayBuffer,
  title: string | undefined,
  extraHeaders:
    | Record<string, string>
    | { fallback: 'hybrid-c'; jobId?: string } = {},
): NextResponse {
  const safeTitle = (title || 'presentation').replace(/[^\w\s\-]/g, '_');
  const encodedTitle = encodeURIComponent(title || 'presentation');
  const headers: Record<string, string> = {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'Content-Disposition': `attachment; filename="${safeTitle}.pptx"; filename*=UTF-8''${encodedTitle}.pptx`,
  };
  if ('fallback' in extraHeaders) {
    headers['x-pptx-fallback'] = 'hybrid-c';
    if (extraHeaders.jobId) {
      headers['x-pptx-job-id'] = extraHeaders.jobId;
    }
  } else {
    Object.assign(headers, extraHeaders);
  }
  return new NextResponse(buffer, { status: 200, headers });
}

/**
 * Kick off the LibreOffice render + image-diff in the background. The
 * caller has already sent the PPTX back to the client; this never throws
 * — failures are recorded in the quality cache instead.
 */
function kickOffQualityCheck(
  jobId: string,
  pptxBuffer: ArrayBuffer,
  slideEntries: Array<{ slideNumber: number; image: Buffer | null; scenario: ScenarioSlide | null }>,
): void {
  setQualityVerdict(jobId, { status: 'pending' });
  // Detach from the response lifecycle. We intentionally do not `await`.
  void runQualityCheck(jobId, Buffer.from(pptxBuffer), slideEntries).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    setQualityVerdict(jobId, { status: 'error', error: msg });
  });
}

async function runQualityCheck(
  jobId: string,
  pptxBuffer: Buffer,
  slideEntries: Array<{ slideNumber: number; image: Buffer | null; scenario: ScenarioSlide | null }>,
): Promise<void> {
  // Persist source images to disk so `compareImages` (which takes paths)
  // has something to read. We co-locate them with the rendered PNGs by
  // writing into os.tmpdir() under a jobId-scoped prefix.
  const originalsDir = path.join(tmpdir(), `quality-originals-${jobId}`);
  await fs.mkdir(originalsDir, { recursive: true });

  try {
    const rendered = await renderPptxToPngs(pptxBuffer, { jobId });

    const perSlide: PerSlideQuality[] = [];
    for (const slide of rendered) {
      const entry = slideEntries.find((s) => s.slideNumber === slide.slideNumber);
      if (!entry?.image) {
        // No source image (e.g. cache miss) — can't compare; skip silently.
        continue;
      }

      const originalPath = path.join(originalsDir, `slide-${slide.slideNumber}.png`);
      await fs.writeFile(originalPath, entry.image);

      try {
        const metrics = await compareImages(originalPath, slide.pngPath);
        const verdict = evaluateQuality(metrics);
        perSlide.push({
          slideNumber: slide.slideNumber,
          diffPixelRatio: metrics.diffPixelRatio,
          phashDistance: metrics.phashDistance,
          verdict,
        });
      } catch (err) {
        console.warn(
          `[pptx-quality] compare failed for slide ${slide.slideNumber}:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    const overall: QualityVerdict = aggregateVerdict(perSlide);
    setQualityVerdict(jobId, { status: 'done', verdict: overall, perSlide });
  } finally {
    await cleanupRenderJob(jobId);
    await fs.rm(originalsDir, { recursive: true, force: true }).catch(() => {
      /* best effort */
    });
  }
}

/** Worst-of-all aggregation: fail > warn > pass. */
function aggregateVerdict(perSlide: PerSlideQuality[]): QualityVerdict {
  if (perSlide.length === 0) return 'pass';
  if (perSlide.some((s) => s.verdict === 'fail')) return 'fail';
  if (perSlide.some((s) => s.verdict === 'warn')) return 'warn';
  return 'pass';
}

/**
 * Execute AI-generated pptxgenjs code and return the PPTX buffer.
 * The code receives `pres` (PptxGenJS instance) and helper constants.
 */
async function executePptxCode(code: string): Promise<ArrayBuffer> {
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';

  // Provide design constants matching pptx-by-GHCP design system
  const C = {
    BLUE: '0078D4',
    BLUE_DARK: '005A9E',
    BLUE_LIGHT: 'DEECF9',
    BLUE_PALE: 'EBF3FC',
    DARK: '1B1B1B',
    DARK_GRAY: '2D2D2D',
    MID_GRAY: '505050',
    TEXT: '3B3B3B',
    LIGHT_GRAY: 'F5F5F5',
    BORDER: 'E1E1E1',
    GREEN: '107C10',
    GREEN_LIGHT: 'DFF6DD',
    ORANGE: 'D83B01',
    ORANGE_LIGHT: 'FFF4CE',
    PURPLE: '5C2D91',
    PURPLE_LIGHT: 'F0E6F6',
    TEAL: '008272',
    WHITE: 'FFFFFF',
  };

  const F = { JA: 'Noto Sans JP', EN: 'Segoe UI' };
  const SW = 13.33;
  const SH = 7.5;
  const ML = 0.5;
  const MR = 0.5;
  const CW = SW - ML - MR;
  const HEADER_H = 0.45;

  // Build the function body with provided variables in scope
  const fn = new Function(
    'pres', 'C', 'F', 'SW', 'SH', 'ML', 'MR', 'CW', 'HEADER_H',
    `return (async () => { ${code} })();`,
  );

  await fn(pres, C, F, SW, SH, ML, MR, CW, HEADER_H);

  return pres.write({ outputType: 'arraybuffer' }) as Promise<ArrayBuffer>;
}
