/**
 * Infrastructure Layer: In-memory Image Cache
 *
 * Stores generated image binaries keyed by a random UUID so they can be
 * served by the `/api/skills/image/[id]` route without round-tripping
 * through the LLM or the client.
 *
 * NOTE (follow-on WI-01): This is process-local and therefore unsuitable
 * for multi-instance deployments. Replace with Azure Blob Storage (or
 * equivalent durable store) before scaling out the Container App beyond
 * a single replica.
 */

import { randomUUID } from 'node:crypto';

interface CacheEntry {
  data: Buffer;
  mimeType: string;
  createdAt: number;
}

const TTL_MS = 60 * 60 * 1000; // 1 hour
const PURGE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Pin the cache to globalThis so HMR / Next.js per-route module isolation
// in dev mode doesn't give different routes (chat tool vs image GET) their
// own empty Map instance. In production the module is loaded once anyway.
const GLOBAL_KEY = Symbol.for('copilot-sdk-agent.image-cache.store');
type GlobalWithStore = typeof globalThis & {
  [GLOBAL_KEY]?: Map<string, CacheEntry>;
};
const globalRef = globalThis as GlobalWithStore;
if (!globalRef[GLOBAL_KEY]) {
  globalRef[GLOBAL_KEY] = new Map<string, CacheEntry>();
}
const store: Map<string, CacheEntry> = globalRef[GLOBAL_KEY];

function purgeExpired(now: number = Date.now()): void {
  for (const [id, entry] of store) {
    if (now - entry.createdAt > TTL_MS) {
      store.delete(id);
    }
  }
}

// Schedule periodic purge. `unref()` keeps the timer from holding the
// event loop open during graceful shutdown.
let purgeTimer: ReturnType<typeof setInterval> | null = null;
function ensurePurgeTimer(): void {
  if (purgeTimer || typeof setInterval === 'undefined') {
    return;
  }
  purgeTimer = setInterval(() => purgeExpired(), PURGE_INTERVAL_MS);
  if (typeof purgeTimer.unref === 'function') {
    purgeTimer.unref();
  }
}

/** Store an image and return its newly minted id. */
export function putImage(data: Buffer, mimeType: string): string {
  ensurePurgeTimer();
  const id = randomUUID();
  store.set(id, { data, mimeType, createdAt: Date.now() });
  return id;
}

/** Retrieve an image by id, or `null` if not found / expired. */
export function getImage(id: string): { data: Buffer; mimeType: string } | null {
  const entry = store.get(id);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.createdAt > TTL_MS) {
    store.delete(id);
    return null;
  }
  return { data: entry.data, mimeType: entry.mimeType };
}

/** Test-only / shutdown helper. */
export function clearImageCache(): void {
  store.clear();
}
