/**
 * Byte-identity for photos and photo sets.
 *
 * Photos were previously identified by array index (`photos: string[]`, keyed by `i`),
 * which is not an identity at all: removing photo 0 renumbers every other photo, so a
 * scan result computed for the old index 1 would be displayed against the new index 0.
 * Hashing the decoded bytes gives an identity that survives reordering, removal,
 * duplicate filenames, and re-selection of the same file.
 *
 * The set hash is what binds a ClientCondition to the exact photos that produced it —
 * the backend can then reject a condition that doesn't match the set being valued,
 * instead of trusting a client-supplied `photos_assessed` integer.
 */

/** Hex SHA-256 of raw bytes. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // `bytes.buffer` may be a pooled/oversized ArrayBuffer; slice to this view's exact
  // range so the digest covers the photo and nothing else. (The cast is because TS types
  // `.buffer` as ArrayBuffer|SharedArrayBuffer; these come from FileReader, never shared.)
  const view = (bytes.buffer as ArrayBuffer).slice(
    bytes.byteOffset, bytes.byteOffset + bytes.byteLength,
  );
  const digest = await crypto.subtle.digest("SHA-256", view);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Decode a `data:` URL to its raw bytes. Throws on anything that isn't one. */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || comma === -1) {
    throw new Error("not a data: URL");
  }
  const meta = dataUrl.slice(5, comma);
  if (!meta.includes(";base64")) {
    // The app only ever produces base64 via FileReader.readAsDataURL. A percent-encoded
    // data URL would hash differently for identical pixels, so refuse rather than
    // silently produce an identity that doesn't match the bytes.
    throw new Error("unsupported data: URL encoding (expected base64)");
  }
  const bin = atob(dataUrl.slice(comma + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** SHA-256 of a photo's decoded bytes — its stable identity. */
export function photoHash(dataUrl: string): Promise<string> {
  return sha256Hex(dataUrlToBytes(dataUrl));
}

/**
 * Identity of an ordered photo set: SHA-256 over the per-photo hashes joined by "\n".
 *
 * Order-sensitive by design. [A,B] and [B,A] are different sets because the condition
 * reports per-photo indices ("damage found in photo 2"), so a reorder invalidates the
 * mapping even though the pixels are unchanged. Duplicates are preserved for the same
 * reason — [A,A] is a two-photo set.
 */
export async function photoSetHash(dataUrls: readonly string[]): Promise<string> {
  const hashes = await Promise.all(dataUrls.map(photoHash));
  return sha256Hex(new TextEncoder().encode(hashes.join("\n")));
}

/** The set hash of zero photos — a constant, so "no photos" is still a checkable identity. */
export const EMPTY_PHOTO_SET_HASH = "empty";
