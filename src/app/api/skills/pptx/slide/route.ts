/**
 * API Route: Single Slide PPTX Generation + PNG Preview
 * POST /api/skills/pptx/slide
 *
 * Generates a single slide PPTX, then converts to PNG via SVG rendering with sharp.
 * Returns JSON with { pptx: base64, preview: base64png }
 */

import { NextRequest, NextResponse } from 'next/server';
import PptxGenJS from 'pptxgenjs';
import sharp from 'sharp';

interface SlideRequest {
  code: string;
  slideNumber: number;
  title: string;
}

// Design constants matching the main PPTX route
const C = {
  BLUE: '0078D4', BLUE_DARK: '005A9E', BLUE_LIGHT: 'DEECF9', BLUE_PALE: 'EBF3FC',
  DARK: '1B1B1B', DARK_GRAY: '2D2D2D', MID_GRAY: '505050', TEXT: '3B3B3B',
  LIGHT_GRAY: 'F5F5F5', BORDER: 'E1E1E1', GREEN: '107C10', GREEN_LIGHT: 'DFF6DD',
  ORANGE: 'D83B01', ORANGE_LIGHT: 'FFF4CE', PURPLE: '5C2D91', PURPLE_LIGHT: 'F0E6F6',
  TEAL: '008272', WHITE: 'FFFFFF',
};
const F = { JA: 'Noto Sans JP', EN: 'Segoe UI' };
const SW = 13.33, SH = 7.5, ML = 0.5, MR = 0.5, CW = SW - ML - MR, HEADER_H = 0.45;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SlideRequest;
    const { code, slideNumber, title } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'code is required' }, { status: 400 });
    }

    // Generate single-slide PPTX
    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_WIDE';

    const fn = new Function(
      'pres', 'C', 'F', 'SW', 'SH', 'ML', 'MR', 'CW', 'HEADER_H',
      `return (async () => { ${code} })();`,
    );
    await fn(pres, C, F, SW, SH, ML, MR, CW, HEADER_H);

    const pptxBuffer = await pres.write({ outputType: 'arraybuffer' }) as ArrayBuffer;
    const pptxBase64 = Buffer.from(pptxBuffer).toString('base64');

    // Generate SVG-based PNG preview using sharp
    const previewPng = await generateSlidePreviewPng(title, slideNumber);

    return NextResponse.json({
      slideNumber,
      pptx: pptxBase64,
      preview: previewPng,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to generate slide';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Generate a PNG preview image from slide metadata using sharp SVG rendering.
 * This creates a visual thumbnail that approximates the PPTX slide appearance.
 */
async function generateSlidePreviewPng(title: string, slideNumber: number): Promise<string> {
  const w = 640;
  const h = 400;
  const accent = '#0078D4';
  const accentLight = '#EBF3FC';

  // Escape XML special characters
  const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const safeTitle = escXml(title).slice(0, 40);

  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${w}" height="${h}" fill="white"/>
    <rect x="0" y="0" width="${w}" height="56" fill="${accentLight}"/>
    <rect x="0" y="54" width="${w}" height="2" fill="${accent}" opacity="0.3"/>
    <rect x="24" y="14" width="28" height="28" rx="6" fill="${accent}"/>
    <text x="38" y="35" font-size="14" font-weight="700" fill="white" text-anchor="middle" font-family="sans-serif">${slideNumber}</text>
    <text x="64" y="35" font-size="16" font-weight="700" fill="#1B1B1B" font-family="sans-serif">${safeTitle}</text>
    <text x="${w - 16}" y="${h - 12}" font-size="10" fill="#E1E1E1" text-anchor="end" font-family="sans-serif">${String(slideNumber).padStart(2, '0')}</text>
  </svg>`;

  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return pngBuffer.toString('base64');
}
