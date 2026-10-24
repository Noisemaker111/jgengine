import { describe, expect, test } from "bun:test";
import { createEntityStore } from "@jgengine/core/scene/entityStore";
import type { NeedDefinition } from "./needs";
import { createOffScreenWorld, type NearAgents, type OffScreenPolicy } from "./offScreen";
import { resolveRoutine } from "./routine";

const NEEDS: readonly NeedDefinition[] = [{ id: "hunger", max: 100, rate: 0.02 }];
const PLACES = { home: [6, 0, 6] as const, work: [40, 0, 6] as const };
const DAY = resolveRoutine({
  cycleSeconds: 600,
  stops: [
    { place: "home", arriveAt: 0, activity: "sleep", travelSeconds: 0 },
    { place: "work", arriveAt: 120, activity: "work", travelSeconds: 10 },
  ],
});

/**
 * The near half every streaming game writes: one scene body per resident, spawned under the
 * resident's own id. This is Harbor Heat's walker delegate without its duplicate guard.
 */
function walkers(entities: ReturnType<typeof createEntityStore>): NearAgents & { bodies(): string[] } {
  const live = new Map<string, readonly [number, number, number]>();
  return {
    spawn(next) {
      if (live.has(next.id)) return;
      entities.spawn("ped_city", { id: `resident-${next.id}`, position: next.position, role: "npc" });
      live.set(next.id, next.position);
    },
    despawn(id) {
      const at = live.get(id);
      if (at === undefined) return null;
      entities.despawn(`resident-${id}`);
      live.delete(id);
      return { position: at, needs: {} };
    },
    position: (id) => live.get(id) ?? null,
    setGoal() {},
    tick() {},
    dispose() {
      for (const id of live.keys()) entities.despawn(`resident-${id}`);
      live.clear();
    },
    bodies: () => entities.ids().filter((id) => id.startsWith("resident-")),
  };
}

function streaming(entities: ReturnType<typeof createEntityStore>, policy: Partial<OffScreenPolicy> = {}) {
  const near = walkers(entities);
  const world = createOffScreenWorld({
    places: PLACES,
    needs: NEEDS,
    policy: { nearRadius: 8, farRadius: 10, ...policy },
    near,
    residents: [{ id: "dee", home: [6, 0, 6], routine: DAY }],
  });
  return { near, world };
}

const HOME = [6, 0, 6] as const;
const AWAY = [240, 0, 240] as const;

describe("one body per resident id", () => {
  test("a far teleport and the walk back never duplicates the resident", () => {
    const entities = createEntityStore();
    const { near, world } = streaming(entities);

    world.tick(1 / 60, 0, HOME);
    expect(near.bodies()).toEqual(["resident-dee"]);

    world.tick(1 / 60, 1 / 60, AWAY);
    expect(near.bodies()).toEqual([]);
    expect(world.agent("dee")!.mode).toBe("far");

    world.tick(1 / 60, 2 / 60, HOME);
    expect(near.bodies()).toEqual(["resident-dee"]);
    expect(world.agent("dee")!.mode).toBe("near");
  });

  test("re-streaming a restored world that still holds the body keeps exactly one", () => {
    const entities = createEntityStore();
    const first = streaming(entities);
    first.world.tick(1 / 60, 0, HOME);
    expect(first.near.bodies()).toEqual(["resident-dee"]);

    // A save/load: the scene snapshot still carries the body, the off-screen world starts empty.
    const saved = entities.snapshot();
    const restored = createEntityStore();
    restored.hydrate(saved);
    expect(restored.ids()).toEqual(["resident-dee"]);

    const second = streaming(restored);
    second.world.tick(1 / 60, 0, HOME);
    expect(restored.ids().filter((id) => id === "resident-dee")).toHaveLength(1);
    expect(second.world.agent("dee")!.mode).toBe("near");
  });

  test("catching up from a saved near resident does not spawn a second body", () => {
    const entities = createEntityStore();
    const first = streaming(entities);
    first.world.tick(1 / 60, 0, HOME);
    const state = first.world.snapshot();
    expect(state.residents[0]!.mode).toBe("near");

    const restored = createEntityStore();
    restored.hydrate(entities.snapshot());

    const second = streaming(restored);
    second.world.restore(state);
    second.world.tick(1 / 60, 1 / 60, HOME);
    expect(restored.ids().filter((id) => id === "resident-dee")).toHaveLength(1);
  });
});
