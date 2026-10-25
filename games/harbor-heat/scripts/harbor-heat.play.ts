/**
 * Harbor Heat — heat, search area and a swept courier, proven headlessly.
 *
 * The run starts the game the way the menu does, takes a parcel at dispatch, and then commits the
 * same crime twice: once with nobody on the street (heat must stay at zero) and once with a
 * bystander watching (heat must land, HHPD must open a search at the sighting, and the live parcel
 * must be swept). It then breaks line of sight and lets the trail go cold.
 *
 *   bun run simulate harbor-heat scripts/harbor-heat.play.ts
 */

import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { handrollOf } from "../src/game/handroll";
import { courierRuntime, courierStore, DISPATCH } from "../src/game/jobs/courier";

const CRIME = 130;
const STEP = 1 / 60;
const DECAY_GRACE_TICKS = Math.round(4 / STEP);
const DECAY_TICKS = Math.round(44 / STEP);

let unseenHeat = -1;
let seenHeat = 0;
let searchRadius = 0;
let searchDistance = 0;
let courierOutcome: string | null = null;
let courierPhase = "";
let midDecayHeat = 0;
let finalHeat = 0;
let stage = 0;
let stageTick = 0;

function unwatch(ctx: GameContext): void {
  for (const entity of ctx.scene.entity.list()) {
    if (entity.name.startsWith("ped_") || entity.name.startsWith("resident-") || entity.name.startsWith("cop_")) {
      ctx.scene.entity.despawn(entity.id);
    }
  }
}

function watch(ctx: GameContext): void {
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player === null) return;
  // A bystander on the player's east side, facing west: inside the sight cone with a clear line.
  ctx.scene.entity.spawn("ped_beach", {
    id: "ped_witness",
    position: [player.position[0] + 4, player.position[1], player.position[2]],
    rotationY: -Math.PI / 2,
    role: "npc",
  });
}

export default {
  seed: "harbor-heat",
  dt: STEP,
  ticks: 4000,
  setup(ctx) {
    ctx.game.commands.run("game.start");
    const [x, z] = DISPATCH;
    ctx.scene.entity.setPose(ctx.player.userId, { position: [x, ctx.world.groundHeightAt(x, z), z] });
  },
  onTick(ctx, tick) {
    const wanted = handrollOf(ctx).wanted();
    if (stage === 0) {
      unwatch(ctx);
      courierPhase = ctx.game.commands.run("courier.accept").status;
      handrollOf(ctx).addHeat(ctx, CRIME);
      stage = 1;
      stageTick = tick;
      return;
    }
    if (stage === 1 && tick > stageTick) {
      unseenHeat = wanted.heat;
      watch(ctx);
      handrollOf(ctx).addHeat(ctx, CRIME);
      stage = 2;
      stageTick = tick;
      return;
    }
    if (stage === 2 && tick > stageTick + 2) {
      seenHeat = wanted.heat;
      searchRadius = wanted.search?.radius ?? 0;
      const player = ctx.scene.entity.get(ctx.player.userId);
      if (wanted.search !== null && player !== null) {
        searchDistance = Math.hypot(wanted.search.center[0] - player.position[0], wanted.search.center[1] - player.position[2]);
      }
      courierPhase = courierStore.read(ctx).phase;
      courierOutcome = courierRuntime(ctx).state()?.outcome ?? null;
      stage = 3;
      stageTick = tick;
      return;
    }
    if (stage === 3 && tick > stageTick + 30) {
      courierPhase = courierStore.read(ctx).phase;
      courierOutcome = courierRuntime(ctx).state()?.outcome ?? null;
      // The receipt is a modal: it pauses the run until dismissed, exactly as the player would.
      if (courierPhase !== "running") ctx.game.commands.run("courier.dismiss");
      unwatch(ctx);
      const player = ctx.scene.entity.get(ctx.player.userId);
      if (player !== null) {
        const far = player.position[0] + 4000;
        ctx.scene.entity.setPose(ctx.player.userId, { position: [far, ctx.world.groundHeightAt(far, player.position[2]), player.position[2]] });
      }
      stage = 4;
      stageTick = tick;
      return;
    }
    if (stage === 4) {
      if (tick === stageTick + DECAY_GRACE_TICKS) midDecayHeat = wanted.heat;
      if (tick > stageTick + DECAY_GRACE_TICKS + DECAY_TICKS) {
        finalHeat = wanted.heat;
        stage = 5;
      }
    }
  },
  expect: [
    {
      id: "unseen-crime-cold",
      subject: "heat after a crime with nobody watching",
      read: () => unseenHeat,
      test: (now) => now === 0,
    },
    {
      id: "seen-crime-hot",
      subject: "heat after the same crime in front of a witness",
      read: () => seenHeat,
      test: (now) => typeof now === "number" && now >= CRIME - 1,
    },
    {
      id: "search-area-set",
      subject: "HHPD search radius and distance from the sighting",
      read: () => Math.round(searchRadius * 10) / 10,
      test: () => searchRadius > 0 && searchDistance < 2,
    },
    {
      id: "courier-swept",
      subject: "courier phase and outcome once heat crossed tier 2",
      read: () => `${courierPhase} (${courierOutcome ?? "no-outcome"})`,
      test: () => courierPhase === "lost" && courierOutcome === "heat_sweep",
    },
    {
      id: "heat-only-while-seen",
      subject: "heat after the witness is gone (4 s → 48 s)",
      read: () => `${Math.round(midDecayHeat)} → ${Math.round(finalHeat)}`,
      test: () => midDecayHeat > 0 && finalHeat < midDecayHeat,
    },
  ],
};

