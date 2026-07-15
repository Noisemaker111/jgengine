import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { ROOMS } from "./rooms/catalog";
import { advanceRoom, activeHero, levelSeq, loadCurrentRoom, resetRoom, swapHero } from "./runtime";
import { duetStore, withAnchor, withPrism } from "./stores";
import { type Dir, sameCell, type V2, yawToDir } from "./types";

const TOAST_TICKS = 2.2;

function toast(ctx: GameContext, text: string): void {
  duetStore.update(ctx, (state) => ({ ...state, toast: text, toastTimer: TOAST_TICKS }));
}

function heroCell(ctx: GameContext, id: string): V2 | null {
  const entity = ctx.scene.entity.get(id);
  if (entity === null) return null;
  return { x: Math.round(entity.position[0]), z: Math.round(entity.position[2]) };
}

function heroFacing(ctx: GameContext, id: string): Dir {
  const entity = ctx.scene.entity.get(id);
  return entity === null ? "east" : yawToDir(entity.rotationY);
}

/** The active hero uses its distinct ability, latching a device onto the room. */
export function useAbility(ctx: GameContext, userId: string, dirOverride?: Dir): void {
  const hero = activeHero(ctx, userId);
  const cell = heroCell(ctx, hero);
  if (cell === null) return;
  if (hero === "lumen") {
    const dir = dirOverride ?? heroFacing(ctx, "lumen");
    duetStore.update(ctx, (state) => ({ ...state, latch: withPrism(state.latch, { cell, dir }) }));
    toast(ctx, `Prism planted, beaming ${dir}.`);
  } else {
    duetStore.update(ctx, (state) => {
      const lifted = state.latch.anchorCell !== null && sameCell(state.latch.anchorCell, cell);
      return { ...state, latch: withAnchor(state.latch, lifted ? null : cell) };
    });
    const lifted = duetStore.read(ctx).latch.anchorCell === null;
    toast(ctx, lifted ? "Weight lifted." : "Weight dropped.");
  }
}

export function registerCommands(ctx: GameContext): void {
  ctx.game.commands.define("swap", {
    apply(state, input) {
      const userId = commandUser(state, input);
      if (!swapHero(state, userId)) toast(state, "You only control one hero here.");
    },
  });

  ctx.game.commands.define("ability", {
    apply(state, input) {
      useAbility(state, commandUser(state, input), (input as { dir?: Dir }).dir);
    },
  });

  ctx.game.commands.define("reset", {
    apply(state) {
      resetRoom(state);
      toast(state, "Room reset.");
    },
  });

  ctx.game.commands.define("duet.restart", {
    apply(state) {
      levelSeq(state).select(ROOMS[0]!.id);
      loadCurrentRoom(state);
    },
  });

  ctx.game.commands.define("debug.solve", {
    apply(state) {
      advanceRoom(state);
    },
  });

  ctx.game.commands.define("debug.win", {
    apply(state) {
      const room = ROOMS[duetStore.read(state).roomIndex];
      if (room === undefined) return;
      state.scene.entity.setPose("lumen", { position: [room.exit.lumen.x, 0, room.exit.lumen.z], rotationY: 0, dt: 0 });
      state.scene.entity.setPose("anchor", {
        position: [room.exit.anchor.x, 0, room.exit.anchor.z],
        rotationY: 0,
        dt: 0,
      });
    },
  });

  ctx.game.commands.define("debug.complete", {
    apply(state) {
      duetStore.update(state, (s) => ({ ...s, status: "complete" }));
    },
  });
}

function commandUser(ctx: GameContext, input: unknown): string {
  const fromInput = (input as { userId?: string }).userId;
  return fromInput ?? ctx.player.userId;
}
