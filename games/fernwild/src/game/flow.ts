import { gamePhase, setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { defineSystem } from "@jgengine/shell/gameKit";

/**
 * Title, play, pause and the end card. Boot stops the clock behind the title; New game and Continue
 * start it; the pause key and the pause menu stop and start it again. Continue loads the autosave.
 */
/** Whether this page has already run a game: a second New game reloads instead of reusing the world. */
const session = perContext((_ctx: GameContext) => ({ ran: false, sinceSave: 0 }));

/** Seconds of play between automatic checkpoints. */
const CHECKPOINT_EVERY = 30;

export function openTitle(ctx: GameContext): void {
  ctx.time.pause();
  setGamePhase(ctx, "menu");
}

export function play(ctx: GameContext): void {
  session(ctx).ran = true;
  ctx.time.play();
  setGamePhase(ctx, "playing");
}

/** A fresh run. A run already played on this page reloads it so nothing carries over. */
export async function newGame(ctx: GameContext): Promise<void> {
  await ctx.game.save?.clear();
  if (session(ctx).ran && typeof location !== "undefined") {
    location.reload();
    return;
  }
  play(ctx);
}

export async function continueGame(ctx: GameContext): Promise<boolean> {
  const loaded = (await ctx.game.save?.load()) ?? false;
  if (loaded) play(ctx);
  return loaded;
}

export function togglePause(ctx: GameContext): void {
  const phase = gamePhase(ctx);
  if (phase === "playing") {
    ctx.time.pause();
    setGamePhase(ctx, "paused");
  } else if (phase === "paused") play(ctx);
}

export async function saveNow(ctx: GameContext): Promise<void> {
  await ctx.game.save?.save();
  ctx.game.notices.push({ text: "Saved", tone: "success" });
}

/** `pause` (Esc / P) opens and closes the pause menu; the title opens at boot. */
export const flowSystem = defineSystem({
  id: "game.flow",
  tick: { type: "frame" },
  create(ctx) {
    ctx.game.commands.define("pause", {
      apply(state) {
        togglePause(state);
        return state;
      },
    });
    // Leaves the title straight into play: what a capture or a drive runs to skip the menu.
    ctx.game.commands.define("start", {
      apply(state) {
        play(state);
        return state;
      },
    });
    openTitle(ctx);
  },
  update(ctx, dt) {
    if (gamePhase(ctx) !== "playing") return;
    const state = session(ctx);
    state.sinceSave += dt;
    if (state.sinceSave < CHECKPOINT_EVERY) return;
    state.sinceSave = 0;
    void ctx.game.save?.checkpoint();
  },
});
