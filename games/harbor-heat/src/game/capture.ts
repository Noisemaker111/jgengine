import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { vehicleById } from "./entities/vehicles/catalog";
import { harborProfile } from "./menuProfile";
import { focusHarborVerb } from "./ui/menu/menuFocus";
import { harborSave, saveHarborState } from "./save";
import { startedStore } from "./commands";
import { sessionStore } from "./session";
import { handrollOf } from "./handroll";
import { courierStore } from "./jobs/courier";

/** What a staged chase should look like when the capture takes it. */
export type StageMode = "chase";

/** One simulated step, at the cadence the driving and pursuit slices are tuned for. */
const STEP = 1 / 60;

/** Heat that lands the player deep in a pursuit: three stars summons cruisers. */
const CHASE_HEAT = 380;

/**
 * Stage the state a chase proof needs: the player in a car with a live pursuit around them.
 * The heat is the response system's own input, the cruisers are spawned by its own tick, and the
 * cars are driven by its own driver - this only picks the car and runs the tick forward.
 */
export function stageChase(ctx: GameContext, mode: StageMode = "chase", seconds = 10): void {
  void mode;
  const handroll = handrollOf(ctx);
  // Heat is witness-gated, so the scene includes a bystander: the response system only accepts the
  // heat it is fed while somebody can see the player commit the crime.
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player !== null && ctx.scene.entity.get(WITNESS_ID) === null) {
    ctx.scene.entity.spawn("ped_beach", {
      id: WITNESS_ID,
      position: [player.position[0] + 4, player.position[1], player.position[2]],
      rotationY: -Math.PI / 2,
      role: "npc",
    });
  }
  tick(ctx, handroll, STEP * 4);
  handroll.addHeat(ctx, CHASE_HEAT);
  // One more beat so the response takes the sighting and locks a search area on the player.
  tick(ctx, handroll, STEP * 6);
  if (handroll.drivingVehicleId() === null) {
    const from = ctx.scene.entity.get(ctx.player.userId);
    const car = ctx.scene.entity.list()
      .filter((entity) => vehicleById(entity.name) !== undefined && !entity.id.startsWith("cruiser_"))
      .sort((a, b) => (from === null ? 0 : distance(a.position, from.position) - distance(b.position, from.position)))[0];
    if (car !== undefined) handroll.enterVehicle(ctx, car.id);
  }
  tick(ctx, handroll, seconds);
}

/** The bystander whose sighting lets a staged crime raise heat at all. */
export const WITNESS_ID = "ped_witness_0";

function tick(ctx: GameContext, handroll: ReturnType<typeof handrollOf>, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += STEP) {
    ctx.time.advance(STEP);
    handroll.tick(ctx, STEP);
  }
}

function distance(a: readonly number[], b: readonly number[]): number {
  return Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[2] ?? 0) - (b[2] ?? 0));
}

export function stageReadout(ctx: GameContext): { stars: number; heat: number; cruisers: number; driving: boolean } {
  const wanted = handrollOf(ctx).wanted();
  return {
    stars: wanted.stars,
    heat: Math.round(wanted.heat),
    cruisers: ctx.scene.entity.list().filter((entity) => entity.id.startsWith("cruiser_")).length,
    driving: handrollOf(ctx).drivingVehicleId() !== null,
  };
}

/**
 * Dev-only capture staging for the chase proof: three stars, cruisers on the scene, the player on
 * the move. Play reaches it by committing crimes in front of witnesses.
 */
export function registerCaptureCommands(ctx: GameContext): void {
  if (!import.meta.env.DEV) return;
  ctx.game.commands.define<{ mode?: StageMode }>("chase.stage", {
    apply(state, input) {
      stageChase(state, input.mode ?? "chase");
      return state;
    },
  });
  // The courier behind the wheel of a fresh car on the boulevard, so a capture sees the dash.
  ctx.game.commands.define<{ vehicle?: string }>("drive.stage", {
    apply(state, input) {
      const handroll = handrollOf(state);
      const player = state.scene.entity.get(state.player.userId);
      if (player === null || handroll.drivingVehicleId() !== null) return state;
      const kind = vehicleById(input?.vehicle ?? "") === undefined ? "car_sport" : input!.vehicle!;
      const [x, , z] = player.position;
      const id = state.scene.entity.spawn(kind, { position: [x, state.world.groundHeightAt(x, z), z], rotationY: player.rotationY ?? 0, role: "prop" });
      handroll.enterVehicle(state, id);
      return state;
    },
  });
  // The end-of-run receipt, paid or missed, without carrying a parcel across town.
  ctx.game.commands.define<{ won?: boolean }>("result.stage", {
    apply(state, input) {
      const won = input?.won !== false;
      courierStore.write(state, { ...courierStore.read(state), phase: won ? "won" : "lost", receipt: { won, reward: won ? 340 : 0, reason: won ? null : "Deadline passed" } });
      sessionStore.write(state, { ...sessionStore.read(state), notice: "courier" });
      return state;
    },
  });
  // The menu states a capture host reaches: name a courier, keep the bay, stand on the board.
  ctx.game.commands.define("menu.bays", {
    apply(state) {
      focusHarborVerb("keeps");
      startedStore.write(state, false);
      sessionStore.write(state, { ...sessionStore.read(state), paused: false });
      return state;
    },
  });
  ctx.game.commands.define<{ driver?: string }>("menu.driver", {
    apply(state, input) {
      harborProfile.driver = typeof input?.driver === "string" && input.driver.length > 0 ? input.driver : null;
      return state;
    },
  });
  ctx.game.commands.define("menu.saveDoc", {
    apply(state) {
      void (async () => {
        const save = harborSave(state);
        const bays = ["coast", "docks", "uptown"];
        const driver = harborProfile.driver;
        const thumb = harborProfile.thumbnail;
        if (!bays.includes(save.slot())) await save.switchSlot("coast", { flush: false });
        // Loading the bay restores its profile section; put the capture's courier back before writing.
        harborProfile.driver = driver;
        harborProfile.thumbnail = thumb;
        await saveHarborState(state);
        await save.save();
      })();
      return state;
    },
  });
  ctx.game.commands.define("menu.title", {
    apply(state) {
      focusHarborVerb(null);
      startedStore.write(state, false);
      sessionStore.write(state, { ...sessionStore.read(state), paused: false });
      return state;
    },
  });
}






