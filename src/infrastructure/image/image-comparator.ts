/**
 * Infrastructure Layer: image comparator for the async quality gate.
 *
 * Compares the original AI-generated slide image against the LibreOffice
 * rasterization of the regenerated PPTX. Uses two indicators so a single
 * noisy metric doesn't dominate the verdict (Option B research §C):
 *
 *   - `diffPixelRatio`: pixelmatch's per-pixel diff count, normalized.
 *   - `phashDistance`:  Hamming distance between 64-bit perceptual hashes.
 *
 * Thresholds are initial values from the SKILL reference; they need to be
 * recalibrated against real traffic (tracked as a follow-on WI).
 */

import { promises as fs } from 'node:fs';

import pixelmatch from 'pixelmatch';
import sharp from 'sharp';
import phash from 'sharp-phash';
import phashDistance from 'sharp-phash/distance';

export interface ComparisonResult {
  diffPixelRatio: number;
  phashDistance: number;
}

export type QualityVerdict = 'pass' | 'warn' | 'fail';

const PASS_DIFF_RATIO = 0.12;
const PASS_PHASH_DISTANCE = 10;
const WARN_DIFF_RATIO = 0.15;
const WARN_PHASH_DISTANCE = 14;

/** Width (px) used when aligning the two images before pixelmatch. */
const ALIGN_WIDTH = 1024;

/**
 * Compute pixel-diff ratio and perceptual hash distance between two PNGs.
 *
 * Both inputs are first resized to a common width (preserving aspect
 * ratio) so pixelmatch sees identical dimensions even if the rendered
 * PPTX has a different intrinsic resolution.
 */
export async function compareImages(
  originalPath: string,
  renderedPath: string,
): Promise<ComparisonResult> {
  const [originalBuf, renderedBuf] = await Promise.all([
    fs.readFile(originalPath),
    fs.readFile(renderedPath),
  ]);

  const [originalRaw, renderedRaw] = await Promise.all([
    alignToRaw(originalBuf),
    alignToRaw(renderedBuf),
  ]);

  const width = originalRaw.info.width;
  const height = originalRaw.info.height;
  // alignToRaw forces both to ALIGN_WIDTH but the height (derived from each
  // image's aspect ratio) may differ. Take the min height so pixelmatch sees
  // matching dimensions, and crop the taller buffer to the same row count.
  const commonHeight = Math.min(height, renderedRaw.info.height);
  const croppedOriginal = cropRgba(originalRaw.data, width, height, commonHeight);
  const croppedRendered = cropRgba(
    renderedRaw.data,
    renderedRaw.info.width,
    renderedRaw.info.height,
    commonHeight,
  );

  const diffBuf = Buffer.alloc(width * commonHeight * 4);
  const diffPixels = pixelmatch(
    croppedOriginal,
    croppedRendered,
    diffBuf,
    width,
    commonHeight,
    { threshold: 0.1 },
  );
  const diffPixelRatio = diffPixels / (width * commonHeight);

  const [hashA, hashB] = await Promise.all([phash(originalBuf), phash(renderedBuf)]);
  const distance = phashDistance(hashA, hashB);

  return { diffPixelRatio, phashDistance: distance };
}

/**
 * Map a comparison result onto a coarse verdict bucket. Higher is worse
 * for both metrics; we require BOTH to satisfy a tier's thresholds.
 */
export function evaluateQuality(metrics: ComparisonResult): QualityVerdict {
  const { diffPixelRatio, phashDistance: distance } = metrics;
  if (diffPixelRatio <= PASS_DIFF_RATIO && distance <= PASS_PHASH_DISTANCE) {
    return 'pass';
  }
  if (diffPixelRatio <= WARN_DIFF_RATIO && distance <= WARN_PHASH_DISTANCE) {
    return 'warn';
  }
  return 'fail';
}

async function alignToRaw(buf: Buffer): Promise<{
  data: Buffer;
  info: { width: number; height: number };
}> {
  const result = await sharp(buf)
    .resize({ width: ALIGN_WIDTH, fit: 'inside', withoutEnlargement: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: result.data, info: { width: result.info.width, height: result.info.height } };
}

function cropRgba(
  data: Buffer,
  width: number,
  height: number,
  targetHeight: number,
): Buffer {
  if (height === targetHeight) return data;
  const bytes = width * targetHeight * 4;
  return data.subarray(0, bytes);
}
