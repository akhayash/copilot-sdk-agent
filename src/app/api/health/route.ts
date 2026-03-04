/**
 * API Route: Health Check
 * GET /api/health
 */

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'copilot-sdk-agent',
    },
    { status: 200 },
  );
}
