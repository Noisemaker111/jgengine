import type { ActionCodes } from "../input/actionBindings";
import type { GameContext } from "../runtime/gameContext";
import { rebindAction } from "./controlGate";
import { perContext } from "../runtime/perContext";
import { defineSystem, type SystemDefinition } from "./defineSystem";
import { gamePhase, setGamePhase } from "./gamePhase";

/** Whether this page already ran a game (a second New game reloads instead of reusing the world), and seconds since the last checkpoint. */
const session = perContext((_ctx: GameContext) => ({ ran: false, sinceSave: 0 }));

export type MenuPane = "controls" | "settings" | "credits";

export const MENU_PANE_STORE_KEY = "jg.menuPane";

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

export function openTitle(ctx: GameContext): void {
  ctx.time.pause();
  setGamePhase(ctx, "menu");
  ctx.game.store.set(MENU_PANE_STORE_KEY, null);
}

/** Whether a run already played in this world, so a new one has to restart the page first. */
export function runPlayed(ctx: GameContext): boolean {
  return session(ctx).ran;
}

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

export type SaveSlotState = "loaded" | "empty" | "corrupt" | "failed";

export async function readSaveSlotState(ctx: GameContext): Promise<SaveSlotState> {
  const save = ctx.game.save;
  if (save === undefined) return "empty";
  return (await save.peek(save.slot())).kind;
}

/** The Continue hint for each {@link SaveSlotState}, so a damaged save is never shown as no save. */
export function continueHint(state: SaveSlotState): string {
  if (state === "loaded") return "Back where you left off";
  if (state === "corrupt") return "Save damaged, a copy was kept";
  if (state === "failed") return "Save could not be read";
  return "No save yet";
}

export async function continueGame(ctx: GameContext): Promise<boolean> {
  const result = await ctx.game.save?.load();
  if (result?.kind === "loaded") {
    playGame(ctx);
    return true;
  }
  if (result?.kind === "corrupt") ctx.game.notices.push({ text: "Your save was damaged, so a copy was kept and it could not be continued", tone: "deny" });
  if (result?.kind === "failed") ctx.game.notices.push({ text: "Your save could not be read", tone: "deny" });
  return false;
}

export function togglePause(ctx: GameContext): void {
  const phase = gamePhase(ctx);
  if (phase === "playing") {
    ctx.time.pause();
    setGamePhase(ctx, "paused");
    ctx.game.store.set(MENU_PANE_STORE_KEY, null);
  } else if (phase === "paused") playGame(ctx);
}

export async function saveNow(ctx: GameContext, notice = "Saved"): Promise<void> {
  const result = await ctx.game.save?.save();
  if (result?.kind === "failed") ctx.game.notices.push({ text: "Save failed", tone: "deny" });
  else ctx.game.notices.push({ text: notice, tone: "success" });
}

export interface GameFlowOptions {
  /** Seconds of play between automatic checkpoints. Default 30; 0 turns checkpoints off. */
  checkpointEverySeconds?: number;
}

/**
 * The commands {@link createGameFlowSystem} defines, one entry each with its own comment. A new
 * game-flow command is a new entry at the end, so two changes that each add one touch no shared line.
 */
const gameFlowCommands: readonly ((ctx: GameContext) => void)[] = [
  // `pause` (bind it to Esc / P) opens and closes the pause menu.
  (ctx) =>
    ctx.game.commands.define("pause", {
      apply(state) {
        togglePause(state);
        return state;
      },
    }),
  // `settings.rebind` binds an action to new keys (null restores the game's), as the Controls settings do.
  (ctx) =>
    ctx.game.commands.define<{ action: string; codes: ActionCodes | null }>("settings.rebind", {
      apply(state, input) {
        rebindAction(state, input.action, input.codes);
        return state;
      },
    }),
  // `save` runs the pause menu's Save.
  (ctx) =>
    ctx.game.commands.define("save", {
      apply(state) {
        void saveNow(state);
        return state;
      },
    }),
  // `continue` runs the title's Continue.
  (ctx) =>
    ctx.game.commands.define("continue", {
      apply(state) {
        void continueGame(state);
        return state;
      },
    }),
  // `start` leaves the title straight into play, which is what a capture or a drive runs to skip the menu.
  (ctx) =>
    ctx.game.commands.define("start", {
      apply(state) {
        playGame(state);
        return state;
      },
    }),
  // `menu.pane` shows a menu's Controls, Settings or Credits pane, as choosing that verb does, so a
  // proof reads the credits through `menuPane`.
  (ctx) =>
    ctx.game.commands.define<{ pane: MenuPane | null }>("menu.pane", {
      apply(state, input) {
        showMenuPane(state, input.pane);
        return state;
      },
    }),
];

/**
 * Title, play, pause and checkpoints as one system. Boot stops the clock behind the title and
 * defines the game-flow commands, each described where this file lists it, so a menu, a capture or
 * a proof runs the same verbs (the `start` command skips the title).
 * Pair it with `GameFlowUI` from
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
      for (const define of gameFlowCommands) define(ctx);
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
