/** Minimal typings for `gifenc` (ships none): just the surface `scripts/gif.ts` uses. */
declare module "gifenc" {
  export interface GifEncoderInstance {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      opts?: {
        palette?: number[][];
        delay?: number;
        repeat?: number;
        transparent?: boolean;
        dispose?: number;
        first?: boolean;
      },
    ): void;
    finish(): void;
    bytes(): Uint8Array;
  }
  export function GIFEncoder(opts?: { auto?: boolean }): GifEncoderInstance;
  export function quantize(rgba: Uint8Array, maxColors: number, opts?: Record<string, unknown>): number[][];
  export function applyPalette(rgba: Uint8Array, palette: number[][], format?: string): Uint8Array;
}
