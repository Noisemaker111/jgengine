export interface SnapshotUnit {
  id: string;
  stats: Readonly<Record<string, number>>;
}

export interface BoardSnapshot {
  ownerId: string;
  units: readonly SnapshotUnit[];
  stats: Readonly<Record<string, number>>;
  seed: number;
  capturedAt: number;
}

export interface SerializeBoardArgs {
  ownerId: string;
  units: readonly SnapshotUnit[];
  stats?: Readonly<Record<string, number>>;
  seed?: number;
  capturedAt?: number;
}

function cloneStats(stats: Readonly<Record<string, number>>): Record<string, number> {
  return { ...stats };
}

/** @internal */
export function serializeBoard(args: SerializeBoardArgs): BoardSnapshot {
  return {
    ownerId: args.ownerId,
    units: args.units.map((unit) => ({ id: unit.id, stats: cloneStats(unit.stats) })),
    stats: cloneStats(args.stats ?? {}),
    seed: args.seed ?? 0,
    capturedAt: args.capturedAt ?? 0,
  };
}

/** @internal */
export function cloneSnapshot(snapshot: BoardSnapshot): BoardSnapshot {
  return serializeBoard({
    ownerId: snapshot.ownerId,
    units: snapshot.units,
    stats: snapshot.stats,
    seed: snapshot.seed,
    capturedAt: snapshot.capturedAt,
  });
}

export interface CombatRules {
  attackStat: string;
  healthStat: string;
  maxRounds?: number;
  critChance?: number;
  critMultiplier?: number;
}

export type CombatSide = "a" | "b" | "draw";

export interface ReplayBlow {
  round: number;
  attacker: CombatSide;
  attackerUnit: string;
  defenderUnit: string;
  damage: number;
  crit: boolean;
  defenderHealthAfter: number;
}

export interface ReplayResult {
  winner: CombatSide;
  rounds: number;
  blows: readonly ReplayBlow[];
  survivorsA: readonly string[];
  survivorsB: readonly string[];
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface LiveUnit {
  id: string;
  attack: number;
  health: number;
}

function toLive(snapshot: BoardSnapshot, rules: CombatRules): LiveUnit[] {
  return snapshot.units.map((unit) => ({
    id: unit.id,
    attack: unit.stats[rules.attackStat] ?? 0,
    health: unit.stats[rules.healthStat] ?? 0,
  }));
}

/** @internal */
export function replayCombat(a: BoardSnapshot, b: BoardSnapshot, rules: CombatRules): ReplayResult {
  const maxRounds = rules.maxRounds ?? 100;
  const critChance = rules.critChance ?? 0;
  const critMultiplier = rules.critMultiplier ?? 2;
  const prng = mulberry32((a.seed ^ (b.seed * 0x9e3779b1)) >>> 0);

  const liveA = toLive(a, rules);
  const liveB = toLive(b, rules);
  const blows: ReplayBlow[] = [];

  let indexA = 0;
  let indexB = 0;
  let rounds = 0;

  const strike = (
    round: number,
    attacker: CombatSide,
    attackers: LiveUnit[],
    attackerIndex: number,
    defenders: LiveUnit[],
  ): void => {
    const source = attackers[attackerIndex]!;
    const target = defenders[0]!;
    const crit = critChance > 0 && prng() < critChance;
    const damage = crit ? Math.round(source.attack * critMultiplier) : source.attack;
    target.health -= damage;
    blows.push({
      round,
      attacker,
      attackerUnit: source.id,
      defenderUnit: target.id,
      damage,
      crit,
      defenderHealthAfter: target.health,
    });
    if (target.health <= 0) defenders.shift();
  };

  while (liveA.length > 0 && liveB.length > 0 && rounds < maxRounds) {
    rounds += 1;
    strike(rounds, "a", liveA, indexA % liveA.length, liveB);
    if (liveB.length === 0) break;
    strike(rounds, "b", liveB, indexB % liveB.length, liveA);
    indexA += 1;
    indexB += 1;
  }

  const winner: CombatSide =
    liveA.length > 0 && liveB.length === 0
      ? "a"
      : liveB.length > 0 && liveA.length === 0
        ? "b"
        : "draw";

  return {
    winner,
    rounds,
    blows,
    survivorsA: liveA.map((u) => u.id),
    survivorsB: liveB.map((u) => u.id),
  };
}
