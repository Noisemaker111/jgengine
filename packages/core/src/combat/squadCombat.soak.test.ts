import { describe, expect, test } from "bun:test";
import {
  createCoverField,
  createSquadCombat,
  threatsFromMemory,
  type CoverSolid,
  type SquadComposition,
  type SquadMemberSpec,
} from "@jgengine/core/combat";
import { createNavCrowd, createNavRuntime, createPerception, type NavMeshData } from "@jgengine/core/world";

/**
 * The B2.1 acceptance run: 2 raiders against 4 wardens in an authored arena. The wardens are driven
 * by the squad AI; the raiders are scripted pressure. Exposure is measured from live positions every
 * tick against the walls themselves, not from anything the AI reports.
 */

const COLS = 26;
const ROWS = 16;
const DT = 1 / 30;
const DURATION = 90;
const LIMIT = 3;

function box(x0: number, x1: number, z0: number, z1: number): CoverSolid {
  return { center: [(x0 + x1) / 2, 1, (z0 + z1) / 2], halfExtents: [(x1 - x0) / 2, 1, (z1 - z0) / 2] };
}

const WALLS: readonly CoverSolid[] = [
  box(5, 9, 3, 5),
  box(5, 9, 10, 12),
  box(12, 14, 5, 10),
  box(9, 12, 7, 9),
  box(16, 20, 2, 4),
  box(16, 20, 11, 13),
  box(18, 20, 4, 7),
  box(2, 4, 6, 11),
];

/** Segment against the authored boxes on the XZ plane; touching a face without entering it is clear. */
function blocked(from: readonly [number, number, number], to: readonly [number, number, number]): boolean {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  for (const solid of WALLS) {
    const minX = solid.center[0] - solid.halfExtents[0];
    const maxX = solid.center[0] + solid.halfExtents[0];
    const minZ = solid.center[2] - solid.halfExtents[2];
    const maxZ = solid.center[2] + solid.halfExtents[2];
    let near = 0;
    let far = 1;
    if (Math.abs(dx) < 1e-9) {
      if (from[0] < minX || from[0] > maxX) continue;
    } else {
      let a = (minX - from[0]) / dx;
      let b = (maxX - from[0]) / dx;
      if (a > b) [a, b] = [b, a];
      near = Math.max(near, a);
      far = Math.min(far, b);
      if (near > far) continue;
    }
    if (Math.abs(dz) < 1e-9) {
      if (from[2] < minZ || from[2] > maxZ) continue;
    } else {
      let a = (minZ - from[2]) / dz;
      let b = (maxZ - from[2]) / dz;
      if (a > b) [a, b] = [b, a];
      near = Math.max(near, a);
      far = Math.min(far, b);
      if (near > far) continue;
    }
    if (far > 1e-4) return true;
  }
  return false;
}

function arena(): NavMeshData {
  const solidAt = (x: number, z: number): boolean =>
    WALLS.some((solid) => Math.abs(x - solid.center[0]) <= solid.halfExtents[0] && Math.abs(z - solid.center[2]) <= solid.halfExtents[2]);
  const verts: number[] = [];
  for (let r = 0; r <= ROWS; r += 1) for (let c = 0; c <= COLS; c += 1) verts.push(c, 0, r);
  const polys: number[][] = [];
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if (solidAt(c + 0.5, r + 0.5)) continue;
      const a = r * (COLS + 1) + c;
      polys.push([a, a + 1, a + COLS + 2, a + COLS + 1]);
    }
  }
  return { verts, polys, links: [] };
}

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const DEFENDER_HEALTH = 220;
const RAIDER_HEALTH = 1600;
const DEFENDER_DAMAGE = 4;
const RAIDER_DAMAGE = 5;
const DEFENDER_ACCURACY = 0.55;
const RAIDER_ACCURACY = 0.5;
const RAIDER_INTERVAL = 1.1;
const RAIDER_STANDOFF = 8;

const COMPOSITION: SquadComposition = {
  roles: [
    { id: "assault", count: 2, preferredRange: 5, retreatBelow: 0.35, discipline: { fireInterval: 0.65 } },
    { id: "support", count: 1, preferredRange: 12, retreatBelow: 0.4, holdCover: true, discipline: { fireInterval: 0.55 } },
    { id: "flanker", count: 1, preferredRange: 7, flankAngle: 1.3, retreatBelow: 0.4, cover: { near: 0.1 }, discipline: { fireInterval: 0.65 } },
  ],
};

