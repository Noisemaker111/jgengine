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
  /** Marauder reinforcement pressure: waves mustered so far, and whole seconds to the next one. */
  wavesSent: number;
  nextWaveIn: number;
  /** Units currently queued/training at the Town Hall, and the active job's 0..1 progress. */
  producing: number;
  trainProgress: number;
  /** A Barracks exists (unlocks Footman/Rifleman), and any building armed for placement. */
  hasBarracks: boolean;
  buildArmed: string | null;
  building: number;
  /** Research: achieved rank and achieved+pending "have" per upgrade, plus jobs in the queue. */
  weaponsRank: number;
  weaponsHave: number;
  armorRank: number;
  armorHave: number;
  researching: number;
  /** Hero: current level, whether Thunder Clap can fire, and whole seconds left on its cooldown. */
  heroLevel: number;
  abilityReady: boolean;
  abilityCd: number;
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
  wavesSent: 0,
  nextWaveIn: 0,
  producing: 0,
  trainProgress: 0,
  hasBarracks: false,
  buildArmed: null,
  building: 0,
  weaponsRank: 0,
  weaponsHave: 0,
  armorRank: 0,
  armorHave: 0,
  researching: 0,
  heroLevel: 1,
  abilityReady: false,
  abilityCd: 0,
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
    p.wavesSent !== next.wavesSent ||
    p.nextWaveIn !== next.nextWaveIn ||
    p.producing !== next.producing ||
    Math.abs(p.trainProgress - next.trainProgress) > 0.02 ||
    p.hasBarracks !== next.hasBarracks ||
    p.buildArmed !== next.buildArmed ||
    p.building !== next.building ||
    p.weaponsRank !== next.weaponsRank ||
    p.weaponsHave !== next.weaponsHave ||
    p.armorRank !== next.armorRank ||
    p.armorHave !== next.armorHave ||
    p.researching !== next.researching ||
    p.heroLevel !== next.heroLevel ||
    p.abilityReady !== next.abilityReady ||
    p.abilityCd !== next.abilityCd
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
