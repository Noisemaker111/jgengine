import { seededRng } from "@jgengine/core/random/rng";

import { PAD_COUNT, type PadIndex } from "./catalog";

export function sequencePads(seed: string, length: number): readonly PadIndex[] {
  const rng = seededRng(`echo-lights:${seed}`);
  const pads: PadIndex[] = [];
  for (let i = 0; i < length; i += 1) {
    pads.push(Math.min(PAD_COUNT - 1, Math.floor(rng() * PAD_COUNT)) as PadIndex);
  }
  return pads;
}
