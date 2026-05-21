/**
 * In-process quality verdict cache for the async PPTX quality gate.
 *
 * Populated by the PPTX route's fire-and-forget background task; read by
 * the GET /api/skills/pptx/quality/[jobId] poller. Entries expire after
 * `TTL_MS` so old jobs don't accumulate on a long-lived process.
 *
 * NOTE (follow-on WI-01): This is process-local. Move to a shared store
 * before scaling out beyond a single replica.
 */

import type { QualityVerdict } from '@/infrastructure/image/image-comparator';

export interface PerSlideQuality {
  slideNumber: number;
  diffPixelRatio: number;
  phashDistance: number;
  verdict: QualityVerdict;
}

export interface QualityState {
  status: 'pending' | 'done' | 'error';
  verdict?: QualityVerdict;
  perSlide?: PerSlideQuality[];
  error?: string;
  updatedAt: number;
}

const TTL_MS = 60 * 60 * 1000; // 1 hour
const PURGE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const store = new Map<string, QualityState>();

let purgeTimer: ReturnType<typeof setInterval> | null = null;
function ensurePurgeTimer(): void {
  if (purgeTimer || typeof setInterval === 'undefined') return;
  purgeTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of store) {
      if (now - entry.updatedAt > TTL_MS) {
        store.delete(id);
      }
    }
  }, PURGE_INTERVAL_MS);
  if (typeof purgeTimer.unref === 'function') purgeTimer.unref();
}

export function setQualityVerdict(
  jobId: string,
  state: Omit<QualityState, 'updatedAt'>,
): void {
  ensurePurgeTimer();
  store.set(jobId, { ...state, updatedAt: Date.now() });
}

export function getQualityVerdict(jobId: string): QualityState | null {
  const entry = store.get(jobId);
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > TTL_MS) {
    store.delete(jobId);
    return null;
  }
  return entry;
}

/** Test-only helper. */
export function clearQualityCache(): void {
  store.clear();
}
