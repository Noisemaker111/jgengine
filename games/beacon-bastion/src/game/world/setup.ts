import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityDiedEvent } from "@jgengine/core/game/events";
import { gamePhase, setGamePhase } from "@jgengine/core/game/gamePhase";

import { registerBuildCommands } from "../build/commands";
import { BASE_CATALOG_ID, BASE_ENTITY_ID } from "../entities/base/catalog";
import { creepDef, CREEP_CATALOG } from "../entities/enemies/catalog";
import { campaign, DIFFICULTY_IDS, rankCouncil, resetCouncil, setDifficulty, type DifficultyId } from "../campaign";
import { buyUnion, unionRefusal, type TownUpgradeId } from "../union";
import { bindRunMode, RUN_MODES, type RunMode } from "../waves/mode";
import { registerSinkCommands } from "../sinks";
import { setRunModeChoice } from "../campaign";
import { registerAbilityCommands } from "../combat/cast";
import { resetSession, session } from "../session";
import { exposeKeepReadout, keep, resetKeep, runEnded } from "../keep";
import { resetProjectiles } from "../combat/pendingProjectiles";
import { KEEP_POINT, PATH_WAYPOINTS, groundHeightAt } from "./path";
import { BUILDING_MARKERS } from "../../editorLayers";
import { BUILDING_PLAN, buildingEntity } from "../models";

/** The town hall at the end of Main Street turns its door to the street that leads to it. */
function townHallFacing(): number {
  const end = PATH_WAYPOINTS[PATH_WAYPOINTS.length - 1]!;
  const before = PATH_WAYPOINTS[PATH_WAYPOINTS.length - 2] ?? end;
  return Math.atan2(before[0] - end[0], before[2] - end[2]);
}
import { payBounty, registerWaveCommands, spawnRaider, transformOnDeath } from "../waves/director";
import { registerCaptureCommands } from "../capture";
import { legacy, chooseRelic, openingKeep, startDefense } from "../waves/legacy";
import { beginRun, pauseRun } from "../menu";

function handleEntityDied(ctx: GameContext, event: EntityDiedEvent): void {
  if (event.catalogId in CREEP_CATALOG) {
    const creep = session.creeps.get(event.instanceId);
    session.creeps.delete(event.instanceId);
    session.statuses.clear(event.instanceId);
    if (session.boss?.instanceId === event.instanceId) session.boss = null;
    if (creep !== undefined && !runEnded(keep.of(ctx))) {
      // A wrecked self-driving car lets its scooters out where it stopped; they carry on down the same road.
      const splits = creepDef(event.catalogId).splits;
      for (let index = 0; index < (splits?.count ?? 0); index += 1) {
        const offset = Math.max(0, creep.path.distanceTravelled - index * 0.6);
        spawnRaider(ctx, splits!.unit, creep.route, { ...creep.path, distanceTravelled: offset });
      }
      // The Data Center does not die: it migrates to The Cloud.
      if (transformOnDeath(ctx, creep) !== null) ctx.scene.entity.vfx({ preset: "explosion", to: event.position, radius: 5, durationMs: 900, color: 0x7ab8ff });
    }
    // The bounty is a world ripple into the town's shared till, scaled by what this kill pays.
    const paid = payBounty(ctx, event.catalogId, creep);
    ctx.scene.entity.floatText({ position: [event.position[0], event.position[1] + 1.2, event.position[2]], text: `+$${paid}`, kind: "heal", scale: 0.8 });
    ctx.game.audio.play("kill", event.position);
  }
}

/** Retry the run, preserving settings and avoiding duplicate death subscriptions. */
export function restartDefense(ctx: GameContext): void {
  for (const id of [...session.creeps.keys(), BASE_ENTITY_ID]) ctx.scene.entity.despawn(id);
  // A day or an Overtime night, as the career chose: the director builds its waves from this.
  bindRunMode(campaign.read(ctx).mode);
  resetSession();
  resetProjectiles();
  // The engine loop opens the defense and adopts the relic it carries.
  startDefense(ctx);
  resetKeep(ctx, openingKeep(ctx));
  ctx.scene.entity.spawn(BASE_CATALOG_ID, { id: BASE_ENTITY_ID, position: KEEP_POINT, role: "prop", rotationY: townHallFacing() });
  ctx.time.play();
  setGamePhase(ctx, "playing");
}

function unionOffer(input: { hire?: string; train?: string; town?: string } | undefined): Parameters<typeof buyUnion>[1] | null {
  if (typeof input?.hire === "string") return { hire: input.hire };
  if (typeof input?.train === "string") return { train: input.train };
  if (typeof input?.town === "string") return { town: input.town as TownUpgradeId };
  return null;
}

