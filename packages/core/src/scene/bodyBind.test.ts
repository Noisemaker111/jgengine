import { describe, expect, it } from "bun:test";
import { createBodyBind, type BodyBindDeps, type BodySnapshot } from "./bodyBind";
import { createEntityStore } from "./entityStore";

function depsOverStore(store: ReturnType<typeof createEntityStore>): BodyBindDeps {
  return {
    has: (id) => store.get(id) !== null,
    spawn: (kind, options) => store.spawn(kind, options),
    despawn: (id) => store.despawn(id),
    setPose: (id, pose) => store.setPose(id, pose),
    update: (id, patch) => store.update(id, patch),
  };
}

describe("createBodyBind", () => {
  it("spawns an id seen for the first time from its snapshot kind", () => {
    const store = createEntityStore();
    const bind = createBodyBind(depsOverStore(store));

    bind.sync([{ id: "kart-1", kind: "kart_player", position: [1, 0, 2], rotationY: 0.5, role: "player" }]);

    const entity = store.get("kart-1");
    expect(entity?.name).toBe("kart_player");
    expect(entity?.position).toEqual([1, 0, 2]);
    expect(entity?.rotationY).toBe(0.5);
    expect(entity?.role).toBe("player");
  });

  it("poses (never re-spawns) an id already bound", () => {
    const store = createEntityStore();
    const bind = createBodyBind(depsOverStore(store));

    bind.sync([{ id: "kart-1", kind: "kart_player", position: [0, 0, 0], rotationY: 0 }]);
    bind.sync([{ id: "kart-1", kind: "kart_player", position: [5, 0, 5], rotationY: 1.2 }], 0.5);

    const entity = store.get("kart-1");
    expect(entity?.position).toEqual([5, 0, 5]);
    expect(entity?.rotationY).toBe(1.2);
    expect(entity?.velocity).toEqual([10, 0, 10]);
  });

  it("despawns an id it previously spawned once it drops out of the snapshot", () => {
    const store = createEntityStore();
    const bind = createBodyBind(depsOverStore(store));

    bind.sync([
      { id: "kart-1", kind: "kart_player", position: [0, 0, 0] },
      { id: "rival-1", kind: "kart_rival", position: [1, 0, 1] },
    ]);
    expect(store.get("rival-1")).not.toBeNull();

    bind.sync([{ id: "kart-1", kind: "kart_player", position: [0, 0, 0] }]);

    expect(store.get("rival-1")).toBeNull();
    expect(store.get("kart-1")).not.toBeNull();
    expect(bind.boundIds()).toEqual(new Set(["kart-1"]));
  });

  it("re-spawns an id after it cycles out and back in (dynamic swarm membership)", () => {
    const store = createEntityStore();
    const bind = createBodyBind(depsOverStore(store));

    const wave1: BodySnapshot[] = [{ id: "creature-1", kind: "creature", position: [0, 0, 0] }];
    bind.sync(wave1);
    bind.sync([]);
    expect(store.get("creature-1")).toBeNull();

    bind.sync([{ id: "creature-1", kind: "creature", position: [3, 0, 3] }]);
    expect(store.get("creature-1")?.position).toEqual([3, 0, 3]);
  });

  it("adopts an id already spawned elsewhere instead of throwing on a duplicate spawn", () => {
    const store = createEntityStore();
    store.spawn("compactor", { id: "compactor-1", position: [0, 0, -10], role: "prop" });
    const bind = createBodyBind(depsOverStore(store));

    bind.sync([{ id: "compactor-1", kind: "compactor", position: [0, 0, -8] }]);

    expect(store.get("compactor-1")?.position).toEqual([0, 0, -8]);
    expect(bind.boundIds()).toEqual(new Set(["compactor-1"]));
  });

  it("patches role/meta on an already-bound id when the snapshot changes them", () => {
    const store = createEntityStore();
    const bind = createBodyBind(depsOverStore(store));

    bind.sync([{ id: "npc-1", kind: "npc", position: [0, 0, 0], role: "npc", meta: { tag: "a" } }]);
    bind.sync([{ id: "npc-1", kind: "npc", position: [0, 0, 0], role: "prop", meta: { tag: "b" } }]);

    const entity = store.get("npc-1");
    expect(entity?.role).toBe("prop");
    expect(entity?.meta).toEqual({ tag: "b" });
  });
});
