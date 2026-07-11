import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { seedFromUrl } from "@jgengine/core/random/seedLink";

import type { Category } from "./game/score/categories";
import { DICE_COUNT, bank, roll, startDaily, startSeeded, toggleHold, type YachtState } from "./game/state/game";

export const STORE_KEY = "yacht";

function read(ctx: GameContext): YachtState | undefined {
  return ctx.game.store.get(STORE_KEY) as YachtState | undefined;
}

function update(ctx: GameContext, mutate: (state: YachtState) => YachtState): void {
  const state = read(ctx);
  if (state === undefined) return;
  ctx.game.store.set(STORE_KEY, mutate(state));
}

export function onInit(ctx: GameContext): void {
  ctx.game.commands.define("roll", { apply: (context) => update(context, roll) });

  for (let index = 0; index < DICE_COUNT; index += 1) {
    ctx.game.commands.define(`hold${index + 1}`, {
      apply: (context) => update(context, (state) => toggleHold(state, index)),
    });
  }

  ctx.game.commands.define<{ category: Category }>("bank", {
    apply: (context, input) => update(context, (state) => bank(state, input.category)),
  });

  ctx.game.commands.define<{ seed?: string; daily?: boolean }>("newGame", {
    apply: (context, input) => {
      context.game.store.set(STORE_KEY, input.daily === true ? startDaily() : startSeeded(input.seed));
    },
  });
}

export function onNewPlayer(ctx: GameContext): void {
  const fromUrl =
    typeof window !== "undefined" ? seedFromUrl(window.location.href) : null;
  ctx.game.store.set(STORE_KEY, startSeeded(fromUrl ?? undefined));
}

export function onTick(): void {}
