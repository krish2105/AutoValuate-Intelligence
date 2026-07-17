/**
 * Tiny, redistribution-safe image fixtures for the CV tests.
 *
 * Synthetic rather than real car photos on purpose: the training data (CarDD/VehiDE) is
 * licensed for research and lives on Kaggle, so committing sample images would be both a
 * licensing problem and a 5 GB one. These exercise the plumbing — decode, hashing,
 * identity, state transitions, the wire format — which is what these tests assert. They
 * are NOT a substitute for accuracy evaluation, which needs the real dataset.
 *
 * The 2x1 image is deliberately non-square: the box overlay previously positioned
 * percentages against a square `object-cover` container, which is only correct at 1:1.
 */

// Generated with Pillow and verified to decode — NOT hand-written. An invalid PNG here is
// indistinguishable from a real "photo failed to decode", so a bogus fixture silently
// tests the partial-scan path instead of the one you meant to test.

/** 1x1 red PNG. */
export const PNG_1x1_RED =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";

/** 2x1 blue PNG — non-square, so aspect-ratio handling is actually exercised. */
export const PNG_2x1_BLUE =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGNkYPjPwMAAAAQKAQHOAd3hAAAAAElFTkSuQmCC";

/** 64x32 PNG — a realistic 2:1 landscape frame for overlay/letterbox behaviour. */
export const PNG_64x32 =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAIAAAAt/+nTAAAAUElEQVR4nNXOQREAIAzAsFIhCEMdUhGxB9coyNrnUiZxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEufvwNQDfiEBWKh8f0wAAAAASUVORK5CYII=";

/** A deliberately corrupt "image" — exercises the decode-failure / partial-scan path. */
export const CORRUPT_IMAGE = "bm90LWFuLWltYWdlLWF0LWFsbA==";

export interface UploadFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/**
 * Build Playwright `setInputFiles` payloads from base64 PNGs.
 *
 * Names are intentionally identical across calls: filename is NOT identity — two different
 * files can share a name, and the same file can be picked twice. Identity comes from the
 * bytes (lib/cv/hashes.ts).
 */
export function makeFiles(base64Pngs: string[]): UploadFile[] {
  return base64Pngs.map((b64, i) => ({
    name: `car-${i}.png`,
    mimeType: "image/png",
    buffer: Buffer.from(b64, "base64"),
  }));
}