interface Sampled {
  worst: number;
  over: number;
  spells: number;
  underFireSeconds: number;
  /** Consecutive seconds in the open — the spell being measured right now. */
  current: number;
  /** The current spell already crossed the limit, so it is counted once. */
  flagged: boolean;
}

function sample(visible: boolean, entry: Sampled): void {
  if (!visible) {
    if (entry.current > 0) entry.flagged = false;
    entry.current = 0;
    return;
  }
  if (entry.current === 0) entry.spells += 1;
  entry.current += DT;
  entry.underFireSeconds += DT;
  if (entry.current > entry.worst) entry.worst = entry.current;
  if (entry.current > LIMIT && !entry.flagged) {
    entry.flagged = true;
    entry.over += 1;
  }
}

function runSoak(seed = 2038): {
  defenders: Map<string, Sampled>;
  raiders: Map<string, Sampled>;
  hits: { defenderHits: number; raiderHits: number };
  shots: { defender: number; raider: number };
  ticks: number;
  tickMs: { p50: number; p95: number; max: number };
  runtime: ReturnType<ReturnType<typeof createSquadCombat>["stats"]>;
  ragents: number;
  offMesh: number;
  survivors: { defenders: number; raiders: number };
} {
  const nav = createNavRuntime({ mesh: arena() });
  const cover = createCoverField({ solids: WALLS, walkable: (point) => nav.findPolygon(point) !== null });
  const rng = seeded(seed);

  const defenders: SquadMemberSpec[] = [
    { id: "w1", team: "wardens", position: [22, 0, 4], health: DEFENDER_HEALTH / DEFENDER_HEALTH },
    { id: "w2", team: "wardens", position: [22, 0, 8], health: 1 },
    { id: "w3", team: "wardens", position: [22, 0, 12], health: 1 },
    { id: "w4", team: "wardens", position: [24, 0, 6], health: 1 },
  ];
  const raiders = [
    { id: "r1", position: [1, 0, 6] as [number, number, number] },
    { id: "r2", position: [1, 0, 10] as [number, number, number] },
  ];
  const team = new Map<string, string>([
    ...defenders.map((entry) => [entry.id, "wardens"] as [string, string]),
    ...raiders.map((entry) => [entry.id, "raiders"] as [string, string]),
  ]);
  const health = new Map<string, number>([
    ...defenders.map((entry) => [entry.id, DEFENDER_HEALTH] as [string, number]),
    ...raiders.map((entry) => [entry.id, RAIDER_HEALTH] as [string, number]),
  ]);
  const samples = new Map<string, Sampled>();
  for (const id of [...defenders, ...raiders].map((entry) => entry.id)) {
    samples.set(id, { worst: 0, over: 0, spells: 0, underFireSeconds: 0, current: 0, flagged: false });
  }
  const hits = { defenderHits: 0, raiderHits: 0 };
  const shots = { defender: 0, raider: 0 };

  let nowMs = 0;
  const perception = createPerception({
    sightRange: 30,
    // A firefight has overlapping awareness: every warden watches every angle, so what one can be
    // shot from is what the squad knows about. Range, occlusion, decay and sharing stay real.
    sightConeDeg: 360,
    hearingRange: 34,
    memorySeconds: 5,
    isSegmentClear: (from, to) => !blocked(from, to),
    squadMates: (id) => (team.get(id) === "wardens" ? defenders.map((entry) => entry.id).filter((mate) => mate !== id) : []),
    maxSharesPerTick: 12,
  });

  function pushShot(shooterId: string, position: readonly [number, number, number]): void {
    perception.pushStimulus({ kind: "sound", sourceId: shooterId, position, loudness: 2, at: nowMs });
  }

  function resolve(shooterId: string, targetId: string, damage: number, accuracy: number): number {
    const shooter = positionOf(shooterId);
    pushShot(shooterId, shooter);
    if (rng() > accuracy) return 0;
    const remaining = Math.max(0, (health.get(targetId) ?? 0) - damage);
    health.set(targetId, remaining);
    // A damage stimulus carries the shooter's position: being hit is how a member learns about a
    // shooter it cannot see.
    perception.pushStimulus({ kind: "damage", sourceId: shooterId, position: shooter, at: nowMs });
    if (team.get(targetId) === "wardens") {
      hits.defenderHits += 1;
      combat.underFire(targetId);
    } else {
      hits.raiderHits += 1;
    }
    return damage;
  }

  const combat = createSquadCombat({
    nav,
    perception,
    cover,
    composition: COMPOSITION,
    members: defenders,
    teamOf: (id) => team.get(id) ?? null,
    healthOf: (id) => (health.get(id) ?? 0) / DEFENDER_HEALTH,
    blocked,
    engage: (memberId, targetId) => {
      shots.defender += 1;
      return resolve(memberId, targetId, DEFENDER_DAMAGE, DEFENDER_ACCURACY);
    },
    rng,
    devtoolsName: "soak.squadCombat",
  });

  const raiderCrowd = createNavCrowd({ nav, speed: 3.2, radius: 0.4, replanBudget: 4, replanMs: 1 });
  for (const raider of raiders) raiderCrowd.add(raider.id, { position: raider.position, goal: raider.position });
  const nextRaiderShot = new Map<string, number>(raiders.map((raider) => [raider.id, 0]));
  const raiderGoal = new Map<string, [number, number, number]>(raiders.map((raider) => [raider.id, raider.position]));

  function positionOf(id: string): [number, number, number] {
    const member = combat.member(id);
    if (member !== null) return [...member.position] as [number, number, number];
    const raider = raiderCrowd.agent(id);
    if (raider !== null) return [...raider.position] as [number, number, number];
    return [...(raiders.find((entry) => entry.id === id)?.position ?? [0, 0, 0])] as [number, number, number];
  }

  const aliveDefenders = (): string[] => defenders.map((entry) => entry.id).filter((id) => (health.get(id) ?? 0) > 0);
  const aliveRaiders = (): string[] => raiders.map((entry) => entry.id).filter((id) => (health.get(id) ?? 0) > 0);

  function observeAll(): void {
    const candidates = [...defenders.map((entry) => entry.id), ...raiders.map((entry) => entry.id)]
      .filter((id) => (health.get(id) ?? 0) > 0)
      .map((id) => ({ id, position: positionOf(id) as [number, number, number] }));
    for (const candidate of candidates) {
      const me = candidate.position;
      const view = combat.member(candidate.id);
      const heading = view?.target === null || view?.target === undefined
        ? candidates.find((other) => other.id !== candidate.id)?.position ?? me
        : view.targetPosition ?? me;
      perception.observe(
        { id: candidate.id, position: me, yaw: Math.atan2(heading[0] - me[0], heading[2] - me[2]) },
        candidates.filter((other) => other.id !== candidate.id),
        nowMs,
      );
    }
  }

  function driveRaiders(): void {
    for (const raider of raiders) {
      if ((health.get(raider.id) ?? 0) <= 0) {
        const parked = raiderGoal.get(raider.id)!;
        if (parked !== null) raiderCrowd.setGoal(raider.id, parked);
        continue;
      }
      const position = positionOf(raider.id);
      const memory = threatsFromMemory(perception, raider.id, nowMs, { max: 4, hostile: (id) => team.get(id) === "wardens" });
      const seen = memory.find((threat) => !blocked(position, threat.position));
      const target = aliveDefenders()
        .map((id) => ({ id, position: positionOf(id) }))
        .sort((a, b) => Math.hypot(a.position[0] - position[0], a.position[2] - position[2]) - Math.hypot(b.position[0] - position[0], b.position[2] - position[2]))[0];
      if (target !== undefined) {
        const distance = Math.hypot(target.position[0] - position[0], target.position[2] - position[2]);
        const lineOfFire = !blocked(position, target.position);
        // Raiders hold a shooting distance on the nearest warden. They never walk onto a warden:
        // staying at range is what makes cover mean anything.
        const bearing = Math.atan2(position[0] - target.position[0], position[2] - target.position[2]);
        const goal: [number, number, number] = [
          target.position[0] + Math.sin(bearing) * RAIDER_STANDOFF,
          0,
          target.position[2] + Math.cos(bearing) * RAIDER_STANDOFF,
        ];
        const previous = raiderGoal.get(raider.id)!;
        if (Math.hypot(goal[0] - previous[0], goal[2] - previous[2]) > 0.5) {
          raiderGoal.set(raider.id, goal);
          raiderCrowd.setGoal(raider.id, goal);
        }
        const engageTarget = seen ?? (distance <= 28 && !blocked(position, target.position) ? { id: target.id, position: target.position } : null);
        if (engageTarget !== null && nowMs >= (nextRaiderShot.get(raider.id) ?? 0)) {
          nextRaiderShot.set(raider.id, nowMs + RAIDER_INTERVAL * 1000);
          shots.raider += 1;
          resolve(raider.id, engageTarget.id, RAIDER_DAMAGE, RAIDER_ACCURACY);
        }
      }
    }
  }

  const tickSamples: number[] = [];
  let offMesh = 0;
  for (let tick = 0; tick < DURATION / DT; tick += 1) {
    const started = performance.now();
    nowMs += DT * 1000;
    observeAll();
    combat.tick(DT);
    driveRaiders();
    raiderCrowd.tick(DT);

    const attackers = aliveRaiders().map((id) => positionOf(id));
    for (const defender of defenders) {
      const id = defender.id;
      const entry = samples.get(id)!;
      if ((health.get(id) ?? 0) <= 0 || attackers.length === 0) {
        sample(false, entry);
        continue;
      }
      const position = positionOf(id);
      if (nav.findPolygon(position) === null) offMesh += 1;
      sample(attackers.some((attacker) => !blocked(attacker, position)), entry);
    }

    for (const raider of raiders) {
      const entry = samples.get(raider.id)!;
      if ((health.get(raider.id) ?? 0) <= 0) {
        sample(false, entry);
        continue;
      }
      const position = positionOf(raider.id);
      sample(aliveDefenders().some((id) => !blocked(positionOf(id), position)), entry);
    }
    tickSamples.push(performance.now() - started);
  }

  const sorted = [...tickSamples].sort((a, b) => a - b);
  const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]!;
  const pick = (ids: readonly string[]): Map<string, Sampled> =>
    new Map(ids.map((id) => [id, samples.get(id)!]));

  return {
    defenders: pick(defenders.map((entry) => entry.id)),
    raiders: pick(raiders.map((entry) => entry.id)),
    hits,
    shots,
    ticks: tickSamples.length,
    tickMs: { p50: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1]! },
    runtime: combat.stats(),
    offMesh,
    survivors: {
      defenders: aliveDefenders().length,
      raiders: aliveRaiders().length,
    },
  };
}

