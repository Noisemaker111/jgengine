import type { GameContext } from "../runtime/gameContext";

/** One stack the player holds at second 0. */
export interface NewGameKit {
  /** A declared inventory id (`defineGame({ inventories })`). */
  inventory: string;
  item: string;
  count: number;
}

/** One piece already standing in the world at second 0 (a prebuilt ride, a starter hut). */
export interface NewGamePiece {
  /** Game-owned kind the `build` hook places. */
  kind: string;
  at: readonly [number, number, number];
  rotationY?: number;
}

/**
 * Everything the player has at second 0, as plain data. Empty means empty-handed: no cash, no kit,
 * nothing unlocked, nothing built and nothing working for the player yet.
 */
export interface NewGameState {
  /** Currency id → starting balance. */
  cash?: Readonly<Record<string, number>>;
  /** Stacks put into the player's inventories. */
  kit?: readonly NewGameKit[];
  /** Unlock ids known from the start (recipes, engrams, buildable pieces). */
  unlocked?: readonly string[];
  /** Pieces already built in the world. */
  pieces?: readonly NewGamePiece[];
  /** Ids of installed systems that work for the player before the player does anything (guests, income, workers). */
  running?: readonly string[];
}

/**
 * A game's new-game declaration, passed as `defineGame({ newGame })`: the {@link NewGameState} plus
 * the hooks that apply its game-owned parts. The engine builds every new game from it and nothing
 * else (a game's `onNewPlayer` that hands out items or money throws), and checks read it from
 * `definition.newGame`.
 *
 * @capability new-game-state declare what the player has at second 0 (cash, kit, unlocks, prebuilt pieces, systems that start on their own) as data the engine builds from and checks read
 */
export interface NewGameConfig {
  state: NewGameState;
  /** Make one unlock known to `userId`. Default `ctx.game.unlocks.grant` (needs `features.unlocks`). */
  unlock?(ctx: GameContext, unlockId: string, userId: string): void;
  /** Place one prebuilt piece. Required when `state.pieces` is not empty. */
  build?(ctx: GameContext, piece: NewGamePiece): void;
}

/**
 * Throw when a new-game declaration names something the game does not have: an undeclared
 * inventory, a non-positive count, a system that is not installed, or pieces with no `build` hook.
 * `defineGameDefinition` calls this, so a bad declaration fails when the game is defined.
 * @internal
 */
export function validateNewGame(
  config: NewGameConfig,
  known: { inventories: readonly string[]; systems: readonly string[] },
): void {
  const { state } = config;
  for (const [currency, amount] of Object.entries(state.cash ?? {})) {
    if (!Number.isFinite(amount) || amount < 0) throw new Error(`newGame: cash "${currency}" must be a finite amount >= 0`);
  }
  for (const stack of state.kit ?? []) {
    if (!known.inventories.includes(stack.inventory)) throw new Error(`newGame: kit names undeclared inventory "${stack.inventory}"`);
    if (!Number.isInteger(stack.count) || stack.count <= 0) throw new Error(`newGame: kit "${stack.item}" count must be a whole number > 0`);
  }
  if ((state.pieces?.length ?? 0) > 0 && config.build === undefined) throw new Error("newGame: pieces need a build hook");
  for (const id of state.running ?? []) {
    if (!known.systems.includes(id)) throw new Error(`newGame: running names system "${id}", which is not installed`);
  }
}

/** Build the declared pieces once per world. `defineGameDefinition` runs it after `onInit`.
 * @internal */
export function buildNewGameWorld(ctx: GameContext, config: NewGameConfig): void {
  for (const piece of config.state.pieces ?? []) config.build?.(ctx, piece);
}

/**
 * Give a new player the declared start: grant the cash, put the kit and learn the unlocks.
 * `defineGameDefinition` runs it after the game's `onNewPlayer` for every new player. Throws when the
 * game's own code already handed that player items or money, so the declaration stays the one
 * place a start state lives.
 * @internal
 */
export function giveNewGameStart(ctx: GameContext, config: NewGameConfig, userId: string, inventories: readonly string[]): void {
  const bags = ctx.player.inventoryFor(userId);
  for (const inventory of inventories) {
    if (bags.state(inventory).slots.some((slot) => slot !== null)) {
      throw new Error(`newGame: inventory "${inventory}" was filled outside the newGame declaration`);
    }
  }
  const { state } = config;
  for (const [currency, amount] of Object.entries(state.cash ?? {})) {
    if (ctx.game.economy.balance(userId, currency) !== 0) throw new Error(`newGame: "${currency}" was granted outside the newGame declaration`);
    if (amount > 0) ctx.game.economy.grant(userId, currency, amount);
  }
  for (const stack of state.kit ?? []) {
    const put = bags.put(stack.inventory, stack.item, stack.count);
    if (put.status !== "ok") throw new Error(`newGame: kit "${stack.item}" x${stack.count} does not fit "${stack.inventory}"`);
  }
  for (const id of state.unlocked ?? []) {
    if (config.unlock !== undefined) config.unlock(ctx, id, userId);
    else if (ctx.game.unlocks !== undefined) ctx.game.unlocks.grant(userId, id);
    else throw new Error(`newGame: unlock "${id}" needs an unlock hook or features.unlocks`);
  }
}
