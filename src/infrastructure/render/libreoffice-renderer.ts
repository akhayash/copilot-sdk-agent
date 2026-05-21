/**
 * Infrastructure Layer: LibreOffice + poppler PPTX → PNG renderer.
 *
 * Used by the asynchronous quality gate to rasterize a freshly generated
 * PPTX deck so we can image-diff each slide against the source AI image.
 *
 * Design notes:
 * - Per-request work dir under `os.tmpdir()` keeps intermediate files
 *   isolated and lets concurrent jobs coexist.
 * - Each `soffice` invocation uses its own `-env:UserInstallation` profile
 *   (DD-19): the UNO singleton-instance lock would otherwise serialize
 *   concurrent jobs at the bootstrap layer.
 * - Module-level `p-queue` honors `LIBREOFFICE_CONCURRENCY` (default 1) so
 *   we cap the number of LibreOffice/pdftoppm subprocesses regardless of
 *   how many quality jobs are in flight.
 * - Cleanup is **caller-driven**: the route handler needs the rendered
 *   PNGs to outlive `renderPptxToPngs` so it can run image-diff against
 *   them. Callers MUST invoke `cleanupRenderJob(jobId)` in a finally
 *   block when they are done with the outputs.
 */

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import PQueue from 'p-queue';

export interface RenderOptions {
  jobId: string;
  /** Output DPI for pdftoppm. Defaults to 150. */
  dpi?: number;
  /** Hard timeout per subprocess (soffice / pdftoppm). Defaults to 60_000ms. */
  timeoutMs?: number;
}

export interface RenderedSlide {
  slideNumber: number;
  pngPath: string;
}

const DEFAULT_DPI = 150;
const DEFAULT_TIMEOUT_MS = 60_000;

let queue: PQueue | null = null;
function getQueue(): PQueue {
  if (queue) return queue;
  const raw = Number(process.env.LIBREOFFICE_CONCURRENCY);
  const concurrency = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
  queue = new PQueue({ concurrency });
  return queue;
}

/** Tracks per-job work directories so `cleanupRenderJob` can remove them. */
const jobWorkDirs = new Map<string, string>();

/** Path inside the job work dir used for the source PPTX. */
const PPTX_FILENAME = 'input.pptx';
/** Stem (no extension) passed to pdftoppm; outputs become `slide-1.png`, etc. */
const PNG_STEM = 'slide';

/**
 * Convert a PPTX buffer to one PNG per slide via `soffice --convert-to pdf`
 * followed by `pdftoppm -png`. The PNG paths are returned in slide order.
 *
 * The work directory is intentionally **left in place** so callers can read
 * the PNGs; invoke `cleanupRenderJob(jobId)` once you are done.
 */
export async function renderPptxToPngs(
  pptxBuf: Buffer,
  opts: RenderOptions,
): Promise<RenderedSlide[]> {
  const { jobId } = opts;
  const dpi = opts.dpi ?? DEFAULT_DPI;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (!jobId || /[\\/]/.test(jobId)) {
    throw new Error('renderPptxToPngs: jobId is required and must not contain path separators');
  }

  const workDir = await fs.mkdtemp(path.join(tmpdir(), `job-${jobId}-`));
  jobWorkDirs.set(jobId, workDir);

  const pptxPath = path.join(workDir, PPTX_FILENAME);
  await fs.writeFile(pptxPath, pptxBuf);

  // Each soffice run gets its own UserInstallation profile to side-step the
  // UNO singleton lock (DD-19). pdftoppm has no such requirement.
  const loProfile = path.join(workDir, 'lo-profile');
  await fs.mkdir(loProfile, { recursive: true });
  const loProfileUri = `file://${loProfile.replace(/\\/g, '/')}`;

  await getQueue().add(async () => {
    await runSubprocess(
      'soffice',
      [
        '--headless',
        `-env:UserInstallation=${loProfileUri}`,
        '--convert-to',
        'pdf',
        '--outdir',
        workDir,
        pptxPath,
      ],
      { timeoutMs, cwd: workDir },
    );

    const pdfPath = path.join(workDir, 'input.pdf');
    await runSubprocess(
      'pdftoppm',
      ['-png', '-r', String(dpi), pdfPath, path.join(workDir, PNG_STEM)],
      { timeoutMs, cwd: workDir },
    );
  });

  // Enumerate output PNGs. pdftoppm emits `<stem>-<n>.png` (or `<stem>-01.png`
  // depending on padding); we sort numerically by the trailing index.
  const entries = await fs.readdir(workDir);
  const slides = entries
    .filter((name) => name.startsWith(`${PNG_STEM}-`) && name.endsWith('.png'))
    .map((name) => {
      const match = name.match(/-(\d+)\.png$/);
      const slideNumber = match ? Number(match[1]) : Number.NaN;
      return { slideNumber, pngPath: path.join(workDir, name) };
    })
    .filter((s) => Number.isFinite(s.slideNumber))
    .sort((a, b) => a.slideNumber - b.slideNumber);

  return slides;
}

/**
 * Remove the work directory created for `jobId`. Safe to call multiple times
 * and safe to call for unknown ids (no-op).
 */
export async function cleanupRenderJob(jobId: string): Promise<void> {
  const workDir = jobWorkDirs.get(jobId);
  if (!workDir) return;
  jobWorkDirs.delete(jobId);
  try {
    await fs.rm(workDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup — leftover files in /tmp will be reaped by the OS.
  }
}

interface SubprocessOptions {
  timeoutMs: number;
  cwd: string;
}

function runSubprocess(
  command: string,
  args: string[],
  opts: SubprocessOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), opts.timeoutMs);

    let stderr = '';
    let timedOut = false;

    const child = spawn(command, args, {
      cwd: opts.cwd,
      signal: ac.signal,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    ac.signal.addEventListener(
      'abort',
      () => {
        timedOut = true;
        // `signal` causes spawn to send SIGTERM; force SIGKILL to make
        // sure a hung LibreOffice/pdftoppm releases its locks.
        try {
          child.kill('SIGKILL');
        } catch {
          // child may already be exiting; ignore
        }
      },
      { once: true },
    );

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`${command} timed out after ${opts.timeoutMs}ms`));
        return;
      }
      if (code === 0) {
        resolve();
      } else {
        const tail = stderr.trim().slice(-500);
        reject(new Error(`${command} exited with code ${code}${tail ? `: ${tail}` : ''}`));
      }
    });
  });
}
