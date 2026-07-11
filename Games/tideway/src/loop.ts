import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { RIVALS } from "./game/boats/catalog";
import { BOAT_Y } from "./game/boats/momentum";
import { createSim, resetSim, startingGridFor, type Sim } from "./game/race/sim";
import { tickSim } from "./game/race/tick";
import { BOAT_ENTITY_ID } from "./game/world/catalogIds";
import { placeHarborProps } from "./game/world/setup";

const SIM_KEY = "simRef";

function getSim(ctx: GameContext): Sim | undefined {
  return ctx.game.store.get(SIM_KEY) as Sim | undefined;
}

function syncPhase(ctx: GameContext, status: Sim["status"]): void {
  setGamePhase(ctx, status === "racing" ? "playing" : status === "start" ? "menu" : "ended");
}

function spawnRivals(ctx: GameContext, sim: Sim): void {
  for (const rival of RIVALS) {
    const follow = sim.rivalFollowById.get(rival.id);
    if (follow === undefined) continue;
    ctx.scene.entity.spawn(BOAT_ENTITY_ID, {
      id: rival.id,
      position: follow.position,
      rotationY: follow.heading,
      role: "npc",
    });
  }
}

function posePlayerAndRivalsToGrid(ctx: GameContext, sim: Sim): void {
  for (const slot of startingGridFor(sim)) {
    ctx.scene.entity.setPose(slot.racerId, { position: [slot.x, BOAT_Y, slot.z], rotationY: slot.headingRad });
  }
}

export function onInit(ctx: GameContext): void {
  placeHarborProps(ctx);

  const sim = createSim(ctx.player.userId);
  ctx.game.store.set(SIM_KEY, sim);
  ctx.game.store.set("hud", {
    status: sim.status,
    elapsedSec: 0,
    lap: 1,
    totalLaps: 2,
    position: 1,
    totalRacers: sim.ids.length,
    knots: 0,
    assistMood: "neutral",
    nextGateLabel: "Gate 1",
  });

  spawnRivals(ctx, sim);
  syncPhase(ctx, sim.status);

  ctx.game.commands.define("startRace", {
    validate: () => {
      const current = getSim(ctx);
      return current !== undefined && current.status === "start" ? null : { reason: "race already underway" };
    },
    apply: () => {
      const current = getSim(ctx);
      if (current === undefined) return;
      current.status = "racing";
      current.raceStartSec = ctx.time.now();
      syncPhase(ctx, current.status);
    },
  });

  ctx.game.commands.define("restartRace", {
    apply: () => {
      const current = getSim(ctx);
      if (current === undefined) return;
      const fresh = resetSim(current);
      fresh.status = "racing";
      fresh.raceStartSec = ctx.time.now();
      ctx.game.store.set(SIM_KEY, fresh);
      posePlayerAndRivalsToGrid(ctx, fresh);
      syncPhase(ctx, fresh.status);
    },
  });
}

export function onNewPlayer(ctx: GameContext): void {
  const sim = getSim(ctx);
  const boat = sim?.boats.get(ctx.player.userId);
  ctx.scene.entity.spawn(BOAT_ENTITY_ID, {
    id: ctx.player.userId,
    position: boat === undefined ? [0, BOAT_Y, 0] : [boat.x, BOAT_Y, boat.z],
    rotationY: boat?.headingRad ?? 0,
    role: "player",
  });
}

export function onTick(ctx: GameContext, dt: number): void {
  const sim = getSim(ctx);
  if (sim === undefined) return;
  const previousStatus = sim.status;
  tickSim(ctx, sim, dt);
  if (sim.status !== previousStatus) syncPhase(ctx, sim.status);
}
