/**
 * Development-only test endpoint for bbox extraction.
 * POST /api/test/bbox  body: { imagePath: string, slideNumber?: number }
 *
 * Example:
 *   curl -X POST http://localhost:3000/api/test/bbox \
 *     -H "Content-Type: application/json" \
 *     -d '{"imagePath":"C:/Repos/copilot-sdk-agent/test-fixtures/slide1.png"}'
 */
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import { extractLayout } from '@/infrastructure/image/bbox-extractor';

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'not available in production' }, { status: 403 });
  }

  const body = await req.json() as { imagePath?: string; slideNumber?: number; timeoutMs?: number };
  const imagePath = body.imagePath;
  if (!imagePath) {
    return NextResponse.json({ error: 'imagePath is required' }, { status: 400 });
  }

  const slideNumber = body.slideNumber ?? 1;
  const timeoutMs = body.timeoutMs ?? 60_000;

  let imageBuffer: Buffer;
  try {
    imageBuffer = await fs.readFile(imagePath);
  } catch (e) {
    return NextResponse.json({ error: `Failed to read file: ${e instanceof Error ? e.message : String(e)}` }, { status: 400 });
  }

  const start = Date.now();
  try {
    const layout = await extractLayout(imageBuffer, { slideNumber, timeoutMs });
    const elapsed = Date.now() - start;
    return NextResponse.json({ success: true, elapsed, elementCount: layout.elements.length, layout });
  } catch (e) {
    const elapsed = Date.now() - start;
    const msg = e instanceof Error ? e.message : String(e);
    const name = e instanceof Error ? e.name : 'Error';
    return NextResponse.json({ success: false, elapsed, error: msg, errorType: name }, { status: 500 });
  }
}
