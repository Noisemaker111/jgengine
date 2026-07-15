import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { buildableDef } from "../objects/catalog";
import { pushToast, session } from "../session";
import { canPlace, placeObject, removeObject } from "./placement";

export interface PointerInput {
  point: { x: number; y: number; z: number };
  entity: string | null;
  object: string | null;
}

let revision = 0;

function bump(ctx: GameContext): void {
  revision += 1;
  ctx.game.store.set("__rev", revision);
}

function affordable(catalogId: string): boolean {
  return session.cash >= buildableDef(catalogId).cost;
}

function tryBuild(ctx: GameContext, input: PointerInput): void {
  const toolId = session.selectedTool;
  if (toolId === null) return;
  const def = buildableDef(toolId);
  if (!affordable(toolId)) {
    pushToast(`Not enough cash for ${def.label}`, "bad", ctx.time.now());
    return;
  }
  const check = canPlace(toolId, input.point.x, input.point.z);
  if (!check.ok) {
    pushToast(check.reason ?? "Can't build here", "bad", ctx.time.now());
    return;
  }
  const placed = placeObject(ctx, toolId, input.point.x, input.point.z);
  if (placed === null) return;
  session.cash -= def.cost;
}

function pointerAction(ctx: GameContext, input: PointerInput): void {
  if (session.gameOver) return;
  if (session.selectedTool !== null) {
    tryBuild(ctx, input);
    return;
  }
  session.selectedObject = input.object;
}

export function registerBuildCommands(ctx: GameContext): void {
  ctx.game.commands.define<PointerInput>("park.pointer", {
    apply(state, input) {
      pointerAction(state, input);
      bump(state);
    },
  });

  ctx.game.commands.define<{ id: string }>("build.select", {
    apply(state, input) {
      session.selectedObject = null;
      session.selectedTool = session.selectedTool === input.id ? null : input.id;
      bump(state);
    },
  });

  ctx.game.commands.define("build.clear", {
    apply(state) {
      session.selectedTool = null;
      session.selectedObject = null;
      bump(state);
    },
  });

  ctx.game.commands.define<{ id: string }>("build.demolish", {
    apply(state, input) {
      const placed = session.placed.get(input.id);
      if (placed === undefined) return;
      const refund = Math.round(buildableDef(placed.catalogId).cost * 0.5);
      if (removeObject(state, input.id)) {
        session.cash += refund;
        if (session.selectedObject === input.id) session.selectedObject = null;
        pushToast(`Demolished — refunded ${refund}`, "info", state.time.now());
      }
    },
  });

  ctx.game.commands.define<{ delta: number }>("park.ticket", {
    apply(state, input) {
      session.ticketPrice = Math.max(4, Math.min(60, session.ticketPrice + input.delta));
      bump(state);
    },
  });

  ctx.game.commands.define("pauseToggle", {
    apply(state) {
      state.time.toggle();
    },
  });

  ctx.game.commands.define("clearTool", {
    apply(state) {
      session.selectedTool = null;
      session.selectedObject = null;
      bump(state);
    },
  });

  const quick: Record<string, string> = {
    pickCarousel: "ride_carousel",
    pickCoaster: "ride_coaster",
    pickTrack: "track_piece",
    pickFood: "stall_food",
    pickTree: "deco_tree",
    pickPath: "path_walk",
  };
  for (const [command, buildId] of Object.entries(quick)) {
    ctx.game.commands.define(command, {
      apply(state) {
        session.selectedObject = null;
        session.selectedTool = session.selectedTool === buildId ? null : buildId;
        bump(state);
      },
    });
  }
}
