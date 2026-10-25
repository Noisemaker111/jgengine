import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { physics, VAULT_SPAWN, world } from "../world";
import { createDeepwardDamage, createDeepwardWeapon, sidearmDefinition } from "./combat";
import { keybinds, registerControls, tick, viewStore } from "./controls";
import { newDive, takeLoot } from "./state";

function diveContext() {
  const definition = defineGameDefinition({
    name: "Deepward action invariant", multiplayer: undefined, persist: false,
    world, physics, input: keybinds, lifecycle: "always-live",
    simulation: { hz: 120, maxCatchUpSteps: 8 },
  });
  const ctx = createGameContext({
    definition, player: { userId: "diver", isNew: true },
    content: { entityById(id) {
      if (id === "diver") return { stats: { health: { max: 100 }, oxygen: { max: 110 }, ammo: { max: 6 } } };
      if (id === "fitter") return { stats: { health: { max: 80 } } };
      return null;
    } },
  });
  registerControls(ctx);
  ctx.scene.entity.spawn("diver", { id: ctx.player.userId, position: VAULT_SPAWN, role: "player" });
  viewStore.write(ctx, { ...viewStore.read(ctx), mode: "dive", dive: newDive(1) });
  return ctx;
}

function advanceFrames(ctx: ReturnType<typeof diveContext>, count: number): void {
  // Fixed simulated frames, not a wall-clock wait or an input-dispatch substitute.
  for (let frame = 0; frame < count; frame++) ctx.sim.advance(0.05, dt => tick(ctx, dt));
}

/** The held weapon's live rounds, as the HUD's ammo line reads them. */
const loaded = (ctx: ReturnType<typeof diveContext>) => viewStore.read(ctx).ammo!.loaded;

test("actual Deepward bindings register action commands and preserve discrete keys", () => {
  const ctx = diveContext();
  expect(keybinds.deepwardFire).toEqual(["mouse0"]);
  expect(keybinds.deepwardInteract).toEqual(["KeyE"]);
  expect(keybinds.deepwardReload).toEqual(["KeyR"]);
  expect(keybinds.deepwardCache).toEqual(["Tab"]);
  for (const action of Object.keys(keybinds).filter(name => name.startsWith("deepward"))) {
    expect(ctx.game.commands.has(action)).toBe(true);
  }
  for (const name of ["deepward.interact", "deepward.fire", "deepward.reload", "deepward.cache"]) {
    expect(ctx.game.commands.has(name)).toBe(true);
  }
});

test("a press fires on the press frame and a press while cooling is remembered once the gun is ready", () => {
  const ctx = diveContext();
  // Command-boundary invariant, not a substitute for the parent's native mouse press.
  ctx.input.publish([]);
  advanceFrames(ctx, 1);
  expect(loaded(ctx)).toBe(6);
  ctx.game.commands.run("deepwardFire", {});
  expect(loaded(ctx)).toBe(5);
  expect(viewStore.read(ctx).dive!.flash).toBe(0.12);
  // The shared weapon remembers a pull made while its rate gate is cooling instead of dropping it.
  ctx.game.commands.run("deepward.fire", {});
  expect(loaded(ctx)).toBe(5);
  const frame = ctx.sim.advance(0.05, dt => tick(ctx, dt));
  expect(frame.steps).toBeGreaterThan(1);
  expect(loaded(ctx)).toBe(5);
  advanceFrames(ctx, 8);
  expect(loaded(ctx)).toBe(4);
  ctx.game.commands.run("deepwardReload", {});
  expect(viewStore.read(ctx).ammo!.reloading).toBe(true);
  ctx.game.commands.run("deepwardFire", {});
  expect(loaded(ctx)).toBe(4);
});

test("held fire and the same-frame action command share one shot, repeat at cadence, and stop on release", () => {
  const ctx = diveContext();
  // FrameDriver publishes held input and advances simulation before dispatching
  // the press command. Exercise those public boundaries in that order.
  ctx.input.publish(["deepwardFire"]);
  advanceFrames(ctx, 1);
  expect(loaded(ctx)).toBe(5);
  ctx.game.commands.run("deepwardFire", {});
  ctx.game.commands.run("deepward.fire", {});
  expect(loaded(ctx)).toBe(5);
  advanceFrames(ctx, 4);
  expect(loaded(ctx)).toBe(5);
  advanceFrames(ctx, 2);
  expect(loaded(ctx)).toBe(4);
  expect(viewStore.read(ctx).dive!.flash).toBeGreaterThan(0);

  ctx.input.publish([]);
  advanceFrames(ctx, 8);
  expect(loaded(ctx)).toBe(4);
  // A frame with no simulation step can dispatch the press first; the next
  // held-input simulation must still respect that accepted shot's cadence.
  ctx.input.publish(["deepwardFire"]);
  ctx.game.commands.run("deepwardFire", {});
  advanceFrames(ctx, 1);
  expect(loaded(ctx)).toBe(3);
});

