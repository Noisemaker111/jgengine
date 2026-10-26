/// <reference path="./decoderUrls.ts" />
import basisTranscoderJs from "three/examples/jsm/libs/basis/basis_transcoder.js?url";
import basisTranscoderWasm from "three/examples/jsm/libs/basis/basis_transcoder.wasm?url";
import dracoDecoderJs from "three/examples/jsm/libs/draco/draco_decoder.js?url";
import dracoDecoderWasm from "three/examples/jsm/libs/draco/draco_decoder.wasm?url";
import dracoWasmWrapper from "three/examples/jsm/libs/draco/draco_wasm_wrapper.js?url";

/**
 * The Basis (KTX2) transcoder and Draco decoder ship with the game's own build: the bundler emits
 * three's copies of them as assets (`?url`), so a game never fetches a decoder from a CDN and the
 * decoder always matches the three.js the loaders come from. `modelLoad.ts` imports this module
 * only when a loader first needs a decoder, so a plain Node import of the engine never meets the
 * bundler-only `?url` specifiers.
 * @internal
 */
export const DECODER_FILES: Readonly<Record<string, string>> = {
  "basis_transcoder.js": basisTranscoderJs,
  "basis_transcoder.wasm": basisTranscoderWasm,
  "draco_decoder.js": dracoDecoderJs,
  "draco_decoder.wasm": dracoDecoderWasm,
  "draco_wasm_wrapper.js": dracoWasmWrapper,
};
