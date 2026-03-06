/**
 * API Route: List Available Models
 * GET /api/models
 */

import { NextResponse } from 'next/server';
import { getCopilotClient } from '@/infrastructure/copilot/client';

export async function GET() {
  try {
    const copilot = await getCopilotClient();
    await copilot.start();
    const models = await copilot.listModels();
    return NextResponse.json({ models });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to list models';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
