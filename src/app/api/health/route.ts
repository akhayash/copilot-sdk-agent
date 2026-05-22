/**
 * API Route: Health Check
 * GET /api/health
 *
 * Also probes whether soffice and pdftoppm are available so operators can
 * confirm that the LibreOffice refinement loop will actually run (not fall
 * through to the catch block).
 */

import { NextResponse } from 'next/server';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

async function probeCommand(cmd: string): Promise<{ available: boolean; version?: string; error?: string }> {
  try {
    const { stdout, stderr } = await execAsync(`${cmd} --version`, { timeout: 5000 });
    const raw = (stdout || stderr).split('\n')[0].trim();
    return { available: true, version: raw.slice(0, 80) };
  } catch (e) {
    return { available: false, error: e instanceof Error ? e.message.slice(0, 120) : String(e) };
  }
}

export async function GET() {
  const [soffice, pdftoppm] = await Promise.all([
    probeCommand('soffice'),
    probeCommand('pdftoppm'),
  ]);

  const refinementLoopReady = soffice.available && pdftoppm.available;

  return NextResponse.json(
    {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'copilot-sdk-agent',
      dependencies: {
        soffice,
        pdftoppm,
        refinementLoopReady,
      },
    },
    { status: 200 },
  );
}
