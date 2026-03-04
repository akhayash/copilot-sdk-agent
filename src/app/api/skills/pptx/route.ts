/**
 * API Route: PPTX Generation Skill
 * POST /api/skills/pptx
 *
 * Accepts pptxgenjs code from the AI and executes it to generate a PPTX file.
 */

import { NextRequest, NextResponse } from 'next/server';
import PptxGenJS from 'pptxgenjs';

interface PptxCodeRequest {
  code: string;
  title?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PptxCodeRequest;
    const { code, title } = body;

    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      return NextResponse.json(
        { error: 'code is required and must be a non-empty string' },
        { status: 400 },
      );
    }

    // Execute pptxgenjs code in a controlled scope
    const pptxBuffer = await executePptxCode(code);

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
