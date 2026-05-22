/**
 * API Route: PPTX quality gate status.
 *
 * GET /api/skills/pptx/quality/[jobId]
 *
 * The PPTX route (POST /api/skills/pptx in `image-then-pptx` mode) returns
 * a `jobId` via the `x-pptx-job-id` header and kicks off a background
 * LibreOffice render + image-diff. The client polls this endpoint to learn
 * the verdict. Results live in-memory only — see WI-01 for the durable
 * store follow-on.
 */

import { NextResponse } from 'next/server';

import { getQualityVerdict } from '../cache';

export async function GET(
  _req: Request,
  context: { params: Promise<{ jobId: string }> },
): Promise<NextResponse> {
  const { jobId } = await context.params;
  const verdict = getQualityVerdict(jobId);
  if (!verdict) {
    return NextResponse.json({ status: 'unknown', jobId }, { status: 404 });
  }
  return NextResponse.json({ jobId, ...verdict });
}
