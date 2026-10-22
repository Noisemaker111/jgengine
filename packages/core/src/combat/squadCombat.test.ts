import { describe, expect, test } from "bun:test";
import { devtools } from "@jgengine/core/devtools/devtools";
import {
  assignSquadRoles,
  createCoverField,
  createSquadCombat,
  threatsFromMemory,
  type CoverSolid,
  type SquadComposition,
  type SquadMemberSpec,
} from "@jgengine/core/combat";
import { createNavRuntime, createPerception, type NavMeshData } from "@jgengine/core/world";

const COLS = 20;
const ROWS = 16;

function box(x0: number, x1: number, z0: number, z1: number): CoverSolid {
  return { center: [(x0 + x1) / 2, 1, (z0 + z1) / 2], halfExtents: [(x1 - x0) / 2, 1, (z1 - z0) / 2] };
}

/** Segment against the authored boxes on the XZ plane; touching a face without entering it is clear. */
function blockedBy(solids: readonly CoverSolid[]) {
  return (from: readonly [number, number, number], to: readonly [number, number, number]): boolean => {
    const dx = to[0] - from[0];
    const dz = to[2] - from[2];
    for (const solid of solids) {
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
  };
}

function arena(solids: readonly CoverSolid[]): NavMeshData {
  const solidAt = (x: number, z: number): boolean =>
    solids.some((solid) => Math.abs(x - solid.center[0]) <= solid.halfExtents[0] && Math.abs(z - solid.center[2]) <= solid.halfExtents[2]);
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

const SQUAD: SquadComposition = {
  roles: [
    { id: "assault", count: 2, preferredRange: 5, retreatBelow: 0.35 },
    { id: "support", count: 1, preferredRange: 12, retreatBelow: 0.35, holdCover: true },
    { id: "flanker", count: 1, preferredRange: 7, flankAngle: 1.3, retreatBelow: 0.35, cover: { near: 0.1 } },
  ],
};

/** One fixed world, wired the way a game wires it: nav, sight, cover from geometry, perception. */
function world(
  solids: readonly CoverSolid[],
  blue: readonly SquadMemberSpec[],
  red: readonly SquadMemberSpec[],
  composition: SquadComposition = SQUAD,
) {
  const nav = createNavRuntime({ mesh: arena(solids) });
  const blocked = blockedBy(solids);
  const cover = createCoverField({ solids, walkable: (point) => nav.findPolygon(point) !== null });
  const perception = createPerception({
    sightRange: 24,
    sightConeDeg: 360,
    hearingRange: 20,
    memorySeconds: 6,
    isSegmentClear: (from, to) => !blocked(from, to),
  });
  const everyone = [...blue, ...red];
  const health = new Map(everyone.map((entry) => [entry.id, entry.health ?? 1]));
  const shots: { from: string; to: string }[] = [];
  let nowMs = 0;

  const combat = createSquadCombat({
    nav,
    perception,
    cover,
    composition,
    members: blue,
    teamOf: (id) => everyone.find((entry) => entry.id === id)?.team ?? null,
    healthOf: (id) => health.get(id) ?? 0,
    blocked,
    engage: (memberId, targetId) => {
      shots.push({ from: memberId, to: targetId });
      return 1;
    },
    rng: seeded(7),
  });

  function observe(): void {
    const candidates = everyone.map((entry) => ({
      id: entry.id,
      position: (combat.member(entry.id)?.position ?? entry.position) as [number, number, number],
    }));
    for (const entry of everyone) {
      const view = combat.member(entry.id);
      const position = (view?.position ?? entry.position) as [number, number, number];
      const heading = candidates.find((candidate) => candidate.id !== entry.id)?.position ?? position;
      perception.observe(
        { id: entry.id, position, yaw: Math.atan2(heading[0] - position[0], heading[2] - position[2]) },
        candidates.filter((candidate) => candidate.id !== entry.id),
        nowMs,
      );
    }
  }

  function step(seconds: number, dt = 1 / 30): void {
    for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += dt) {
      nowMs += dt * 1000;
      observe();
      combat.tick(dt);
    }
  }

  return {
    nav,
    cover,
    perception,
    combat,
    health,
    shots,
    step,
    observe,
    blocked,
    now: () => nowMs,
    close() {
      combat.dispose();
      nav.dispose();
      cover.dispose();
      perception.dispose();
    },
  };
}

const emptySolids: readonly CoverSolid[] = [];

describe("squad roles are injected composition", () => {
  test("a composition assigns roles deterministically and wraps for larger squads", () => {
    const first = assignSquadRoles(["a", "b", "c", "d"], SQUAD);
    const again = assignSquadRoles(["a", "b", "c", "d"], SQUAD);
    expect([...first].map(([id, role]) => `${id}:${role.id}`)).toEqual(["a:assault", "b:assault", "c:support", "d:flanker"]);
    expect([...again].map(([id, role]) => `${id}:${role.id}`)).toEqual(["a:assault", "b:assault", "c:support", "d:flanker"]);
    const six = assignSquadRoles(["a", "b", "c", "d", "e", "f"], SQUAD);
    expect(six.get("e")!.id).toBe("assault");
    expect(six.get("f")!.id).toBe("assault");
    expect(assignSquadRoles(["a"], { roles: [] }).size).toBe(0);
  });

  test("a game's own role names need no engine vocabulary", () => {
    const assigned = assignSquadRoles(["x"], { roles: [{ id: "wall-banger", preferredRange: 2 }] });
    expect(assigned.get("x")!.id).toBe("wall-banger");
  });

  test("a squad the composition does not name keeps the default role", () => {
    const run = world(emptySolids, [{ id: "solo", team: "blue", position: [4, 0, 4] }], [], { roles: [] });
    run.combat.tick(1 / 30);
    expect(run.combat.member("solo")!.role).toBe("member");
    run.close();
  });
});

describe("threat comes from perception memory", () => {
  test("an enemy the member never observed is not a target and sets no cover", () => {
    const run = world(
      emptySolids,
      [{ id: "blue-1", team: "blue", position: [5, 0, 5] }],
      [{ id: "red-1", team: "red", position: [15, 0, 10] }],
    );
    for (let i = 0; i < 30; i += 1) run.combat.tick(1 / 30);
    const member = run.combat.member("blue-1")!;
    expect(member.target).toBeNull();
    expect(member.cover).toBeNull();
    expect(threatsFromMemory(run.perception, "blue-1", run.now())).toHaveLength(0);
    run.close();
  });

  test("a remembered enemy becomes the target, and its memory fading ends it", () => {
    const run = world(
      emptySolids,
      [{ id: "blue-1", team: "blue", position: [5, 0, 5] }],
      [{ id: "red-1", team: "red", position: [11, 0, 8] }],
    );
    run.perception.observe(
      { id: "blue-1", position: [5, 0, 5], yaw: Math.atan2(3, 6) },
      [{ id: "red-1", position: [11, 0, 8] }],
      0,
    );
    run.combat.tick(1 / 30);
    expect(run.combat.member("blue-1")!.target).toBe("red-1");

    run.perception.observe({ id: "blue-1", position: [5, 0, 5], yaw: Math.PI }, [], 7000);
    run.combat.tick(1 / 30);
    expect(run.combat.member("blue-1")!.target).toBeNull();
    run.close();
  });
});

describe("suppression", () => {
  test("incoming fire pins a member: it stops moving and stops leaning out until the meter decays", () => {
    const run = world(
      emptySolids,
      [{ id: "blue-1", team: "blue", position: [5, 0, 5] }],
      [{ id: "red-1", team: "red", position: [5, 0, 13] }],
    );
    run.step(1.5);
    expect(run.shots.length).toBeGreaterThan(0);

    run.combat.underFire("blue-1");
    expect(run.combat.member("blue-1")!.suppression).toBeGreaterThanOrEqual(0.5);
    const spot = run.combat.member("blue-1")!.position;
    let peekedWhilePinned = false;
    for (let i = 0; i < 36; i += 1) {
      run.step(1 / 30);
      if (run.combat.member("blue-1")!.mode === "peek") peekedWhilePinned = true;
    }
    const pinned = run.combat.member("blue-1")!;
    expect(pinned.suppression).toBeGreaterThan(0.4);
    expect(peekedWhilePinned).toBe(false);
    expect(Math.hypot(pinned.position[0] - spot[0], pinned.position[2] - spot[2])).toBeLessThan(0.2);

    run.step(2.5);
    expect(run.combat.member("blue-1")!.suppression).toBe(0);
    run.close();
  });
});

describe("retreat at low health", () => {
  test("a hurt member falls back to cover on the far side of the wall", () => {
    const solids = [box(2, 8, 9, 10)];
    const run = world(
      solids,
      [{ id: "blue-1", team: "blue", position: [5, 0, 8], health: 0.2 }],
      [{ id: "red-1", team: "red", position: [5, 0, 1] }],
    );
    run.combat.retune({ reselectSeconds: 0.1 });
    run.step(1.5);
    const held = run.combat.member("blue-1")!;
    expect(held.mode).toBe("retreat");
    expect(held.cover).not.toBeNull();
    const point = run.cover.points().find((entry) => entry.id === held.cover)!;
    expect(run.blocked(point.position, [5, 0, 1])).toBe(true);

    run.step(6.5);
    const member = run.combat.member("blue-1")!;
    expect(member.mode).toBe("retreat");
    expect(Math.hypot(member.position[0] - 5, member.position[2] - 1)).toBeGreaterThan(9.4);
    expect(member.position[2]).toBeGreaterThan(10);
    run.close();
  });
});

describe("squad cover discipline", () => {
  test("two squadmates never hold the same point", () => {
    const solids = [box(4, 5, 9, 14)];
    const run = world(
      solids,
      [
        { id: "blue-1", team: "blue", position: [4, 0, 8] },
        { id: "blue-2", team: "blue", position: [6, 0, 8] },
      ],
      [{ id: "red-1", team: "red", position: [16, 0, 9] }],
    );
    run.step(0.5);
    const a = run.combat.member("blue-1")!;
    const b = run.combat.member("blue-2")!;
    expect(a.cover).not.toBeNull();
    expect(b.cover).not.toBeNull();
    expect(a.cover).not.toBe(b.cover);
    run.close();
  });

  test("a snapshot restores the same run", () => {
    const solids = [box(4, 9, 4, 5), box(11, 12, 3, 9)];
    const blue: SquadMemberSpec[] = [
      { id: "blue-1", team: "blue", position: [7, 0, 8] },
      { id: "blue-2", team: "blue", position: [9, 0, 8] },
    ];
    const red: SquadMemberSpec[] = [
      { id: "red-1", team: "red", position: [7, 0, 1] },
      { id: "red-2", team: "red", position: [15, 0, 8] },
    ];
    const run = world(solids, blue, red);
    run.step(2);
    const snapshot = run.combat.snapshot();
    run.step(2);
    const after = run.combat.members().map((member) => [...member.position]);
    const shotsAfter = run.shots.length;
    expect(after).toHaveLength(2);

    run.combat.restore(snapshot);
    run.step(2);
    const replayed = run.combat.members().map((member) => [...member.position]);
    for (let i = 0; i < after.length; i += 1) {
      expect(replayed[i]![0]).toBeCloseTo(after[i]![0]!, 6);
      expect(replayed[i]![2]).toBeCloseTo(after[i]![2]!, 6);
    }
    expect(run.shots.length).toBe(shotsAfter);

    const json = JSON.parse(JSON.stringify(snapshot)) as typeof snapshot;
    expect(json.members).toHaveLength(2);
    expect(json.tunables.reselectSeconds).toBe(0.6);
    run.close();
  });

  test("the devtools probe reports the squad's live behavior", () => {
    const solids = [box(2, 12, 6, 7)];
    const nav = createNavRuntime({ mesh: arena(solids) });
    const cover = createCoverField({ solids });
    const perception = createPerception({ sightRange: 20, sightConeDeg: 360, hearingRange: 10, memorySeconds: 4 });
    const combat = createSquadCombat({
      nav,
      perception,
      cover,
      composition: SQUAD,
      members: [{ id: "blue-1", team: "blue", position: [5, 0, 8] }],
      teamOf: (id) => (id === "blue-1" ? "blue" : "red"),
      blocked: blockedBy(solids),
      rng: seeded(3),
      devtoolsName: "test.squadCombat",
    });
    for (let i = 0; i < 10; i += 1) combat.tick(1 / 30);
    expect(String((devtools.probes.read() as Record<string, unknown>)["test.squadCombat"])).toContain("1 members");
    combat.dispose();
    expect((devtools.probes.read() as Record<string, unknown>)["test.squadCombat"]).toBeUndefined();
    nav.dispose();
    cover.dispose();
    perception.dispose();
  });
});
