import { seededStreams } from "@jgengine/core/random/rng";
import type { GameIconName } from "@jgengine/react/gameIcons";

import { GLYPH_POOL, type BoardSizeDef, type BoardSizeId } from "./catalog";

export type CardDef = {
  readonly pairId: number;
  readonly glyph: GameIconName;
};

export type Board = {
  readonly sizeId: BoardSizeId;
  readonly rows: number;
  readonly cols: number;
  readonly pairCount: number;
  readonly cards: readonly CardDef[];
};

function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = result[i] as T;
    result[i] = result[j] as T;
    result[j] = swap;
  }
  return result;
}

export function dealBoard(seed: string, size: BoardSizeDef): Board {
  const streams = seededStreams(`memory-match:${seed}:${size.id}`);
  const glyphs = shuffled(GLYPH_POOL, streams("glyphs")).slice(0, size.pairCount);
  const pairs = glyphs.flatMap((glyph, pairId): CardDef[] => [
    { pairId, glyph },
    { pairId, glyph },
  ]);
  return {
    sizeId: size.id,
    rows: size.rows,
    cols: size.cols,
    pairCount: size.pairCount,
    cards: shuffled(pairs, streams("deal")),
  };
}
