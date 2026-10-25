import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { memorySaveBackend, type SaveBackend } from "@jgengine/core/game/saveStore";

import { game } from "../game.config";
import { loop } from "../loop";
import { content } from "./content";
import { handrollOf } from "./handroll";
import {
  HARBOR_SAVE_VERSION,
  STORE_POLICY,
  bindHarborSave,
  createHarborSave,
  harborSave,
  harborSaveDigest,
  loadHarborSave,
  migrateHarborSave,
  saveHarborState,
} from "./save";
import { convoyRunners, mission, patchMission } from "./runState";
import { courierStore, DISPATCH } from "./jobs/courier";
import { earn, cashEntries } from "./cash";

const HERO = "save-hero";
const STEP = 1 / 60;

/** One boot against a shared backend, mounted exactly as the game mounts it. */
function boot(backend: SaveBackend): GameContext {
  const ctx = createGameContext({
    definition: game.game,
    content,
    player: { userId: HERO, isNew: true },
    save: { backend, mode: "manual", key: "harbor-save-test" },
  });
  // Play writes the run document to local storage; a test names the same backend as the world.
  bindHarborSave(ctx, createHarborSave(ctx, { backend, slot: "default" }));
  loop.onInit(ctx);
  loop.onNewPlayer(ctx);
  ctx.game.commands.run("game.start", {});
  return ctx;
}

/** The boot restore runs asynchronously; a reload waits for it the way a save point does. */
async function bootLoaded(backend: SaveBackend): Promise<GameContext> {
  const ctx = boot(backend);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(await ctx.game.save!.load()).toBe(true);
  expect(await loadHarborSave(ctx)).toBe(true);
  return ctx;
}

/** A witness on the player's east side so a reported crime is actually seen. */
function watch(ctx: GameContext): void {
  const player = ctx.scene.entity.get(ctx.player.userId)!;
  ctx.scene.entity.spawn("ped_beach", {
    id: "save_witness",
    position: [player.position[0] + 4, player.position[1], player.position[2]],
    rotationY: -Math.PI / 2,
    role: "npc",
  });
}

function run(ctx: GameContext, seconds: number): void {
  const handroll = handrollOf(ctx);
  for (let t = 0; t < seconds; t += STEP) {
    ctx.time.advance(STEP);
    handroll.tick(ctx, STEP);
  }
}