test("equipped rifle held fire preserves its interval and reload gate, then resumes the moment the reload clears", () => {
  const ctx = diveContext();
  const looted = takeLoot(viewStore.read(ctx).dive!, "fitter", "service-rifle");
  viewStore.update(ctx, view => ({ ...view, dive: looted.ok ? looted.dive : view.dive }));
  ctx.game.commands.run("deepward.equip", { hand: "service-rifle" });
  expect(viewStore.read(ctx).dive!.hand).toBe("service-rifle");
  ctx.input.publish(["deepwardFire"]);
  advanceFrames(ctx, 8);
  expect(loaded(ctx)).toBe(6);
  advanceFrames(ctx, 3);
  expect(loaded(ctx)).toBe(5);
  advanceFrames(ctx, 6);
  expect(loaded(ctx)).toBe(5);
  advanceFrames(ctx, 5);
  expect(loaded(ctx)).toBe(4);

  ctx.game.commands.run("deepwardReload", {});
  const reserve = viewStore.read(ctx).ammo!.reserve;
  advanceFrames(ctx, 24);
  expect(viewStore.read(ctx).ammo!.reloading).toBe(true);
  expect(loaded(ctx)).toBe(4);
  expect(viewStore.read(ctx).ammo!.reserve).toBe(reserve);
  // Held through the reload, the weapon is ready the instant the magazine is back: the cooldown
  // ran on the simulation step, so no extra cycle is owed after 1.3 s of reloading.
  advanceFrames(ctx, 3);
  expect(viewStore.read(ctx).ammo!.reloading).toBe(false);
  expect(viewStore.read(ctx).ammo!.reserve).toBe(reserve - 2);
  expect(loaded(ctx)).toBe(5);
  expect(viewStore.read(ctx).dive!.flash).toBeGreaterThan(0);
  ctx.input.publish([]);
  advanceFrames(ctx, 11);
  expect(loaded(ctx)).toBe(5);
});

test("a press after a released cooldown fires on that frame, not a cycle later", () => {
  const ctx = diveContext();
  ctx.input.publish([]);
  advanceFrames(ctx, 1);
  expect(loaded(ctx)).toBe(6);
  ctx.game.commands.run("deepwardFire", {});
  expect(loaded(ctx)).toBe(5);
  // 0.4 s with the trigger up, past the issue hand's 0.32 s cycle, and nothing is holding the clock.
  advanceFrames(ctx, 8);
  expect(loaded(ctx)).toBe(5);
  ctx.game.commands.run("deepwardFire", {});
  expect(loaded(ctx)).toBe(4);
});

test("the issue hand scores the same shots per second at 30, 60 and 144 steps", () => {
  const stepsPerSecond = [30, 60, 144];
  const shots = stepsPerSecond.map(steps => {
    const weapon = createDeepwardWeapon(sidearmDefinition(18), {
      rng: () => 0.5,
      damage: createDeepwardDamage(() => 0.5),
      at: () => [0, 0, 0],
      print: () => null,
    });
    weapon.setTrigger(true);
    let fired = 0;
    for (let step = 0; step < steps; step++) fired += weapon.tick(1 / steps).shots.length;
    weapon.dispose();
    return fired;
  });
  expect(shots).toEqual([4, 4, 4]);
});

test("one cache action remains open across held-input simulation steps, with UI close intact", () => {
  const ctx = diveContext();
  ctx.input.publish(["deepwardCache", "deepwardFire"]);
  ctx.game.commands.run("deepwardCache", {});
  expect(viewStore.read(ctx).panel).toBe("cache");
  const frame = ctx.sim.advance(0.05, dt => tick(ctx, dt));
  expect(frame.steps).toBeGreaterThan(1);
  expect(viewStore.read(ctx).panel).toBe("cache");
  expect(viewStore.read(ctx).dive!.elapsed).toBeGreaterThan(0);
  expect(loaded(ctx)).toBe(6);
  ctx.input.publish(["deepwardCache"]);
  ctx.game.commands.run("deepward.cache", {});
  expect(viewStore.read(ctx).panel).toBeNull();
  advanceFrames(ctx, 1);
  expect(viewStore.read(ctx).panel).toBeNull();
});
