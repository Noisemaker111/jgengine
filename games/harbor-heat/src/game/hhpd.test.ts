import { describe, expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { game } from "../game.config";
import { loop } from "../loop";
import { content } from "./content";
import { streetPlayOf, type StreetPlay } from "./streetPlay";
import { courierRuntime, courierStore, DISPATCH, tickCourier } from "./jobs/courier";

const STEP = 1 / 60;

type Booted = ReturnType<typeof boot>;

/** One simulation step: witness memory and the search clock run on the world clock. */
function step(ctx: Booted, streetPlay: StreetPlay): void {
  ctx.time.advance(STEP);
  streetPlay.tick(ctx, STEP);
}

function run(ctx: Booted, streetPlay: StreetPlay, seconds: number): void {
  for (let t = 0; t < seconds; t += STEP) step(ctx, streetPlay);
}

/** A watched player: a bystander stands on the player's east side, facing west. */
function watch(ctx: Booted, id = "ped_witness"): void {
  const player = ctx.scene.entity.get(ctx.player.userId)!;
  ctx.scene.entity.spawn("ped_beach", {
    id,
    position: [player.position[0] + 4, player.position[1], player.position[2]],
    rotationY: -Math.PI / 2,
    role: "npc",
  });
}

/** Clear the street: no pedestrian, resident or officer can see the player. */
function unwatch(ctx: Booted): void {
  for (const entity of ctx.scene.entity.list()) {
    if (entity.name.startsWith("ped_") || entity.name.startsWith("resident-") || entity.name.startsWith("cop_")) {
      ctx.scene.entity.despawn(entity.id);
    }
  }
}

function boot() {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "heat-test", isNew: true } });
  loop.onInit(ctx);
  loop.onNewPlayer(ctx);
  ctx.scene.entity.setPose(ctx.player.userId, {
    position: [DISPATCH[0], ctx.world.groundHeightAt(DISPATCH[0], DISPATCH[1]), DISPATCH[1]],
  });
  ctx.game.commands.run("game.start", {});
  return ctx;
}

/** The player's world position, for tests that stage a getaway. */
function playerAt(ctx: Booted): readonly [number, number, number] {
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player === null) throw new Error("the player is not in the scene");
  return player.position;
}

