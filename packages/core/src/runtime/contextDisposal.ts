import { createDisposer } from "../game/defineGame";
import type { GameContext } from "./gameContext";
import { publishOnPage, type JgPage } from "./pageHandle";
import { perContext } from "./perContext";

const disposers = perContext(() => createDisposer());

/** Run `cleanup` when `ctx`'s game closes; at once if it already has. */
export function onContextDispose(ctx: GameContext, cleanup: () => void): void {
  disposers(ctx).onDispose(cleanup);
}

/** Close `ctx`: every cleanup registered on it runs, newest first, once. The shell calls this when a game unmounts. */
export function disposeContext(ctx: GameContext): void {
  disposers(ctx).dispose();
}

/** {@link publishOnPage} for as long as `ctx`'s game runs: a closed game takes its readout with it. */
export function publishForContext<K extends keyof JgPage>(ctx: GameContext, key: K, value: NonNullable<JgPage[K]>): void {
  onContextDispose(ctx, publishOnPage(key, value));
}
