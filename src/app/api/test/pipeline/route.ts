/**
 * Development-only diagnostic endpoint for the image-editable PPTX pipeline.
 * POST /api/test/pipeline
 *
 * Runs each stage of the pipeline in sequence and reports step-level success
 * or failure so you can confirm whether LibreOffice, pixelmatch, and the
 * refinement loop are actually executing (not silently falling through to catch).
 *
 * Request body:
 *   { imageId: string, slideNumber?: number }
 *
 * Example:
 *   curl -s -X POST http://localhost:3000/api/test/pipeline \
 *     -H "Content-Type: application/json" \
 *     -d '{"imageId":"<uuid from generate_slide_image>","slideNumber":1}' | jq .
 */

export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import PptxGenJS from 'pptxgenjs';

import { getImage } from '@/infrastructure/image/image-cache';
import { extractLayout, BboxExtractionError, BboxTimeoutError } from '@/infrastructure/image/bbox-extractor';
import { applyLayoutToSlide } from '@/application/layout-to-pptx';
import { renderPptxToPngs, cleanupRenderJob } from '@/infrastructure/render/libreoffice-renderer';
import { compareImages, evaluateQuality } from '@/infrastructure/image/image-comparator';

interface StepResult {
  step: string;
  ok: boolean;
  durationMs: number;
  detail?: unknown;
  error?: string;
}

function timed<T>(label: string, fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = Date.now();
  return fn().then((result) => ({ result, ms: Date.now() - start }));
}

export async function POST(req: NextRequest) {
  const enabled = process.env.PIPELINE_TEST_ENABLED === 'true';
  if (process.env.NODE_ENV === 'production' && !enabled) {
    return NextResponse.json({ error: 'not available in production (set PIPELINE_TEST_ENABLED=true to enable)' }, { status: 403 });
  }

  const body = (await req.json()) as { imageId?: string; slideNumber?: number };
  const { imageId, slideNumber = 1 } = body;

  if (!imageId) {
    return NextResponse.json({ error: 'imageId is required' }, { status: 400 });
  }

  const steps: StepResult[] = [];
  const jobId = `pipeline-test-${randomUUID()}`;

  // ── Step 1: Image cache lookup ────────────────────────────────────────────
  const cached = getImage(imageId);
  steps.push({
    step: '1_image_cache',
    ok: !!cached,
    durationMs: 0,
    detail: cached
      ? { bytes: cached.data.byteLength, mimeType: cached.mimeType }
      : null,
    error: cached ? undefined : `imageId "${imageId}" not found in cache`,
  });
  if (!cached) {
    return NextResponse.json({ ok: false, steps });
  }

  const imageBuffer = cached.data;

  // ── Step 2: bbox extraction (Vision LLM) ─────────────────────────────────
  let layout: Awaited<ReturnType<typeof extractLayout>> | null = null;
  try {
    const { result, ms } = await timed('bbox', () =>
      extractLayout(imageBuffer, { slideNumber, timeoutMs: 120_000 }),
    );
    layout = result;
    steps.push({
      step: '2_bbox_extraction',
      ok: true,
      durationMs: ms,
      detail: {
        elementCount: layout.elements.length,
        slideBackground: layout.slideBackground,
        elements: layout.elements.map((e) => ({ id: e.id, type: e.type, z: e.z })),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const kind =
      e instanceof BboxTimeoutError ? 'timeout' :
      e instanceof BboxExtractionError ? 'extraction-error' : 'unknown';
    steps.push({ step: '2_bbox_extraction', ok: false, durationMs: 0, error: `[${kind}] ${msg}` });
    return NextResponse.json({ ok: false, steps });
  }

  // ── Step 3: PPTX generation (pptxgenjs) ──────────────────────────────────
  let pptxBuffer: ArrayBuffer | null = null;
  try {
    const { result, ms } = await timed('pptx', async () => {
      const pres = new PptxGenJS();
      await applyLayoutToSlide(pres, layout!, imageBuffer);
      return (await pres.write({ outputType: 'arraybuffer' })) as ArrayBuffer;
    });
    pptxBuffer = result;
    steps.push({
      step: '3_pptx_generation',
      ok: true,
      durationMs: ms,
      detail: { bytes: result.byteLength },
    });
  } catch (e) {
    steps.push({
      step: '3_pptx_generation',
      ok: false,
      durationMs: 0,
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ ok: false, steps });
  }

  // ── Step 4: LibreOffice rendering (PPTX → PNG) ───────────────────────────
  let renderedSlides: Awaited<ReturnType<typeof renderPptxToPngs>> = [];
  try {
    const { result, ms } = await timed('libreoffice', () =>
      renderPptxToPngs(Buffer.from(pptxBuffer!), {
        jobId,
        dpi: 96,
        timeoutMs: 90_000,
      }),
    );
    renderedSlides = result;
    steps.push({
      step: '4_libreoffice_render',
      ok: true,
      durationMs: ms,
      detail: { slideCount: result.length, paths: result.map((r) => r.pngPath) },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    steps.push({
      step: '4_libreoffice_render',
      ok: false,
      durationMs: 0,
      error: msg,
      detail: { hint: msg.includes('soffice') ? 'soffice not found — install LibreOffice' : msg.includes('pdftoppm') ? 'pdftoppm not found — install poppler-utils' : 'check server logs' },
    });
    await cleanupRenderJob(jobId);
    // Still return partial results — don't bail
    return NextResponse.json({ ok: false, steps });
  }

  // ── Step 5: Image comparison ──────────────────────────────────────────────
  try {
    const renderedSlide = renderedSlides.find((r) => r.slideNumber === 1) ?? renderedSlides[0];
    if (!renderedSlide) throw new Error('no rendered slides returned');

    // Write original to a temp file for compareImages (needs paths)
    const origPath = path.join(tmpdir(), `orig-${jobId}.png`);
    await fs.writeFile(origPath, imageBuffer);

    try {
      const { result: metrics, ms } = await timed('compare', () =>
        compareImages(origPath, renderedSlide.pngPath),
      );
      const verdict = evaluateQuality(metrics);
      steps.push({
        step: '5_image_comparison',
        ok: true,
        durationMs: ms,
        detail: {
          diffPixelRatio: metrics.diffPixelRatio.toFixed(4),
          phashDistance: metrics.phashDistance,
          verdict,
          verdictMeaning: {
            pass: 'diff≤12% AND phash≤10',
            warn: 'diff≤15% AND phash≤14',
            fail: 'worse than warn thresholds',
          }[verdict],
        },
      });
    } finally {
      await fs.unlink(origPath).catch(() => undefined);
    }
  } catch (e) {
    steps.push({
      step: '5_image_comparison',
      ok: false,
      durationMs: 0,
      error: e instanceof Error ? e.message : String(e),
    });
  } finally {
    await cleanupRenderJob(jobId);
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ ok: allOk, steps });
}
