import { describe, expect, test } from "bun:test";

import { createGameContext } from "../runtime/gameContext";
import { defineGameDefinition, type GameDefinitionConfig } from "./defineGame";
import { defineSystem } from "./defineSystem";
import type { NewGameConfig } from "./newGame";

const base = {
  name: "NewGameTest",
  multiplayer: "off",
  inventories: { bag: { slots: 4 } },
  systems: [defineSystem({ id: "guests" })],
} satisfies GameDefinitionConfig;

function boot(newGame: NewGameConfig, onNewPlayer?: Parameters<typeof defineGameDefinition>[0]["loop"]) {
  const definition = defineGameDefinition({ ...base, newGame, ...(onNewPlayer === undefined ? {} : { loop: onNewPlayer }) });
  const ctx = createGameContext({ definition, content: {}, player: { userId: "p1", isNew: true } });
  definition.loop?.onInit?.(ctx);
  definition.loop?.onNewPlayer?.(ctx);
  return { definition, ctx };
}

describe("newGame", () => {
  test("the engine builds the start from the declaration and exposes it", () => {
    const built: string[] = [];
    const learned: string[] = [];
    const config: NewGameConfig = {
      state: { cash: { coins: 25 }, kit: [{ inventory: "bag", item: "rope", count: 2 }], unlocked: ["hut"], pieces: [{ kind: "well", at: [1, 0, 2] }], running: ["guests"] },
      unlock: (_ctx, id, userId) => learned.push(`${userId}:${id}`),
      build: (_ctx, piece) => built.push(piece.kind),
    };
    const { definition, ctx } = boot(config);
    expect(ctx.game.economy.balance("p1", "coins")).toBe(25);
    expect(ctx.player.inventory.count("bag", "rope")).toBe(2);
    expect(learned).toEqual(["p1:hut"]);
    expect(built).toEqual(["well"]);
    expect(definition.newGame?.state.running).toEqual(["guests"]);
  });

  test("an empty-handed declaration leaves the player with nothing", () => {
    const { ctx } = boot({ state: {} });
    expect(ctx.player.inventory.state("bag").slots.every((slot) => slot === null)).toBe(true);
    expect(ctx.game.economy.balance("p1", "coins")).toBe(0);
  });

  test("items handed out by the game's own onNewPlayer are refused", () => {
    expect(() => boot({ state: {} }, { onNewPlayer: (ctx) => void ctx.player.inventory.put("bag", "gun", 1) })).toThrow(/outside the newGame declaration/);
  });

  test("a returning player gets nothing again", () => {
    const definition = defineGameDefinition({ ...base, newGame: { state: { kit: [{ inventory: "bag", item: "rope", count: 1 }] } } });
    const ctx = createGameContext({ definition, content: {}, player: { userId: "p1", isNew: false } });
    definition.loop?.onNewPlayer?.(ctx, { userId: "p1", isNew: false });
    expect(ctx.player.inventory.count("bag", "rope")).toBe(0);
  });

  test("a declaration naming what the game lacks fails at define time", () => {
    expect(() => defineGameDefinition({ ...base, newGame: { state: { kit: [{ inventory: "chest", item: "rope", count: 1 }] } } })).toThrow(/undeclared inventory/);
    expect(() => defineGameDefinition({ ...base, newGame: { state: { running: ["income"] } } })).toThrow(/not installed/);
    expect(() => defineGameDefinition({ ...base, newGame: { state: { pieces: [{ kind: "well", at: [0, 0, 0] }] } } })).toThrow(/build hook/);
  });
});
