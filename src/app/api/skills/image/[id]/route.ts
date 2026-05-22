/**
 * API Route: Image Binary Retrieval
 * GET /api/skills/image/[id]
 *
 * Returns the cached image binary for the given id, or 404 if missing/expired.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getImage } from '@/infrastructure/image/image-cache';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const entry = getImage(id);
  if (!entry) {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(entry.data), {
    status: 200,
    headers: {
      'Content-Type': entry.mimeType || 'image/png',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
