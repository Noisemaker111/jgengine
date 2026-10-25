import { beforeEach, describe, expect, test } from "bun:test";
import { createGameSave } from "@jgengine/core/game/gameSave";
import { memorySaveBackend } from "@jgengine/core/game/saveStore";
import type { HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";
import { createBossState } from "@jgengine/core/ai/director/boss";

import { STARTING_LIVES } from "./entities/base/catalog";
import { keep, towerLevel } from "./keep";
import { resetSession, session } from "./session";
import { advanceKeep, beaconRunner } from "./testing";
import { captureDefense, defenseSystem, legacySystem, validDefenseSave, worldSystem } from "./save";
import { drawRelics, freshLegacy, legacy, openingGold, upgradeLegacy, writeLegacy } from "./waves/legacy";
import { WARDEN_ID, bossProfile } from "./waves/manifest";

let runner: HeadlessRunner;
const world = () => keep.of(runner.ctx);
beforeEach(() => {
  runner = beaconRunner("Beacon keep save");
});

const documentSave = () =>
  createGameSave({
    backend: memorySaveBackend(),
    game: "beacon-bastion-test",
    systems: [legacySystem(runner.ctx), worldSystem(runner.ctx), defenseSystem(runner.ctx)],
  });

/** A run with something to save on every section: towers, a build rising, purse, walls, a boss and a wave. */
function playedIntoWave(): void {
  for (let wave = 0; wave < 6; wave += 1) {
    session.encounter.openWave();
    session.encounter.completeWave();
  }
  runner.ui.invoke("beacon.place", { kind: "tower_archer", slot: "plot-1" });
  world().set("keep.gold", 200);
  runner.ui.invoke("beacon.act", { action: "tower_archer:trunk:1", target: "tower_archer-1" });
  runner.ui.invoke("beacon.place", { kind: "tower_cannon", slot: "plot-4" });
  advanceKeep(runner, 1);
  world().set("keep.lives", 11);
  world().set("keep.bounty_earned", 133);
  session.boss = {
    instanceId: "warden-1",
    unitId: WARDEN_ID,
    state: createBossState(bossProfile(WARDEN_ID)!.phases),
    stance: "opening",
  };
}

describe("the keep's save document", () => {
  test("the world section brings back purse, walls, towers with their levels and a build mid-rise", async () => {
    playedIntoWave();
    const facts = { ...world().facts() };
    const save = documentSave();
    await save.save();

    // A fresh defense, as a reload would build it, then the document read back.
    runner.ui.invoke("beacon.act", { action: "sell", target: "tower_archer-1" });
    advanceKeep(runner, 0.25);
    resetSession();
    await save.load();

    expect(world().facts()).toEqual(facts);
    expect(towerLevel(world(), "tower_archer-1")).toBe(2);
    expect(runner.ctx.scene.entity.get("tower_archer-1")).not.toBeNull();
    expect(world().orders("build")[0]?.progress).toBeCloseTo(0.25);
    expect(session.encounter.view().wave).toBe(7);
    expect(session.boss?.unitId).toBe(WARDEN_ID);
    advanceKeep(runner, 3);
    expect(runner.ctx.scene.entity.get("tower_cannon-2")).not.toBeNull();
  });

  test("a document from before the keep was a world loads as a fresh keep with its old purse and walls", async () => {
    const written = new Map<string, string>();
    const backend = {
      read: (key: string) => Promise.resolve(written.get(key) ?? null),
      write: (key: string, value: string) => Promise.resolve(void written.set(key, value)),
      remove: (key: string) => Promise.resolve(void written.delete(key)),
    };
    const old = createGameSave({ backend, game: "beacon-bastion-test", systems: [defenseSystem(runner.ctx)] });
    await old.save();
    // Rewrite the stored section the way the old build wrote it: purse, lives and towers inside `defense`.
    const [key, stored] = [...written.entries()].find(([, value]) => value.includes("\"defense\""))!;
    const document = JSON.parse(stored);
    Object.assign(document.value.systems.defense, {
      gold: 77,
      lives: 9,
      waveReady: true,
      waveStarted: true,
      lastWaveBonus: 0,
      gameOver: false,
      victory: false,
      towerSeq: 1,
      towers: [{ instanceId: "tower-1", catalogId: "tower_archer", plotId: "plot-1", level: 2, cooldownSeconds: 0 }],
      queue: { jobs: [] },
    });
    written.set(key, JSON.stringify(document));

    runner.ui.invoke("beacon.place", { kind: "tower_archer", slot: "plot-2" });
    const loaded = createGameSave({ backend, game: "beacon-bastion-test", systems: [legacySystem(runner.ctx), worldSystem(runner.ctx), defenseSystem(runner.ctx)] });
    await loaded.load();

    expect(world().num("keep.gold")).toBe(77);
    expect(world().num("keep.lives")).toBe(9);
    expect(world().fact("keep.wave_started")).toBe(true);
    expect(world().instances()).toEqual([]);
  });

  test("an unreadable world section falls back to a fresh keep instead of a half-built field", () => {
    const system = worldSystem(runner.ctx);
    runner.ui.invoke("beacon.place", { kind: "tower_archer", slot: "plot-2" });
    system.restore({ time: 0, facts: { "keep.gold": 5, "keep.lives": 3 }, log: [], instances: { "ghost-1": { kind: "tower_ghost", slot: "plot-9", ready: true } } });
    expect(world().instances()).toEqual([]);
    expect(world().num("keep.gold")).toBe(openingGold(legacy.read(runner.ctx)));
    expect(world().num("keep.lives")).toBe(STARTING_LIVES);
    system.restore("not a world");
    expect(world().num("keep.lives")).toBe(STARTING_LIVES);
  });

  test("the defense section is only the live sim: director, raiders and the Warden", () => {
    playedIntoWave();
    const snapshot = JSON.parse(JSON.stringify(captureDefense(runner.ctx)));
    expect(validDefenseSave(snapshot)).toBe(true);
    expect(Object.keys(snapshot).sort()).toEqual(["abilities", "boss", "clock", "countdown", "creepSeq", "creeps", "encounter", "openingComposition", "pressure"]);
  });

  test("the bank is its own section, so a new run does not clear it", async () => {
    playedIntoWave();
    const banked = {
      standing: 18,
      bankedGold: 120,
      offer: drawRelics("beacon:save"),
      run: { run: 3, completed: 2, haul: 0, changeId: "gate", bankedTotal: 240, lostTotal: 0, bestHaul: 120 },
    };
    writeLegacy(runner.ctx, banked);
    expect(world().fact("keep.banked")).toBe(false);

    const save = documentSave();
    await save.save();

    resetSession();
    writeLegacy(runner.ctx, freshLegacy());
    await save.load();

    expect(legacy.read(runner.ctx)).toEqual(banked);
    expect(session.encounter.view().wave).toBe(7);
  });

  test("an unreadable bank section is refused rather than half applied", async () => {
    expect(upgradeLegacy({ standing: -1, runs: 0, bankedGold: 0, boonId: null, offer: [] })).toBeNull();
    expect(upgradeLegacy({ standing: 1, runs: 0 })).toBeNull();
    expect(upgradeLegacy(freshLegacy())).not.toBeNull();

    const save = createGameSave({
      backend: memorySaveBackend(),
      game: "beacon-bastion-test",
      systems: [legacySystem(runner.ctx)],
    });
    await save.save();
    writeLegacy(runner.ctx, { ...freshLegacy(), standing: 99 });
    await save.load();
    expect(legacy.read(runner.ctx).standing).toBe(0);
  });
});
