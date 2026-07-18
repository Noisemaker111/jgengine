import { describe, expect, test } from "bun:test";

import { defineGameDefinition } from "../game/defineGame";
import { createAssetCatalog } from "../scene/assetCatalog";
import { createGameContext, type GameContextContent } from "../runtime/gameContext";
import { defineStore } from "./defineStore";

const CONTENT: GameContextContent = {
  itemById: () => null,
  entityById: () => null,
  objectById: () => null,
};

function makeContext() {
  return createGameContext({
    definition: defineGameDefinition({ name: "StoreTest", assets: createAssetCatalog(), multiplayer: "off" }),
    content: CONTENT,
    player: { userId: "user_a", isNew: true },
  });
}

interface RunState {
  score: number;
  alive: boolean;
}

describe("defineStore", () => {
  test("read returns the initial value before any write", () => {
    const run = defineStore<RunState>("run", { score: 0, alive: true });
    const ctx = makeContext();
    expect(run.read(ctx)).toEqual({ score: 0, alive: true });
    expect(run.peek(ctx)).toBeUndefined();
  });

  test("write then read round-trips the typed value", () => {
    const run = defineStore<RunState>("run", { score: 0, alive: true });
    const ctx = makeContext();
    run.write(ctx, { score: 42, alive: false });
    expect(run.read(ctx)).toEqual({ score: 42, alive: false });
    expect(run.peek(ctx)).toEqual({ score: 42, alive: false });
  });

  test("update read-modify-writes and returns the next value", () => {
    const run = defineStore<RunState>("run", { score: 0, alive: true });
    const ctx = makeContext();
    const next = run.update(ctx, (previous) => ({ ...previous, score: previous.score + 5 }));
    expect(next).toEqual({ score: 5, alive: true });
    expect(run.read(ctx)).toEqual({ score: 5, alive: true });
  });

  test("clear restores the initial", () => {
    const run = defineStore<RunState>("run", { score: 0, alive: true });
    const ctx = makeContext();
    run.write(ctx, { score: 9, alive: false });
    run.clear(ctx);
    expect(run.peek(ctx)).toBeUndefined();
    expect(run.read(ctx)).toEqual({ score: 0, alive: true });
  });

  test("writes bump ctx.version so subscribers observe the change", () => {
    const run = defineStore<number>("count", 0);
    const ctx = makeContext();
    const before = ctx.version();
    run.write(ctx, 1);
    expect(ctx.version()).not.toBe(before);
  });

  test("a factory initial keeps a stable identity across reads", () => {
    const run = defineStore<RunState>("run", () => ({ score: 0, alive: true }));
    const ctx = makeContext();
    expect(run.read(ctx)).toBe(run.read(ctx));
  });
});
