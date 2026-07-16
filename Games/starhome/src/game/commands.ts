import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { charge, grant } from "@jgengine/core/economy/wallet";

import { PLOT } from "../world";
import { FURNITURE, FURNITURE_BY_ID } from "./objects/catalog";
import { householdStore } from "./session/store";
import { CREDITS, pushEvent } from "./session/types";

export interface PointerInput {
  point: { x: number; y: number; z: number };
  entity: string | null;
  object: string | null;
}

let placeSeq = 0;

function clampToPlot(value: number, min: number, max: number): number {
  return value < min + 2 ? min + 2 : value > max - 2 ? max - 2 : value;
}

export function registerCommands(ctx: GameContext): void {
  ctx.game.commands.define<PointerInput>("world.pointer", {
    apply(gameCtx, input) {
      handlePointer(gameCtx, input);
    },
  });

  ctx.game.commands.define<{ toolId: string | null }>("build.tool", {
    apply(gameCtx, input) {
      const state = householdStore.read(gameCtx);
      const next = state.buildTool === input.toolId ? null : input.toolId;
      householdStore.write(gameCtx, { ...state, buildTool: next, selectedMemberId: next === null ? state.selectedMemberId : null });
    },
  });

  ctx.game.commands.define<{ id: string | null }>("member.select", {
    apply(gameCtx, input) {
      const state = householdStore.read(gameCtx);
      householdStore.write(gameCtx, { ...state, selectedMemberId: input.id, buildTool: null });
    },
  });

  ctx.game.commands.define("build.cancel", {
    apply(gameCtx) {
      const state = householdStore.read(gameCtx);
      householdStore.write(gameCtx, { ...state, buildTool: null, selectedMemberId: null });
    },
  });

  ctx.game.commands.define("buildCancel", {
    apply(gameCtx) {
      const state = householdStore.read(gameCtx);
      householdStore.write(gameCtx, { ...state, buildTool: null, selectedMemberId: null });
    },
  });

  FURNITURE.forEach((def, index) => {
    ctx.game.commands.define(`buildTool${index + 1}`, {
      apply(gameCtx) {
        const state = householdStore.read(gameCtx);
        const next = state.buildTool === def.id ? null : def.id;
        householdStore.write(gameCtx, { ...state, buildTool: next, selectedMemberId: null });
      },
    });
  });

  ctx.game.commands.define<{ id: string }>("object.sell", {
    apply(gameCtx, input) {
      const obj = gameCtx.scene.object.get(input.id);
      if (obj === null) return;
      const def = FURNITURE_BY_ID[obj.catalogId];
      if (def === undefined) return;
      gameCtx.scene.object.remove(input.id);
      const state = householdStore.read(gameCtx);
      pushEvent(state, `Sold ${def.name} for ${Math.round(def.cost / 2)} credits.`, gameCtx.time.now(), "info");
      householdStore.write(gameCtx, { ...state, wallet: grant(state.wallet, CREDITS, Math.round(def.cost / 2)) });
    },
  });

  ctx.game.commands.define("pauseToggle", {
    apply(gameCtx) {
      gameCtx.time.toggle();
    },
  });

  ctx.game.commands.define("speedCycle", {
    apply(gameCtx) {
      gameCtx.time.cycleSpeed();
    },
  });

  ctx.game.commands.define<{ mult: number }>("time.speed", {
    apply(gameCtx, input) {
      gameCtx.time.setSpeed(input.mult);
    },
  });
}

function handlePointer(ctx: GameContext, input: PointerInput): void {
  const state = householdStore.read(ctx);

  if (state.buildTool !== null) {
    const def = FURNITURE_BY_ID[state.buildTool];
    if (def === undefined) return;
    const charged = charge(state.wallet, CREDITS, def.cost);
    if (charged.status !== "ok") {
      pushEvent(state, `Not enough credits for ${def.name}.`, ctx.time.now(), "info");
      householdStore.write(ctx, { ...state });
      return;
    }
    const x = clampToPlot(input.point.x, PLOT.minX, PLOT.maxX);
    const z = clampToPlot(input.point.z, PLOT.minZ, PLOT.maxZ);
    const y = ctx.world.groundHeightAt(x, z);
    placeSeq += 1;
    ctx.scene.object.place(def.id, x, y, z, { instanceId: `placed:${def.id}:${placeSeq}` });
    pushEvent(state, `Placed ${def.name}.`, ctx.time.now(), "good");
    householdStore.write(ctx, { ...state, wallet: charged.state });
    return;
  }

  if (input.entity !== null && state.members[input.entity] !== undefined) {
    householdStore.write(ctx, { ...state, selectedMemberId: input.entity });
    return;
  }

  if (input.object !== null) {
    const obj = ctx.scene.object.get(input.object);
    const def = obj === null ? undefined : FURNITURE_BY_ID[obj.catalogId];
    if (obj !== null && def !== undefined && state.selectedMemberId !== null) {
      const member = state.members[state.selectedMemberId];
      if (member !== undefined) {
        member.action = { kind: "seek", goal: def.role, objId: obj.instanceId };
        member.assignedByPlayer = true;
        pushEvent(state, `${member.name} sent to the ${def.name}.`, ctx.time.now(), "info");
        householdStore.write(ctx, { ...state, members: { ...state.members } });
        return;
      }
    }
  }

  householdStore.write(ctx, { ...state, selectedMemberId: null });
}
