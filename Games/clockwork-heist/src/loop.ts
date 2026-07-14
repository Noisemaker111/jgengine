import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { LifecycleConfig } from "@jgengine/core/game/defineGame";
import { evaluateSkillCheck } from "@jgengine/core/interaction/skillCheck";
import { NORMAL_WALK_SPEED, PLAYER_CATALOG_KIND, SERVANT_DOOR_SPAWN, SNEAK_WALK_SPEED } from "./game/entities/player";
import { ensureCollectiblesPlaced, placeStaticWorld, tickWorld } from "./game/mansion/setup";
import { SIDE_LOOT_DEFS, TREASURE_DEFS, sideLootById, treasureById } from "./game/items/treasures";
import { RUN_SECONDS } from "./game/schedule/mansionClock";
import {
  applyDawnCheck,
  applyDetectionTick,
  attemptExit,
  beginGrab,
  cancelGrab,
  elapsedSecondsFor,
  heistStore,
  initialHeistState,
  pruneToasts,
  resolveGrabFail,
  resolveGrabSuccess,
  restartHeist,
  setSneaking,
  startHeist,
  type HeistState,
} from "./game/state/heistState";
import { initialUiState, uiStore } from "./game/uiState";
import { lootInstanceId, treasureInstanceId } from "./game/mansion/catalog";

export const lifecycle: LifecycleConfig<HeistState> = {
  store: heistStore,
  start: (state, ctx) => startHeist(state, ctx.time.now()),
  restart(state, ctx) {
    const next = restartHeist(state, ctx.time.now());
    ensureCollectiblesPlaced(ctx, next.collectedTreasureIds, next.collectedLootIds);
    ctx.scene.entity.setPose(ctx.player.userId, { position: SERVANT_DOOR_SPAWN, rotationY: 0 });
    ctx.scene.entity.update(ctx.player.userId, { movement: { walkSpeed: NORMAL_WALK_SPEED } });
    uiStore.write(ctx, initialUiState());
    return next;
  },
  phaseOf: (state) => (state.status === "playing" ? "playing" : state.status === "intro" ? "menu" : "ended"),
  commands: { start: "startHeist" },
};

export function onInit(ctx: GameContext): void {
  placeStaticWorld(ctx);
  ensureCollectiblesPlaced(ctx, [], []);
  heistStore.write(ctx, initialHeistState());
  uiStore.write(ctx, initialUiState());

  ctx.game.commands.define("heist.exit", {
    apply(state: GameContext) {
      const current = heistStore.read(state);
      const next = attemptExit(current, state.time.now());
      if (next !== current) {
        heistStore.write(state, next);
      }
      return state;
    },
  });

  ctx.game.commands.define("ui.schedule", {
    apply(state: GameContext) {
      uiStore.update(state, (current) => ({ ...current, scheduleOpen: !current.scheduleOpen }));
      return state;
    },
  });

  ctx.game.commands.define("ui.minimapScrub", {
    apply(state: GameContext) {
      const heist = heistStore.read(state);
      const elapsed = elapsedSecondsFor(heist, state.time.now());
      uiStore.update(state, (current) => ({
        ...current,
        scrubT: current.scrubT === null ? elapsed : null,
      }));
      return state;
    },
  });

  ctx.game.commands.define("ui.setScrub", {
    apply(state: GameContext, input: { t: number | null }) {
      const clamped = input.t === null ? null : Math.max(0, Math.min(RUN_SECONDS, input.t));
      uiStore.update(state, (current) => ({ ...current, scrubT: clamped }));
      return state;
    },
  });
}

export function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(PLAYER_CATALOG_KIND, {
    id: ctx.player.userId,
    position: SERVANT_DOOR_SPAWN,
    rotationY: 0,
    role: "player",
    movement: { walkSpeed: NORMAL_WALK_SPEED },
  });
}

interface GrabTarget {
  id: string;
  kind: "treasure" | "loot";
  distance: number;
}

function nearestGrabTarget(heist: HeistState, playerX: number, playerZ: number): GrabTarget | null {
  let best: GrabTarget | null = null;
  for (const treasure of TREASURE_DEFS) {
    if (heist.collectedTreasureIds.includes(treasure.id)) continue;
    const distance = Math.hypot(treasure.position[0] - playerX, treasure.position[2] - playerZ);
    if (distance > treasure.promptRadius) continue;
    if (best === null || distance < best.distance) best = { id: treasure.id, kind: "treasure", distance };
  }
  for (const loot of SIDE_LOOT_DEFS) {
    if (heist.collectedLootIds.includes(loot.id)) continue;
    const distance = Math.hypot(loot.position[0] - playerX, loot.position[2] - playerZ);
    if (distance > loot.promptRadius) continue;
    if (best === null || distance < best.distance) best = { id: loot.id, kind: "loot", distance };
  }
  return best;
}

export function onTick(ctx: GameContext, _dt: number): void {
  const now = ctx.time.now();
  let heist = heistStore.read(ctx);
  const sneakHeld = ctx.input.isDown("sneak");

  if (heist.sneaking !== sneakHeld) {
    heist = setSneaking(heist, sneakHeld);
    ctx.scene.entity.update(ctx.player.userId, {
      movement: { walkSpeed: sneakHeld ? SNEAK_WALK_SPEED : NORMAL_WALK_SPEED },
    });
  }

  const elapsed = elapsedSecondsFor(heist, now);
  const worldResult = tickWorld(ctx, elapsed, heist.sneaking);

  if (heist.status === "playing") {
    heist = applyDetectionTick(heist, worldResult.detected, worldResult.source, now);
    heist = applyDawnCheck(heist, now);
  }

  if (heist.status === "playing") {
    const player = ctx.scene.entity.get(ctx.player.userId);
    const held = ctx.input.isDown("interact");
    const target = player === null ? null : nearestGrabTarget(heist, player.position[0], player.position[2]);
    const activeGrab = heist.activeGrab;

    if (activeGrab === null) {
      if (held && target !== null) heist = beginGrab(heist, target.id, target.kind, now);
    } else {
      const holdElapsed = now - activeGrab.startedAt;
      if (activeGrab.kind === "loot") {
        const loot = sideLootById(activeGrab.targetId);
        if (!held || loot === undefined) {
          heist = cancelGrab(heist);
        } else if (holdElapsed >= loot.holdSeconds) {
          heist = resolveGrabSuccess(heist, activeGrab.targetId, "loot", loot.name, now);
          ctx.scene.object.remove(lootInstanceId(activeGrab.targetId));
        }
      } else {
        const treasure = treasureById(activeGrab.targetId);
        if (treasure === undefined) {
          heist = cancelGrab(heist);
        } else if (!held) {
          const result = evaluateSkillCheck(treasure.skillCheck, holdElapsed);
          if (result.success) {
            heist = resolveGrabSuccess(heist, activeGrab.targetId, "treasure", treasure.name, now);
            ctx.scene.object.remove(treasureInstanceId(activeGrab.targetId));
          } else {
            heist = resolveGrabFail(heist, treasure.name, now);
          }
        } else if (holdElapsed > treasure.skillCheck.window) {
          heist = resolveGrabFail(heist, treasure.name, now);
        }
      }
    }
  }

  heist = pruneToasts(heist, now);
  heistStore.write(ctx, heist);
}
