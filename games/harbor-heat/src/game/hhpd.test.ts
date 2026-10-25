import { describe, expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { game } from "../game.config";
import { loop } from "../loop";
import { content } from "./content";
import { handrollOf, type Handroll } from "./handroll";
import { courierRuntime, courierStore, DISPATCH, tickCourier } from "./jobs/courier";

const STEP = 1 / 60;

type Booted = ReturnType<typeof boot>;

/** One simulation step: witness memory and the search clock run on the world clock. */
function step(ctx: Booted, handroll: Handroll): void {
  ctx.time.advance(STEP);
  handroll.tick(ctx, STEP);
}

function run(ctx: Booted, handroll: Handroll, seconds: number): void {
  for (let t = 0; t < seconds; t += STEP) step(ctx, handroll);
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

describe("HHPD heat is witness-gated", () => {
  test("a crime nobody sees raises no heat; the same crime in front of a witness does", () => {
    const ctx = boot();
    const handroll = handrollOf(ctx);
    unwatch(ctx);

    handroll.addHeat(ctx, 150);
    step(ctx, handroll);
    expect(handroll.wanted().heat).toBe(0);
    expect(handroll.wanted().stars).toBe(0);

    watch(ctx);
    step(ctx, handroll);
    handroll.addHeat(ctx, 150);
    step(ctx, handroll);
    expect(handroll.wanted().heat).toBeCloseTo(150, 5);
    expect(handroll.wanted().stars).toBe(2);
  });

  test("the search area sits at the last sighting, not on the moving player", () => {
    const ctx = boot();
    const handroll = handrollOf(ctx);
    unwatch(ctx);
    watch(ctx);
    step(ctx, handroll);
    handroll.addHeat(ctx, 180);
    step(ctx, handroll);
    const seen = handroll.wanted().search;
    expect(seen).not.toBeNull();
    const sighting = ctx.scene.entity.get(ctx.player.userId)!.position;
    expect(seen!.center[0]).toBeCloseTo(sighting[0], 5);
    expect(seen!.center[1]).toBeCloseTo(sighting[2], 5);
    expect(seen!.radius).toBeGreaterThan(0);

    // The player breaks line of sight and runs: HHPD keeps searching where they were seen.
    ctx.scene.entity.setPose(ctx.player.userId, {
      position: [sighting[0] + 70, ctx.world.groundHeightAt(sighting[0] + 70, sighting[2]), sighting[2]],
    });
    run(ctx, handroll, 1 + STEP);
    const search = handroll.wanted().search!;
    expect(search.center[0]).toBeCloseTo(sighting[0], 3);
    expect(search.center[1]).toBeCloseTo(sighting[2], 3);
    expect(search.radius).toBeGreaterThanOrEqual(seen!.radius);
  });

  test("heat decays once nobody is looking, and pursuit stands down", () => {
    const ctx = boot();
    const handroll = handrollOf(ctx);
    unwatch(ctx);
    watch(ctx);
    step(ctx, handroll);
    handroll.addHeat(ctx, 220);
    step(ctx, handroll);
    expect(handroll.wanted().stars).toBeGreaterThan(0);

    // Break away: nobody can see the player, and the search stays on the last sighting behind them.
    unwatch(ctx);
    const at = ctx.scene.entity.get(ctx.player.userId)!.position;
    ctx.scene.entity.setPose(ctx.player.userId, {
      position: [at[0] + 120, ctx.world.groundHeightAt(at[0] + 120, at[2]), at[2]],
    });
    run(ctx, handroll, 4);
    const midHeat = handroll.wanted().heat;
    expect(midHeat).toBeGreaterThan(0);
    run(ctx, handroll, 40);
    expect(handroll.wanted().heat).toBeLessThan(midHeat);
    expect(handroll.wanted().stars).toBe(0);
    expect(ctx.scene.entity.list().filter((e) => e.name.startsWith("cop_") || e.id.startsWith("cruiser_"))).toHaveLength(0);
  });
});

describe("heat sweeps a live courier run", () => {
  test("officers working the block fail the parcel with its own reason", () => {
    const ctx = boot();
    const handroll = handrollOf(ctx);
    unwatch(ctx);
    ctx.game.commands.run("courier.accept", {});
    expect(courierStore.read(ctx).phase).toBe("running");

    watch(ctx);
    step(ctx, handroll);
    handroll.addHeat(ctx, 130);
    step(ctx, handroll);
    expect(handroll.wanted().stars).toBeGreaterThanOrEqual(2);

    tickCourier(ctx, STEP);
    expect(courierStore.read(ctx).phase).toBe("lost");
    expect(courierRuntime(ctx).state()?.outcome).toBe("heat_sweep");
  });

  test("a cool run is not swept", () => {
    const ctx = boot();
    const handroll = handrollOf(ctx);
    unwatch(ctx);
    ctx.game.commands.run("courier.accept", {});
    step(ctx, handroll);
    tickCourier(ctx, STEP);
    expect(courierStore.read(ctx).phase).toBe("running");
    expect(courierRuntime(ctx).state()?.outcome).not.toBe("heat_sweep");
  });
});


