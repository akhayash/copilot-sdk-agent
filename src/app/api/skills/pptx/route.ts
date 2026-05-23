/**
 * API Route: PPTX Generation Skill
 * POST /api/skills/pptx
 *
 * Two generation modes:
 *   - 'code' (default): execute AI-produced pptxgenjs code.
 *   - 'image-bleed': each cached gpt-image-2 image is placed full-bleed
 *     on a PPTX slide. Fast, non-editable.
 */

export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import PptxGenJS from 'pptxgenjs';

import { getImage } from '@/infrastructure/image/image-cache';
import type { ScenarioSlide } from '@/infrastructure/tools/scenario-tool';

interface PptxCodeRequest {
  generationMode?: 'code' | 'image-bleed';
  code?: string;
  title?: string;
  imageIds?: Array<{ slideNumber: number; imageId: string }>;
  /** Scenario slides — used to attach speaker notes in image mode. */
  scenario?: ScenarioSlide[];
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PptxCodeRequest;
    const mode = body.generationMode ?? 'code';
    const title = body.title;

    if (mode === 'image-bleed') {
      return handleImageBleedPptx(body);
    }

    // 'code' mode
    if (!body.code || typeof body.code !== 'string' || body.code.trim().length === 0) {
      return NextResponse.json(
        { error: 'code is required and must be a non-empty string' },
        { status: 400 },
      );
    }

    const pptxBuffer = await executePptxCode(body.code);
    return pptxResponse(pptxBuffer, title);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Failed to generate PPTX';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

/**
 * Image-bleed mode: place each gpt-image-2 render full-bleed on a slide.
 * Fast, non-editable.
 */
async function handleImageBleedPptx(body: PptxCodeRequest): Promise<NextResponse> {
  const imageIds = body.imageIds ?? [];
  if (imageIds.length === 0) {
    return NextResponse.json(
      { error: 'imageIds is required for image-bleed mode' },
      { status: 400 },
    );
  }

  const slideEntries = imageIds
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
  return pptxResponse(pptxBuffer, body.title, headers);
}

function pptxResponse(
  buffer: ArrayBuffer,
  title: string | undefined,
  extraHeaders: Record<string, string> = {},
): NextResponse {
  const safeTitle = (title || 'presentation').replace(/[^\w\s\-]/g, '_');
  const encodedTitle = encodeURIComponent(title || 'presentation');
  const headers: Record<string, string> = {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'Content-Disposition': `attachment; filename="${safeTitle}.pptx"; filename*=UTF-8''${encodedTitle}.pptx`,
    ...extraHeaders,
  };
  return new NextResponse(buffer, { status: 200, headers });
}

/**
 * Execute AI-generated pptxgenjs code and return the PPTX buffer.
 * The code receives `pres` (PptxGenJS instance) and helper constants.
 */
async function executePptxCode(code: string): Promise<ArrayBuffer> {
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';

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

  const fn = new Function(
    'pres', 'C', 'F', 'SW', 'SH', 'ML', 'MR', 'CW', 'HEADER_H',
    `return (async () => { ${code} })();`,
  );

  await fn(pres, C, F, SW, SH, ML, MR, CW, HEADER_H);

  return pres.write({ outputType: 'arraybuffer' }) as Promise<ArrayBuffer>;
}
