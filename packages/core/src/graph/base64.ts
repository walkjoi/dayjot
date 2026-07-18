/**
 * Base64 codecs for asset bytes crossing the bridge — `readAsset` and
 * `writeAsset` carry file contents as base64 strings, and these helpers are
 * the one blessed pair for turning real bytes into that wire form and back.
 */

/** Encode bytes chunk-wise — `String.fromCharCode(...bytes)` overflows the
 * argument limit on large recordings. */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK_SIZE))
  }
  return btoa(binary)
}

/** Decode {@link bytesToBase64}'s output (a stored asset read back). */
export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}
