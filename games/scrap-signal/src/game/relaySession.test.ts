import { afterEach, expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { memorySaveBackend } from "@jgengine/core/game/saveStore";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { content } from "./content";
import { lootTables } from "./entities/enemies/loot-tables";
import { pickCharacter, resetCharacterState } from "./characters";
import { RELAY, registerRelay, relayEnemyDied, relayLoop, relayStore, tickRelay } from "./relay";

afterEach(resetCharacterState);

function boot(backend = memorySaveBackend()) {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "relay-session-test", assets: createAssetCatalog(), multiplayer: "off", persist: true }),
    content, player: { userId: "reclaimer", isNew: true },
    save: { backend, key: "relay-session-test", mode: "manual" },
  });
  ctx.scene.entity.spawn("reactor_hunter", { id: "reclaimer", position: [RELAY.x, 0, RELAY.z] });
  for (const table of lootTables) ctx.game.loot.register(table);
  registerRelay(ctx, () => {});
  ctx.game.events.on("entity.died", (event) => relayEnemyDied(ctx, event));
  pickCharacter("gunk");
  setGamePhase(ctx, "playing");
  return ctx;
}

function clearWave(ctx: ReturnType<typeof boot>) {
  for (const id of relayStore.read(ctx).enemies) {
    ctx.scene.entity.effect({ from: ctx.player.userId, to: id, effect: "damage", via: { amount: 10000 } });
  }
}

/** The contract's ambushes are the shared session loop's sessions, carrying the signal each one banks. */
test("the session loop opens a wave, carries its signal and settles it at the boundary", () => {
  const ctx = boot();
  const loop = relayLoop(ctx);
  expect(loop.kind()).toBe("wave");
  expect(loop.phase()).toBe("idle");

  ctx.game.commands.run("relay.start", {});
  expect(loop.phase()).toBe("open");
  expect(loop.snapshot()).toMatchObject({ session: 1, closed: 0, carried: 0 });
  expect(relayStore.read(ctx).wave).toBe(1);

  // Overclock banks signal during the ambush: the wave carries exactly the seconds it uploaded.
  ctx.game.commands.run("relay.overclock", {});
  tickRelay(ctx, 4);
  expect(loop.carried()).toBe(4);
  expect(relayStore.read(ctx).upload).toBe(4);

  // Clearing the ambush and finishing the upload closes the wave and opens the next one.
  clearWave(ctx);
  tickRelay(ctx, 2);
  expect(loop.snapshot()).toMatchObject({ session: 2, closed: 1, carried: 0 });
  expect(relayStore.read(ctx).wave).toBe(2);
  expect(relayStore.read(ctx).upload).toBe(0);
});

test("a lost contract settles its wave and the probe reports the closed session", () => {
  const ctx = boot();
  const loop = relayLoop(ctx);
  ctx.game.commands.run("relay.start", {});
  tickRelay(ctx, RELAY.seconds);
  expect(loop.phase()).toBe("closed");
  expect(loop.snapshot().closed).toBe(1);
  expect(relayStore.read(ctx).phase).toBe("lost");
  const probe = (globalThis as { __jgengineRun?: { read(): { session: number; phase: string; kind: string | null; closed: number } } }).__jgengineRun;
  expect(probe?.read()).toMatchObject({ session: 1, phase: "closed", kind: "wave", closed: 1 });
});
