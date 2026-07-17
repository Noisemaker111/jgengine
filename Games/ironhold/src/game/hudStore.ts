/** A tiny external store the HUD subscribes to via `useSyncExternalStore`. Systems snapshot live
 * counts into it a few times a second; the death handler stamps the final outcome. Kept separate
 * from `session` so React reads an immutable snapshot and only re-renders when a field changes. */

export type MatchPhase = "playing" | "won" | "lost";

export interface HudSnapshot {
  phase: MatchPhase;
  gold: number;
  playerUnits: number;
  enemyUnits: number;
  enemyKeepHp: number;
  enemyKeepMax: number;
  playerKeepHp: number;
  playerKeepMax: number;
  attackMoveArmed: boolean;
}

const initial: HudSnapshot = {
  phase: "playing",
  gold: 0,
  playerUnits: 0,
  enemyUnits: 0,
  enemyKeepHp: 0,
  enemyKeepMax: 1,
  playerKeepHp: 0,
  playerKeepMax: 1,
  attackMoveArmed: false,
};

let snapshot: HudSnapshot = initial;
const listeners = new Set<() => void>();

function changed(next: HudSnapshot): boolean {
  const p = snapshot;
  return (
    p.phase !== next.phase ||
    p.gold !== next.gold ||
    p.playerUnits !== next.playerUnits ||
    p.enemyUnits !== next.enemyUnits ||
    p.enemyKeepHp !== next.enemyKeepHp ||
    p.playerKeepHp !== next.playerKeepHp ||
    p.attackMoveArmed !== next.attackMoveArmed
  );
}

export const hudStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get(): HudSnapshot {
    return snapshot;
  },
  set(patch: Partial<HudSnapshot>): void {
    const next = { ...snapshot, ...patch };
    if (!changed(next)) return;
    snapshot = next;
    for (const listener of listeners) listener();
  },
  reset(): void {
    snapshot = initial;
    for (const listener of listeners) listener();
  },
};