describe("harbor-heat save document", () => {
  test("a reload mid-pursuit restores the heat tier, the search area and the journal", async () => {
    const backend = memorySaveBackend();
    const host = boot(backend);
    watch(host);
    handrollOf(host).addHeat(host, 130);
    run(host, 0.3);
    const committed = handrollOf(host).wanted();
    expect(committed.heat).toBeGreaterThan(0);
    expect(committed.stars).toBeGreaterThan(0);
    expect(committed.search).not.toBeNull();
    earn(host, 640, "bounty", "ganger_dock");
    await saveHarborState(host);

    // The reload path: the world snapshot first, the run document after it.
    const reboot = await bootLoaded(backend);

    const restored = handrollOf(reboot).wanted();
    expect(restored.heat).toBeCloseTo(committed.heat, 6);
    expect(restored.stars).toBe(committed.stars);
    expect(restored.peakStars).toBe(committed.peakStars);
    // The search area is the anchor's, recomputed by the next tick the way the live game does it.
    run(reboot, 0.05);
    const searching = handrollOf(reboot).wanted();
    expect(searching.search?.center).toEqual(committed.search?.center);
    expect(searching.search!.radius).toBeCloseTo(committed.search!.radius, 0);
    expect(cashEntries(reboot, 5).some((entry) => entry.reason === "bounty")).toBe(true);
  });

  test("the autosave touch writes the document, so a reload mid-pursuit finds the heat", async () => {
    const backend = memorySaveBackend();
    const host = boot(backend);
    // Let the boot restore settle first: a boot that finds no document adopts the world snapshot's
    // legacy heat once, and this test is about the play loop's own tick, not that upgrade.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await harborSave(host).peek("default")).toBeNull();

    watch(host);
    handrollOf(host).addHeat(host, 130);
    run(host, 0.3);
    const heat = handrollOf(host).wanted().heat;
    expect(heat).toBeGreaterThan(0);

    expect(await harborSave(host).peek("default")).toBeNull();

    // What the play loop does every few seconds; no menu save, no explicit save().
    harborSave(host).touch();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const stored = (await harborSave(host).peek("default")) as {
      systems: { wanted?: { police?: { heat?: { heat?: number } } }; convoy?: unknown };
    } | null;
    expect(stored).not.toBeNull();
    expect(stored!.systems.wanted?.police?.heat?.heat).toBeCloseTo(heat, 6);
  });

  test("the parcel and the mission flags survive a reload", async () => {
    const backend = memorySaveBackend();
    const host = boot(backend);
    host.scene.entity.setPose(host.player.userId, {
      position: [DISPATCH[0], host.world.groundHeightAt(DISPATCH[0], DISPATCH[1]), DISPATCH[1]],
    });
    host.game.commands.run("courier.accept", {});
    expect(courierStore.read(host).phase).toBe("running");
    patchMission(host, { kingpinSpawned: true, bustedHold: 0.4 });
    await saveHarborState(host);
    const parcel = courierStore.read(host);

    const reboot = await bootLoaded(backend);

    const carried = courierStore.read(reboot);
    expect(carried.phase).toBe("running");
    expect(carried.route).toBe(parcel.route);
    expect(carried.remaining).toBeCloseTo(parcel.remaining, 6);
    expect(mission(reboot).kingpinSpawned).toBe(true);
  });

  test("the convoy resumes from the wave it reached", () => {
    const host = boot(memorySaveBackend());
    const runner = convoyRunners(host);
    // The director is driven per tick in play; step it that way so ids are distinct.
    for (let i = 0; i < 14; i += 1) runner.update(1, { alive: 0 });
    const wave = runner.state().wave;
    expect(wave).toBeGreaterThan(0);
    const saved = harborSave(host).capture().systems.convoy as { wave: number };
    expect(saved.wave).toBe(wave);

    const reboot = boot(memorySaveBackend());
    convoyRunners(reboot).restore(saved as never);
    expect(convoyRunners(reboot).state().wave).toBe(wave);
  });

  test("the digest covers the run, and reloading the same state reproduces it", async () => {
    const backend = memorySaveBackend();
    const host = boot(backend);
    watch(host);
    handrollOf(host).addHeat(host, 90);
    run(host, 0.3);
    earn(host, 250, "stash-claim", "stash_1");
    await saveHarborState(host);
    const before = harborSaveDigest(host);

    const reboot = await bootLoaded(backend);
    expect(harborSaveDigest(reboot)).toBe(before);

    // A movement after the load changes the digest the same way for anyone reading it.
    earn(reboot, 5, "bounty");
    expect(harborSaveDigest(reboot)).not.toBe(before);
  });

  test("a version-0 document migrates to the current shape", () => {
    const legacy = { systems: { wanted: { police: {}, peakStars: 2 } }, time: 12 };
    const migrated = migrateHarborSave(legacy, 0);
    expect(migrated.version).toBe(HARBOR_SAVE_VERSION);
    expect(migrated.game).toBe("harbor-heat");
    expect(migrated.systems.wanted).toEqual({ police: {}, peakStars: 2 });
    expect(migrated.time).toBe(12);
  });

  test("every store the game defines is saved by the document, the world snapshot, or declared transient", () => {
    const root = join(import.meta.dir, "..");
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          if (entry !== "node_modules") walk(path);
        } else if (path.endsWith(".ts") && !path.endsWith(".test.ts")) {
          files.push(path);
        }
      }
    };
    walk(root);

    const keys = new Set<string>();
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/defineStore<[^(]*?>\("([^"]+)"/g)) keys.add(match[1]!);
    }
    expect(keys.size).toBeGreaterThan(10);

    const unclassified = [...keys].filter((key) => STORE_POLICY[key] === undefined);
    expect(unclassified).toEqual([]);

    // Every key the policy calls the document's is actually carried by a section.
    const document = harborSave(boot(memorySaveBackend())).capture();
    expect(Object.keys(document.systems).sort()).toEqual(["cash", "convoy", "profile", "run", "vehicles", "wanted"]);
    const run = document.systems.run as Record<string, unknown>;
    expect(Object.keys(run).sort()).toEqual(["cargo", "courier", "courierMission", "courierObjective", "courierSession", "gigs", "mission"]);
    for (const [key, policy] of Object.entries(STORE_POLICY)) {
      if (policy.kind !== "transient") expect(policy.reason.length).toBeGreaterThan(20);
      expect(key.startsWith("harbor.")).toBe(true);
    }
  });
});

