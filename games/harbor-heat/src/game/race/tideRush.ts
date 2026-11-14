import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import { RACE_ROUTES } from "../world/districts";

/**
 * The Tide Rush ladder: the four circuits open one at a time. The Ocean Loop is open from the start;
 * winning a circuit for the first time opens the next. The start-line prompt and `race.start` only offer
 * open circuits; the gig board's street races are side bets and run anywhere.
 */
export const CIRCUIT_ORDER = ["race-loop", "race-harbor", "race-heights", "race-coast"] as const;

export interface TideRushState {
  /** Circuits won at least once, in the order they were first won. */
  won: string[];
}

export const tideRushStore = defineStore<TideRushState>("harbor.tideRush", () => ({ won: [] }));

/** The circuits open now: the first, and the one after each circuit won. */
export function openCircuits(won: readonly string[]): string[] {
  const open: string[] = [CIRCUIT_ORDER[0]];
  CIRCUIT_ORDER.forEach((id, index) => {
    const next = CIRCUIT_ORDER[index + 1];
    if (won.includes(id) && next !== undefined && !open.includes(next)) open.push(next);
  });
  return open;
}

export function circuitOpen(ctx: GameContext, routeId: string): boolean {
  return openCircuits(tideRushStore.read(ctx).won).includes(routeId);
}

/** Record a win; returns the circuit it opened, or null. */
export function recordTideRushWin(ctx: GameContext, routeId: string): string | null {
  const state = tideRushStore.read(ctx);
  if (state.won.includes(routeId)) return null;
  const before = openCircuits(state.won);
  const won = [...state.won, routeId];
  tideRushStore.write(ctx, { won });
  return openCircuits(won).find((id) => !before.includes(id)) ?? null;
}

/** The route whose start line is nearest a point, and how far it is. */
export function nearestStart(x: number, z: number): { id: string; label: string; distance: number } | null {
  let best: { id: string; label: string; distance: number } | null = null;
  for (const route of RACE_ROUTES) {
    const start = route.checkpoints.at(-1);
    if (start === undefined) continue;
    const distance = Math.hypot(start[0] - x, start[1] - z);
    if (best === null || distance < best.distance) best = { id: route.id, label: route.label, distance };
  }
  return best;
}

export const circuitLabel = (id: string): string => RACE_ROUTES.find((route) => route.id === id)?.label ?? id;
