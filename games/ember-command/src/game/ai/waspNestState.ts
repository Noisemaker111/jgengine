import { WASP_SORTIE_FIRST } from "../tuning";

/** The paper wasp nest's sortie clock, kept on the session (see `waspNest.ts`). */
export interface WaspNestState {
  /** Battle second the next sortie launches. */
  nextAt: number;
  /** Wasps this nest has on the wing. */
  wing: string[];
  launched: number;
}

export function createWaspNestState(): WaspNestState {
  return { nextAt: WASP_SORTIE_FIRST, wing: [], launched: 0 };
}
