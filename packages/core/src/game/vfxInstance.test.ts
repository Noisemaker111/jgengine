import { describe, expect, test } from "bun:test";

import { createVfxInstanceStore, type CombatVfxInstanceEvent } from "./vfxInstance";

function recordingStore(now?: () => number) {
  const ops: CombatVfxInstanceEvent[] = [];
  const store = createVfxInstanceStore({
    onOp: (op) => ops.push(op),
    ...(now === undefined ? {} : { now }),
  });
  return { store, ops };
}

describe("retained vfx instance lifecycle", () => {
  test("create mints a stable id, emits upsert, and is inspectable", () => {
    const { store, ops } = recordingStore();
    const id = store.upsert({ kind: "beam", color: 0xffcc00, from: "hero", to: [3, 0, 4] });
    expect(store.count()).toBe(1);
    expect(store.get(id)?.kind).toBe("beam");
    expect(store.get(id)?.to).toEqual([3, 0, 4]);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ op: "upsert", id, instance: { color: 0xffcc00 } });
  });

  test("upsert with an explicit id replaces in place (idempotent by id)", () => {
    const { store, ops } = recordingStore();
    store.upsert({ id: "beam-1", kind: "beam", color: 0x111111 });
    store.upsert({ id: "beam-1", kind: "beam", color: 0x222222 });
    expect(store.count()).toBe(1);
    expect(store.get("beam-1")?.color).toBe(0x222222);
    expect(ops.every((op) => op.op === "upsert")).toBe(true);
  });

  test("update merges dynamic params and refreshes state, leaving unset fields intact", () => {
    const { store, ops } = recordingStore();
    const id = store.upsert({ kind: "beam", color: 0x00ff00, from: "a", to: "b", params: { width: 1 } });
    const ok = store.update(id, { to: [9, 0, 9], params: { intensity: 2 } });
    expect(ok).toBe(true);
    const state = store.get(id);
    expect(state?.from).toBe("a");
    expect(state?.to).toEqual([9, 0, 9]);
    expect(state?.params).toEqual({ width: 1, intensity: 2 });
    expect(ops.at(-1)).toMatchObject({ op: "update", id });
  });

  test("update on an unknown id is a no-op returning false (missing-update behavior)", () => {
    const { store, ops } = recordingStore();
    expect(store.update("ghost", { color: 1 })).toBe(false);
    expect(ops).toHaveLength(0);
  });

  test("stop disposes and carries the fade duration; a second stop is a no-op", () => {
    const { store, ops } = recordingStore();
    const id = store.upsert({ kind: "beam", color: 0xffffff });
    expect(store.stop(id, { fadeMs: 250 })).toBe(true);
    expect(store.count()).toBe(0);
    expect(store.get(id)).toBeNull();
    expect(store.stop(id)).toBe(false);
    expect(ops.at(-1)).toEqual({ op: "stop", id, fadeMs: 250 });
  });

  test("ttl heartbeat auto-stops stale instances on tick; update refreshes the heartbeat", () => {
    let clock = 0;
    const { store, ops } = recordingStore(() => clock);
    const id = store.upsert({ kind: "beam", color: 0x0, ttlMs: 100 });
    clock = 60;
    store.update(id, { color: 0x1 }); // heartbeat refresh at t=60
    expect(store.tick(120)).toBe(0); // only 60ms since refresh, still alive
    expect(store.count()).toBe(1);
    expect(store.tick(200)).toBe(1); // 140ms since refresh, now expired
    expect(store.count()).toBe(0);
    expect(ops.at(-1)?.op).toBe("stop");
  });

  test("clear disposes every instance for scene/reset cleanup", () => {
    const { store, ops } = recordingStore();
    store.upsert({ id: "a", kind: "beam", color: 0 });
    store.upsert({ id: "b", kind: "tether", color: 0 });
    store.clear();
    expect(store.count()).toBe(0);
    const stops = ops.filter((op) => op.op === "stop").map((op) => op.id);
    expect(stops.sort()).toEqual(["a", "b"]);
  });

  test("state stays independent of the renderer sink (headless: no onOp wired)", () => {
    const store = createVfxInstanceStore();
    const id = store.upsert({ kind: "beam", color: 0x123456 });
    expect(store.count()).toBe(1);
    expect(store.list()).toHaveLength(1);
    expect(store.stop(id)).toBe(true);
    expect(store.count()).toBe(0);
  });

  // Structurally different retained effect: a "zone" ring with no endpoints, driven purely by
  // radius + params, proves the store is kind-agnostic and not beam-shaped.
  test("kind-agnostic: a retained zone effect with only radius/params round-trips", () => {
    const { store, ops } = recordingStore();
    const id = store.upsert({ kind: "zone", color: 0x33aaff, radius: 4, params: { pulseHz: 1.5 } });
    expect(store.get(id)).toMatchObject({ kind: "zone", radius: 4 });
    expect(store.get(id)?.from).toBeUndefined();
    expect(store.get(id)?.to).toBeUndefined();
    store.update(id, { radius: 6 });
    expect(store.get(id)?.radius).toBe(6);
    expect(store.get(id)?.params).toEqual({ pulseHz: 1.5 });
    expect(ops.map((op) => op.op)).toEqual(["upsert", "update"]);
  });

  test("params bag is copied, not aliased, so caller mutation cannot corrupt stored state", () => {
    const { store } = recordingStore();
    const params: Record<string, number> = { width: 1 };
    const id = store.upsert({ kind: "beam", color: 0, params });
    params.width = 99;
    expect(store.get(id)?.params).toEqual({ width: 1 });
  });
});
