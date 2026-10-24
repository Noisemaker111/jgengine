import { describe, expect, test } from "bun:test";

import { createDownedState } from "./downed";

describe("downed state machine", () => {
  test("down puts an entity into the downed phase with a bleedout timer", () => {
    const downed = createDownedState({ bleedoutSeconds: 30 });
    const event = downed.down("p1");
    expect(event).toEqual({ kind: "downed", instanceId: "p1" });
    expect(downed.phase("p1")).toBe("downed");
    expect(downed.get("p1")?.bleedoutRemaining).toBe(30);
    expect(downed.down("p1")).toBeNull();
  });

  test("ally revive accumulates hold time then restores to alive", () => {
    const downed = createDownedState({ bleedoutSeconds: 30, reviveSeconds: 4, reviveHealthFraction: 0.5 });
    downed.down("p1");
    expect(downed.revive("p1", 2)?.kind).toBe("reviving");
    expect(downed.phase("p1")).toBe("downed");
    const revived = downed.revive("p1", 2);
    expect(revived).toEqual({ kind: "revived", instanceId: "p1", reviveHealthFraction: 0.5 });
    expect(downed.phase("p1")).toBe("alive");
  });

  test("interrupting a revive resets accumulated progress", () => {
    const downed = createDownedState({ bleedoutSeconds: 30, reviveSeconds: 4 });
    downed.down("p1");
    downed.revive("p1", 3);
    downed.interruptRevive("p1");
    expect(downed.get("p1")?.reviveProgress).toBe(0);
    expect(downed.revive("p1", 3)?.kind).toBe("reviving");
  });

  test("bleedout expiry transitions to dead and spawns a banner", () => {
    const downed = createDownedState({ bleedoutSeconds: 10, banner: { expireSeconds: 60 } });
    downed.down("p1");
    const dead = downed.tick(10);
    expect(dead.map((e) => e.kind)).toEqual(["died", "banner.created"]);
    expect(downed.phase("p1")).toBe("dead");
    expect(downed.get("p1")?.bannerRemaining).toBe(60);
  });

  test("banner expires after its window", () => {
    const downed = createDownedState({ bleedoutSeconds: 10, banner: { expireSeconds: 60 } });
    downed.down("p1");
    downed.tick(10);
    expect(downed.tick(59)).toEqual([]);
    expect(downed.tick(1).map((e) => e.kind)).toEqual(["banner.expired"]);
    expect(downed.get("p1")?.bannerRemaining).toBeNull();
  });

  test("finish executes a downed entity immediately", () => {
    const downed = createDownedState({ bleedoutSeconds: 30 });
    downed.down("p1");
    expect(downed.finish("p1", "executed")).toEqual({ kind: "died", instanceId: "p1", reason: "executed" });
    expect(downed.phase("p1")).toBe("dead");
    expect(downed.finish("p1")).toBeNull();
  });

  test("respawnFromBanner brings a banner-holding dead entity back", () => {
    const downed = createDownedState({ bleedoutSeconds: 10, banner: { expireSeconds: 60 }, reviveHealthFraction: 0.25 });
    downed.down("p1");
    downed.tick(10);
    const respawn = downed.respawnFromBanner("p1");
    expect(respawn).toEqual({ kind: "respawned", instanceId: "p1", reviveHealthFraction: 0.25 });
    expect(downed.phase("p1")).toBe("alive");
    expect(downed.respawnFromBanner("p1")).toBeNull();
  });

  test("without a banner, death is terminal", () => {
    const downed = createDownedState({ bleedoutSeconds: 10 });
    downed.down("p1");
    downed.tick(10);
    expect(downed.get("p1")?.bannerRemaining).toBeNull();
    expect(downed.respawnFromBanner("p1")).toBeNull();
  });

  test("phase defaults to alive for unknown entities", () => {
    const downed = createDownedState({ bleedoutSeconds: 10 });
    expect(downed.phase("stranger")).toBe("alive");
  });

  test("a restored snapshot resumes a bleed-out mid-window", () => {
    const before = createDownedState({ bleedoutSeconds: 30, reviveSeconds: 4 });
    before.down("p1");
    before.tick(12);
    before.revive("p1", 1.5);

    const after = createDownedState({ bleedoutSeconds: 30, reviveSeconds: 4 });
    after.restore(before.snapshot());

    expect(after.get("p1")).toEqual({ phase: "downed", bleedoutRemaining: 18, reviveProgress: 1.5, bannerRemaining: null });
    expect(after.tick(18).map((e) => e.kind)).toEqual(["died"]);
    expect(after.phase("p1")).toBe("dead");
  });

  test("restore keeps a partial revive alive after the same hold time", () => {
    const before = createDownedState({ bleedoutSeconds: 30, reviveSeconds: 4, reviveHealthFraction: 0.5 });
    before.down("p1");
    before.revive("p1", 3);

    const after = createDownedState({ bleedoutSeconds: 30, reviveSeconds: 4, reviveHealthFraction: 0.5 });
    after.restore(before.snapshot());

    expect(after.revive("p1", 1)).toEqual({ kind: "revived", instanceId: "p1", reviveHealthFraction: 0.5 });
  });

  test("restore carries the banner window of a dead entity", () => {
    const before = createDownedState({ bleedoutSeconds: 10, banner: { expireSeconds: 60 } });
    before.down("p1");
    before.tick(10);
    before.tick(20);

    const after = createDownedState({ bleedoutSeconds: 10, banner: { expireSeconds: 60 } });
    after.restore(before.snapshot());

    expect(after.get("p1")).toEqual({ phase: "dead", bleedoutRemaining: 0, reviveProgress: 0, bannerRemaining: 40 });
    expect(after.respawnFromBanner("p1")?.kind).toBe("respawned");
  });

  test("restore replaces the tracked set instead of merging into it", () => {
    const downed = createDownedState({ bleedoutSeconds: 10 });
    downed.down("stale");
    downed.restore({});
    expect(downed.get("stale")).toBeNull();
    expect(downed.phase("stale")).toBe("alive");
  });

  test("a snapshot taken after restore is the state that was put back", () => {
    const source = createDownedState({ bleedoutSeconds: 30, reviveSeconds: 4 });
    source.down("p1");
    source.tick(7);
    const saved = source.snapshot();

    const target = createDownedState({ bleedoutSeconds: 30, reviveSeconds: 4 });
    target.restore(saved);

    expect(target.snapshot()).toEqual(saved);
    saved.p1!.bleedoutRemaining = 1;
    expect(target.get("p1")?.bleedoutRemaining).toBe(23);
  });
});
