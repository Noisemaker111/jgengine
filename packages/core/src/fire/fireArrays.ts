// @skill jgengine-world
import { base64ToBytes, bytesToBase64 } from "../plants/growth/growthState";

/**
 * Encode a typed array's bytes as base64 for a JSON snapshot.
 *
 * @capability fire-snapshot-arrays base64 typed-array codec for fire and fuel moisture snapshots
 */
export function encodeFireArray(array: { buffer: ArrayBufferLike; byteOffset: number; byteLength: number }): string {
  return bytesToBase64(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
}

/**
 * Decode base64 from {@link encodeFireArray} into a typed array of the same byte length.
 *
 * @capability fire-snapshot-arrays-decode restore a typed array from a fire snapshot's base64
 */
export function decodeFireArray(text: string, target: Float64Array | Float32Array | Uint8Array, name: string): void {
  const bytes = base64ToBytes(text);
  if (bytes.byteLength !== target.byteLength) throw new Error(`fire snapshot ${name} has the wrong size`);
  new Uint8Array(target.buffer, target.byteOffset, target.byteLength).set(bytes);
}
