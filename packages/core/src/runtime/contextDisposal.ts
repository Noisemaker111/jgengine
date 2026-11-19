import { createDisposer } from "../game/defineGame";
import type { GameContext } from "./gameContext";
import { publishOnPage, type JgPage } from "./pageHandle";
import { perContext } from "./perContext";

const disposers = perContext(() => createDisposer());

export function onContextDispose(ctx: GameContext, cleanup: () => void): void {
  disposers(ctx).onDispose(cleanup);
}

export function disposeContext(ctx: GameContext): void {
  disposers(ctx).dispose();
}

export function publishForContext<K extends keyof JgPage>(ctx: GameContext, key: K, value: NonNullable<JgPage[K]>): void {
  onContextDispose(ctx, publishOnPage(key, value));
}
