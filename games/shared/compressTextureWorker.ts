/// <reference lib="webworker" />
/**
 * One Basis encode per message, off the compressor's main thread: the wasm encoder is
 * single-threaded, so `compressTextures.ts` runs a pool of these.
 */
import { decodeImage, encodeKtx2, type EncodeJob } from "./compressTextures";

// The wasm encoder prints a progress line per mip level through console.log.
console.log = () => {};

declare const self: Worker;

self.onmessage = async (event: MessageEvent<{ id: number; job: EncodeJob }>) => {
  const { id, job } = event.data;
  try {
    const out = await encodeKtx2(job, decodeImage);
    self.postMessage({ id, out }, out === null ? [] : [out.buffer]);
  } catch (error) {
    self.postMessage({ id, out: null, error: error instanceof Error ? error.message : String(error) });
  }
};
