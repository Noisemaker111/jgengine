import { describe, expect, test } from "bun:test";

import {
  createPopulationDirector,
  type PopulationDirectorConfig,
  type PopulationDirectorState,
  type PopulationSpawnRequest,
} from "./populationDirector";

function drain(
  director: ReturnType<typeof createPopulationDirector>,
  dt: number,
  ticks: number,
): PopulationSpawnRequest[] {
  const all: PopulationSpawnRequest[] = [];
  for (let i = 0; i < ticks; i += 1) all.push(...director.tick(dt));
  return all;
}

describe("createPopulationDirector", () => {
  test("fills to cap then stops", () => {
    const director = createPopulationDirector({
      regions: [{ region: "meadow", species: [{ species: "hare", cap: 3 }, { species: "deer", cap: 2 }] }],
    });
    const spawned = drain(director, 1, 10);
    expect(spawned).toHaveLength(5);
    expect(director.alive("meadow", "hare")).toBe(3);
    expect(director.alive("meadow", "deer")).toBe(2);
    // No further requests once every species is at cap.
    expect(director.tick(100)).toEqual([]);
  });

  test("never exceeds a species cap", () => {
    const director = createPopulationDirector({
      regions: [{ region: "meadow", species: [{ species: "hare", cap: 4 }] }],
    });
    drain(director, 1, 20);
    expect(director.alive("meadow", "hare")).toBe(4);
    // Extra removals + refills stay pinned at the cap.
    director.notifyRemoved("meadow", "hare");
    drain(director, 1, 20);
    expect(director.alive("meadow", "hare")).toBe(4);
  });

  test("removal triggers a delayed respawn", () => {
    const director = createPopulationDirector({
      respawnDelay: 5,
      regions: [{ region: "cave", species: [{ species: "bat", cap: 2 }] }],
    });
    drain(director, 1, 5); // fill to cap (initial deficit is ready immediately)
    expect(director.alive("cave", "bat")).toBe(2);
    director.notifyRemoved("cave", "bat");
    expect(director.alive("cave", "bat")).toBe(1);
    // Before the delay elapses, nothing respawns.
    expect(director.tick(4)).toEqual([]);
    expect(director.alive("cave", "bat")).toBe(1);
    // After the delay passes, exactly one refill request is emitted.
    const requests = director.tick(2);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ region: "cave", species: "bat" });
    expect(director.alive("cave", "bat")).toBe(2);
  });

  test("per-tick cap bounds output and carries the rest over", () => {
    const director = createPopulationDirector({
      maxSpawnsPerTick: 2,
      regions: [{ region: "plain", species: [{ species: "boar", cap: 5 }] }],
    });
    expect(director.tick(1)).toHaveLength(2);
    expect(director.tick(1)).toHaveLength(2);
    expect(director.tick(1)).toHaveLength(1);
    expect(director.tick(1)).toHaveLength(0);
    expect(director.alive("plain", "boar")).toBe(5);
  });

  test("weighted selection is deterministic for a seed and favours weight", () => {
    const config: PopulationDirectorConfig = {
      seed: 42,
      regions: [
        {
          region: "forest",
          species: [
            { species: "common", weight: 9, cap: 1000 },
            { species: "rare", weight: 1, cap: 1000 },
          ],
        },
      ],
    };
    const a = createPopulationDirector(config);
    const b = createPopulationDirector(config);
    const seqA = drain(a, 1, 50).map((r) => r.species);
    const seqB = drain(b, 1, 50).map((r) => r.species);
    expect(seqA).toEqual(seqB); // identical seed + events -> identical stream
    const common = seqA.filter((s) => s === "common").length;
    expect(common).toBeGreaterThan(seqA.length / 2); // heavier weight dominates
  });

  test("regions are isolated", () => {
    const director = createPopulationDirector({
      regions: [
        { region: "north", species: [{ species: "elk", cap: 2 }] },
        { region: "south", species: [{ species: "croc", cap: 2 }] },
      ],
    });
    drain(director, 1, 10);
    director.notifyRemoved("north", "elk");
    const requests = drain(director, 1, 5);
    expect(requests.every((r) => r.region === "north")).toBe(true);
    expect(director.alive("south", "croc")).toBe(2);
  });

  test("reconcile snaps to a live census and re-queues the deficit", () => {
    const director = createPopulationDirector({
      regions: [{ region: "reef", species: [{ species: "fish", cap: 6 }] }],
    });
    drain(director, 1, 20);
    expect(director.alive("reef", "fish")).toBe(6);
    // Live census says only 2 are actually present.
    director.reconcile({ reef: { fish: 2 } });
    expect(director.alive("reef", "fish")).toBe(2);
    drain(director, 1, 20);
    expect(director.alive("reef", "fish")).toBe(6);
  });

  test("notifySpawned counts external population against the cap", () => {
    const director = createPopulationDirector({
      regions: [{ region: "camp", species: [{ species: "goat", cap: 2 }] }],
    });
    // Game placed both goats itself before the director could refill.
    director.notifySpawned("camp", "goat");
    director.notifySpawned("camp", "goat");
    expect(director.alive("camp", "goat")).toBe(2);
    // The initial refill slots find the region full and emit nothing.
    expect(drain(director, 1, 5)).toEqual([]);
  });

  test("attaches a spawn point from configured candidates", () => {
    const director = createPopulationDirector({
      seed: 7,
      regions: [
        {
          region: "grove",
          species: [{ species: "fox", cap: 3 }],
          spawnPoints: [
            [0, 0],
            [10, 0],
            [0, 10],
          ],
        },
      ],
    });
    const requests = drain(director, 1, 5);
    expect(requests).toHaveLength(3);
    for (const request of requests) {
      expect(request.point).toBeDefined();
      expect([
        [0, 0],
        [10, 0],
        [0, 10],
      ]).toContainEqual(request.point);
    }
  });

  test("injected picker receives a deterministic roll", () => {
    const director = createPopulationDirector({
      regions: [
        {
          region: "grove",
          species: [{ species: "fox", cap: 2 }],
          spawnPoints: [
            [1, 1],
            [2, 2],
          ],
        },
      ],
    });
    const rolls: number[] = [];
    const requests = director.tick(1, {
      pickSpawnPoint: (_region, candidates, roll) => {
        rolls.push(roll);
        return candidates[0]!;
      },
    });
    expect(requests.every((r) => r.point?.[0] === 1)).toBe(true);
    expect(rolls.every((r) => r >= 0 && r < 1)).toBe(true);
  });

  test("state round-trips through JSON and resumes identically", () => {
    const config: PopulationDirectorConfig = {
      seed: 99,
      respawnDelay: 3,
      regions: [
        { region: "a", species: [{ species: "x", weight: 2, cap: 3 }, { species: "y", cap: 3 }] },
        { region: "b", species: [{ species: "z", cap: 4 }] },
      ],
    };
    const original = createPopulationDirector(config);
    drain(original, 1, 3);
    original.notifyRemoved("a", "x");
    original.notifyRemoved("b", "z");

    const snapshot = original.snapshot();
    const roundTripped = JSON.parse(JSON.stringify(snapshot)) as PopulationDirectorState;
    expect(roundTripped).toEqual(snapshot);

    const resumed = createPopulationDirector(config);
    resumed.hydrate(roundTripped);

    // Both directors, from here, must produce identical streams.
    const seqOriginal = drain(original, 1, 12);
    const seqResumed = drain(resumed, 1, 12);
    expect(seqResumed).toEqual(seqOriginal);
    expect(resumed.snapshot()).toEqual(original.snapshot());
  });

  test("snapshot is a detached copy", () => {
    const director = createPopulationDirector({
      regions: [{ region: "a", species: [{ species: "x", cap: 2 }] }],
    });
    const snap = director.snapshot();
    snap.alive["a"] = { x: 999 };
    snap.elapsed = 12345;
    expect(director.alive("a", "x")).toBe(0);
  });

  test("ignores non-positive dt", () => {
    const director = createPopulationDirector({
      regions: [{ region: "a", species: [{ species: "x", cap: 2 }] }],
    });
    expect(director.tick(0)).toEqual([]);
    expect(director.tick(-5)).toEqual([]);
    expect(director.alive("a", "x")).toBe(0);
  });
});
