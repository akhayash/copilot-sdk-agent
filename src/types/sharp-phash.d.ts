/**
 * Ambient type declarations for `sharp-phash`.
 *
 * The package ships CJS without types. Default export is an async function
 * returning a 64-char binary string. The subpath `sharp-phash/distance`
 * exports a Hamming-distance helper.
 */

declare module 'sharp-phash' {
  /** Compute a 64-bit perceptual hash, returned as a 64-char binary string. */
  const phash: (image: Buffer | string) => Promise<string>;
  export default phash;
}

declare module 'sharp-phash/distance' {
  /** Hamming distance between two equal-length binary strings. */
  const distance: (a: string, b: string) => number;
  export default distance;
}