describe("2v4 arena soak", () => {
  test("enemies never stand in the open for more than 3 s while under fire", () => {
    const result = runSoak(2038);
    const defenders = [...result.defenders.entries()];
    const worst = Math.max(...defenders.map(([, sample]) => sample.worst));
    const over = defenders.reduce((sum, [, sample]) => sum + sample.over, 0);
    const spells = defenders.reduce((sum, [, sample]) => sum + sample.spells, 0);
    const underFire = defenders.reduce((sum, [, sample]) => sum + sample.underFireSeconds, 0);
    const perAgent = defenders.map(([id, sample]) => `${id} ${sample.worst.toFixed(2)}s/${sample.spells} spells`).join(", ");

    console.log(
      `2v4 soak ${DURATION}s ${result.ticks} ticks: ${defenders.length} defenders, worst exposure ${worst.toFixed(2)}s, ` +
        `${over} spells over ${LIMIT}s of ${spells}, ${underFire.toFixed(1)} defender-seconds under fire, ` +
        `survivors ${result.survivors.defenders}/4 + ${result.survivors.raiders}/2, ` +
        `shots ${result.shots.defender} out ${result.shots.raider} in, hits ${result.hits.defenderHits}/${result.hits.raiderHits}, ` +
        `cover ${result.runtime.coverQueries} queries ${result.runtime.coverScored} scored, ${result.runtime.losChecks} LOS, ` +
        `tick p50 ${result.tickMs.p50.toFixed(2)} p95 ${result.tickMs.p95.toFixed(2)} max ${result.tickMs.max.toFixed(2)} ms, ` +
        `runtime slowest ${result.runtime.slowestTickMs.toFixed(2)} ms`,
    );
    console.log(`per defender: ${perAgent}`);

    expect(result.shots.defender).toBeGreaterThan(50);
    expect(result.shots.raider).toBeGreaterThan(30);
    expect(underFire).toBeGreaterThan(20);
    expect(result.offMesh).toBe(0);
    expect(over).toBe(0);
    expect(worst).toBeLessThanOrEqual(LIMIT);

    const again = runSoak(2038);
    expect(again.shots).toEqual(result.shots);
    expect(Math.max(...[...again.defenders.values()].map((sample) => sample.worst))).toBeCloseTo(worst, 9);
    expect(again.offMesh).toBe(0);
  }, 120_000);

  test("a different seed holds the same bound", () => {
    const result = runSoak(77);
    const worst = Math.max(...[...result.defenders.values()].map((sample) => sample.worst));
    const over = [...result.defenders.values()].reduce((sum, sample) => sum + sample.over, 0);
    console.log(`2v4 soak seed 77: worst exposure ${worst.toFixed(2)}s, ${over} spells over ${LIMIT}s, ${result.shots.defender}/${result.shots.raider} shots`);
    expect(over).toBe(0);
    expect(worst).toBeLessThanOrEqual(LIMIT);
  }, 120_000);
});