/** The campaign's own commands: pick a shift and seat the town council between days. */
function registerCampaignCommands(ctx: GameContext): void {
  ctx.game.commands.define<{ difficulty?: string } | undefined>("campaign.difficulty", {
    validate: (_state, input) => (DIFFICULTY_IDS.includes(input?.difficulty as DifficultyId) ? null : { reason: "unknown-difficulty" }),
    apply: (state, input) => {
      setDifficulty(state, input!.difficulty as DifficultyId);
      return state;
    },
  });
  ctx.game.commands.define<{ node?: string } | undefined>("council.rank", {
    apply: (state, input) => {
      if (typeof input?.node === "string" && rankCouncil(state, input.node)) state.game.audio.play("upgrade");
      else state.game.audio.play("denied");
      return state;
    },
  });
  // The union hall between days: spend dues on a hire, a trade's training or a town upgrade.
  ctx.game.commands.define<{ hire?: string; train?: string; town?: string } | undefined>("union.buy", {
    validate: (state, input) => {
      const offer = unionOffer(input);
      if (offer === null) return { reason: "no-offer" };
      const refusal = unionRefusal(campaign.read(state), offer);
      return refusal === null ? null : { reason: "refused", message: refusal };
    },
    apply: (state, input) => {
      if (buyUnion(state, unionOffer(input)!)) state.game.audio.play("upgrade");
      return state;
    },
  });
  ctx.game.commands.define<{ mode?: string } | undefined>("campaign.mode", {
    validate: (_state, input) => (RUN_MODES.includes(input?.mode as RunMode) ? null : { reason: "unknown-mode" }),
    apply: (state, input) => {
      setRunModeChoice(state, input!.mode as RunMode);
      return state;
    },
  });
  ctx.game.commands.define("council.reset", { apply: (state) => {
    resetCouncil(state);
    return state;
  } });
}

/** Stand the street's authored buildings and lamps up as scenery, each facing the street. */
function spawnBuildings(ctx: GameContext): void {
  for (const building of BUILDING_MARKERS) {
    if (BUILDING_PLAN[building.model] === undefined) continue;
    const position: [number, number, number] = [building.xz[0], groundHeightAt(building.xz[0], building.xz[1]), building.xz[1]];
    ctx.scene.entity.spawn(buildingEntity(building.model), { id: building.id, position, rotationY: building.rotationY, role: "prop" });
  }
}

export function setupWorld(ctx: GameContext): void {
  restartDefense(ctx);
  spawnBuildings(ctx);
  registerBuildCommands(ctx);
  registerWaveCommands(ctx);
  registerCaptureCommands(ctx);
  registerAbilityCommands(ctx);
  registerCampaignCommands(ctx);
  registerSinkCommands(ctx);
  // One command that opens a run from the title, so a capture or a host can start play without a menu click.
  ctx.game.commands.define("run.begin", { apply: (state) => {
    if (gamePhase(state) !== "playing") beginRun(state);
    return state;
  } });
  // The counterpart the pause screen's own Esc path takes, reachable from a capture state.
  ctx.game.commands.define("run.pause", { apply: (state) => {
    pauseRun(state);
    return state;
  } });
  ctx.game.commands.define("defense.restart", {
    validate: (state) => (runEnded(keep.of(state)) ? null : { reason: "run-not-ended" }),
    apply: state => { restartDefense(state); return state; },
  });
  // The result card's relic choice: bank the offered relic and march out with it.
  ctx.game.commands.define<{ boon?: string | null } | undefined>("legacy.choose", {
    validate: (state, input) => {
      if (!runEnded(keep.of(state))) return { reason: "run-not-ended" };
      const pick = input?.boon ?? null;
      if (pick !== null && !legacy.read(state).offer.includes(pick)) return { reason: "not-offered" };
      return null;
    },
    apply: (state, input) => {
      const pick = input?.boon ?? null;
      chooseRelic(state, pick);
      restartDefense(state);
      return state;
    },
  });
  ctx.game.events.on("entity.died", (event) => handleEntityDied(ctx, event));
  exposeKeepReadout(ctx, () => gamePhase(ctx));
}

export function heartbeat(ctx: GameContext): void {
  const base = ctx.scene.entity.get(BASE_ENTITY_ID);
  if (base !== null) ctx.scene.entity.setPose(BASE_ENTITY_ID, { position: base.position });
}