describe("HHPD heat is witness-gated", () => {
  test("a crime nobody sees raises no heat; the same crime in front of a witness does", () => {
    const ctx = boot();
    const streetPlay = streetPlayOf(ctx);
    unwatch(ctx);

    streetPlay.addHeat(ctx, 150);
    step(ctx, streetPlay);
    expect(streetPlay.wanted().heat).toBe(0);
    expect(streetPlay.wanted().stars).toBe(0);

    watch(ctx);
    step(ctx, streetPlay);
    streetPlay.addHeat(ctx, 150);
    step(ctx, streetPlay);
    expect(streetPlay.wanted().heat).toBeCloseTo(150, 5);
    expect(streetPlay.wanted().stars).toBe(2);
  });

  test("the search area sits at the last sighting, not on the moving player", () => {
    const ctx = boot();
    const streetPlay = streetPlayOf(ctx);
    unwatch(ctx);
    watch(ctx);
    step(ctx, streetPlay);
    streetPlay.addHeat(ctx, 180);
    step(ctx, streetPlay);
    const seen = streetPlay.wanted().search;
    expect(seen).not.toBeNull();
    const sighting = ctx.scene.entity.get(ctx.player.userId)!.position;
    expect(seen!.center[0]).toBeCloseTo(sighting[0], 5);
    expect(seen!.center[1]).toBeCloseTo(sighting[2], 5);
    expect(seen!.radius).toBeGreaterThan(0);

    // The player breaks line of sight and runs: HHPD keeps searching where they were seen.
    unwatch(ctx);
    ctx.scene.entity.setPose(ctx.player.userId, {
      position: [sighting[0] + 200, ctx.world.groundHeightAt(sighting[0] + 200, sighting[2]), sighting[2]],
    });
    run(ctx, streetPlay, 1 + STEP);
    const search = streetPlay.wanted().search!;
    expect(search.center[0]).toBeCloseTo(sighting[0], 3);
    expect(search.center[1]).toBeCloseTo(sighting[2], 3);
    expect(search.radius).toBeGreaterThanOrEqual(seen!.radius);
  });

  test("heat decays once nobody is looking, and pursuit stands down", () => {
    const ctx = boot();
    const streetPlay = streetPlayOf(ctx);
    unwatch(ctx);
    watch(ctx);
    step(ctx, streetPlay);
    streetPlay.addHeat(ctx, 220);
    step(ctx, streetPlay);
    expect(streetPlay.wanted().stars).toBeGreaterThan(0);

    // Break away: nobody can see the player, and the search stays on the last sighting behind them.
    unwatch(ctx);
    const at = ctx.scene.entity.get(ctx.player.userId)!.position;
    ctx.scene.entity.setPose(ctx.player.userId, {
      position: [at[0] + 120, ctx.world.groundHeightAt(at[0] + 120, at[2]), at[2]],
    });
    run(ctx, streetPlay, 4);
    const midHeat = streetPlay.wanted().heat;
    expect(midHeat).toBeGreaterThan(0);
    run(ctx, streetPlay, 40);
    expect(streetPlay.wanted().heat).toBeLessThan(midHeat);
    expect(streetPlay.wanted().stars).toBe(0);
    expect(ctx.scene.entity.list().filter((e) => e.name.startsWith("cop_") || e.id.startsWith("cruiser_"))).toHaveLength(0);
  });

  test("the search area grows while the trail is cold and never passes its cap", () => {
    const ctx = boot();
    const streetPlay = streetPlayOf(ctx);
    unwatch(ctx);
    watch(ctx);
    step(ctx, streetPlay);
    streetPlay.addHeat(ctx, 500);
    step(ctx, streetPlay);
    const fresh = streetPlay.wanted().search;
    if (fresh === null) throw new Error("HHPD should be searching the last sighting");
    expect(fresh.radius).toBe(46);

    // Nobody is looking any more: the circle grows 1.4 m a second from the tier's own radius.
    unwatch(ctx);
    const at = playerAt(ctx);
    ctx.scene.entity.setPose(ctx.player.userId, {
      position: [at[0] + 200, ctx.world.groundHeightAt(at[0] + 200, at[2]), at[2]],
    });
    run(ctx, streetPlay, 4);
    expect(streetPlay.wanted().search?.radius).toBeCloseTo(46 + 4 * 1.4, 0);

    for (let second = 0; second < 60; second += 1) {
      run(ctx, streetPlay, 1);
      const search = streetPlay.wanted().search;
      if (search !== null) expect(search.radius).toBeLessThanOrEqual(90);
    }
  });

  test("officer waves arrive on the star count's own pace", () => {
    const ctx = boot();
    const streetPlay = streetPlayOf(ctx);
    const officers = (): number =>
      ctx.scene.entity.list().filter((e) => e.name === "cop_patrol" || e.name === "cop_swat").length;
    unwatch(ctx);
    watch(ctx);
    step(ctx, streetPlay);
    // Two stars want two officers, and the wave pace there is 5.6 seconds.
    streetPlay.addHeat(ctx, 130);
    step(ctx, streetPlay);
    expect(streetPlay.wanted().stars).toBe(2);
    expect(officers()).toBe(1);

    run(ctx, streetPlay, 5);
    expect(officers()).toBe(1);
    run(ctx, streetPlay, 1);
    expect(officers()).toBe(2);
  });
});

describe("heat sweeps a live courier run", () => {
  test("officers working the block fail the parcel with its own reason", () => {
    const ctx = boot();
    const streetPlay = streetPlayOf(ctx);
    unwatch(ctx);
    ctx.game.commands.run("courier.accept", {});
    expect(courierStore.read(ctx).phase).toBe("running");

    watch(ctx);
    step(ctx, streetPlay);
    streetPlay.addHeat(ctx, 130);
    step(ctx, streetPlay);
    expect(streetPlay.wanted().stars).toBeGreaterThanOrEqual(2);

    tickCourier(ctx, STEP);
    expect(courierStore.read(ctx).phase).toBe("lost");
    expect(courierRuntime(ctx).state()?.outcome).toBe("heat_sweep");
  });

  test("a cool run is not swept", () => {
    const ctx = boot();
    const streetPlay = streetPlayOf(ctx);
    unwatch(ctx);
    ctx.game.commands.run("courier.accept", {});
    step(ctx, streetPlay);
    tickCourier(ctx, STEP);
    expect(courierStore.read(ctx).phase).toBe("running");
    expect(courierRuntime(ctx).state()?.outcome).not.toBe("heat_sweep");
  });
});


