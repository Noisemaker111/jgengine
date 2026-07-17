/** A tiny external store the HUD subscribes to via `useSyncExternalStore`. Systems snapshot live
 * counts into it a few times a second; the death handler stamps the final outcome. Kept separate
 * from `session` so React reads an immutable snapshot and only re-renders when a field changes. */

export type MatchPhase = "playing" | "won" | "lost";

export interface HudSnapshot {
  phase: MatchPhase;
  gold: number;
  lumber: number;
  foodUsed: number;
  foodCap: number;
  playerUnits: number;
  enemyUnits: number;
  enemyKeepHp: number;
  enemyKeepMax: number;
  playerKeepHp: number;
  playerKeepMax: number;
  attackMoveArmed: boolean;
  /** Units currently queued/training at the Town Hall, and the active job's 0..1 progress. */
  producing: number;
  trainProgress: number;
  /** A Barracks exists (unlocks Footman/Rifleman), and any building armed for placement. */
  hasBarracks: boolean;
  buildArmed: string | null;
  building: number;
}

const initial: HudSnapshot = {
  phase: "playing",
  gold: 0,
  lumber: 0,
  foodUsed: 0,
  foodCap: 0,
  playerUnits: 0,
  enemyUnits: 0,
  enemyKeepHp: 0,
  enemyKeepMax: 1,
  playerKeepHp: 0,
  playerKeepMax: 1,
  attackMoveArmed: false,
  producing: 0,
  trainProgress: 0,
  hasBarracks: false,
  buildArmed: null,
  building: 0,
};

let snapshot: HudSnapshot = initial;
const listeners = new Set<() => void>();

function changed(next: HudSnapshot): boolean {
  const p = snapshot;
  return (
    p.phase !== next.phase ||
    p.gold !== next.gold ||
    p.lumber !== next.lumber ||
    p.foodUsed !== next.foodUsed ||
    p.foodCap !== next.foodCap ||
    p.playerUnits !== next.playerUnits ||
    p.enemyUnits !== next.enemyUnits ||
    p.enemyKeepHp !== next.enemyKeepHp ||
    p.playerKeepHp !== next.playerKeepHp ||
    p.attackMoveArmed !== next.attackMoveArmed ||
    p.producing !== next.producing ||
    Math.abs(p.trainProgress - next.trainProgress) > 0.02 ||
    p.hasBarracks !== next.hasBarracks ||
    p.buildArmed !== next.buildArmed ||
    p.building !== next.building
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
