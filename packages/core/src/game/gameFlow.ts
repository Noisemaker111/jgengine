import type { ActionCodes } from "../input/actionBindings";
import type { GameContext } from "../runtime/gameContext";
import { rebindAction } from "./controlGate";
import { perContext } from "../runtime/perContext";
import { defineSystem, type SystemDefinition } from "./defineSystem";
import { gamePhase, setGamePhase } from "./gamePhase";

/** Whether this page already ran a game (a second New game reloads instead of reusing the world), and seconds since the last checkpoint. */
const session = perContext((_ctx: GameContext) => ({ ran: false, sinceSave: 0 }));

/** A pane the title or pause menu shows beside its verbs. */
export type MenuPane = "controls" | "settings" | "credits";

export const MENU_PANE_STORE_KEY = "jg.menuPane";

/** The pane the title or pause menu shows, or null for its default (the briefing on the title, nothing on pause). */
export function menuPane(ctx: GameContext): MenuPane | null {
  const value = ctx.game.store.get(MENU_PANE_STORE_KEY);
  return value === "controls" || value === "settings" || value === "credits" ? value : null;
}

/** Show a pane on the title or pause menu (null for its default). Outside those menus there is none to show, so it does nothing. */
export function showMenuPane(ctx: GameContext, pane: MenuPane | null): void {
  const phase = gamePhase(ctx);
  if (phase !== "menu" && phase !== "paused") return;
  ctx.game.store.set(MENU_PANE_STORE_KEY, pane);
}

/** Stop the clock and show the title (`"menu"` phase). */
export function openTitle(ctx: GameContext): void {
  ctx.time.pause();
  setGamePhase(ctx, "menu");
  ctx.game.store.set(MENU_PANE_STORE_KEY, null);
}

/** Whether a run already played in this world, so a new one has to restart the page first. */
export function runPlayed(ctx: GameContext): boolean {
  return session(ctx).ran;
}

/** Start the clock and enter the `"playing"` phase. */
export function playGame(ctx: GameContext): void {
  session(ctx).ran = true;
  ctx.time.play();
  setGamePhase(ctx, "playing");
  ctx.game.store.set(MENU_PANE_STORE_KEY, null);
}

/**
 * A fresh run: clears the save, then plays. When a run already played in this world, `restart` is
 * called instead so nothing carries over (the browser host passes a page reload).
 */
export async function newGame(ctx: GameContext, restart?: () => void): Promise<void> {
  await ctx.game.save?.clear();
  if (session(ctx).ran && restart !== undefined) {
    restart();
    return;
  }
  playGame(ctx);
}

/** Load the save and play it; resolves `false` (and stays put) when there is none. */
export async function continueGame(ctx: GameContext): Promise<boolean> {
  const loaded = (await ctx.game.save?.load()) ?? false;
  if (loaded) playGame(ctx);
  return loaded;
}

/** Pause from `"playing"`, resume from `"paused"`; any other phase is left alone. */
export function togglePause(ctx: GameContext): void {
  const phase = gamePhase(ctx);
  if (phase === "playing") {
    ctx.time.pause();
    setGamePhase(ctx, "paused");
    ctx.game.store.set(MENU_PANE_STORE_KEY, null);
  } else if (phase === "paused") playGame(ctx);
}

/** Save now and post a "Saved" notice. */
export async function saveNow(ctx: GameContext, notice = "Saved"): Promise<void> {
  await ctx.game.save?.save();
  ctx.game.notices.push({ text: notice, tone: "success" });
}

/** Options for {@link createGameFlowSystem}. */
export interface GameFlowOptions {
  /** Seconds of play between automatic checkpoints. Default 30; 0 turns checkpoints off. */
  checkpointEverySeconds?: number;
}

/**
 * Title, play, pause and checkpoints as one system. Boot stops the clock behind the title; the
 * `pause` command (bind it to Esc / P) opens and closes the pause menu; the `start` command leaves
 * the title straight into play, which is what a capture or a drive runs to skip the menu; the
 * `menu.pane` command shows a menu's Controls, Settings or Credits pane, as choosing that verb does,
 * so a proof reads the credits through {@link menuPane}; the `settings.rebind` command binds an action
 * to new keys (null restores the game's), as the Controls settings do; `save` and `continue` run the
 * pause menu's Save and the title's Continue. Pair it with `GameFlowUI` from
 * `@jgengine/core/menu/gameFlowMenus.view`.
 *
 * @capability game-flow title, play, pause and autosave checkpoints as one system, with newGame/continueGame/saveNow for menus
 */
export function createGameFlowSystem(options: GameFlowOptions = {}): SystemDefinition {
  const every = options.checkpointEverySeconds ?? 30;
  return defineSystem({
    id: "game.flow",
    tick: { type: "frame" },
    create(ctx) {
      ctx.game.commands.define("pause", {
        apply(state) {
          togglePause(state);
          return state;
        },
      });
      ctx.game.commands.define<{ action: string; codes: ActionCodes | null }>("settings.rebind", {
        apply(state, input) {
          rebindAction(state, input.action, input.codes);
          return state;
        },
      });
      ctx.game.commands.define("save", {
        apply(state) {
          void saveNow(state);
          return state;
        },
      });
      ctx.game.commands.define("continue", {
        apply(state) {
          void continueGame(state);
          return state;
        },
      });
      ctx.game.commands.define("start", {
        apply(state) {
          playGame(state);
          return state;
        },
      });
      ctx.game.commands.define<{ pane: MenuPane | null }>("menu.pane", {
        apply(state, input) {
          showMenuPane(state, input.pane);
          return state;
        },
      });
      openTitle(ctx);
    },
    update(ctx, dt) {
      if (every <= 0 || gamePhase(ctx) !== "playing") return;
      const state = session(ctx);
      state.sinceSave += dt;
      if (state.sinceSave < every) return;
      state.sinceSave = 0;
      void ctx.game.save?.checkpoint();
    },
  });
}
