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

describe("per-context isolation (#1579)", () => {
  test("two contexts in one process hold independent values", () => {
    const run = defineStore<RunState>("run.isolated", { score: 0, alive: true });
    const host = makeContext();
    const guest = makeContext();

    run.write(host, { score: 40, alive: true });
    run.write(guest, { score: 7, alive: false });

    expect(run.read(host)).toEqual({ score: 40, alive: true });
    expect(run.read(guest)).toEqual({ score: 7, alive: false });
  });

  test("a write in one context is invisible to another that never wrote", () => {
    const run = defineStore<RunState>("run.unwritten", { score: 0, alive: true });
    const host = makeContext();
    const guest = makeContext();

    run.write(host, { score: 99, alive: false });

    expect(run.peek(guest)).toBeUndefined();
    expect(run.read(guest)).toEqual({ score: 0, alive: true });
  });

  test("clearing one context leaves the other intact", () => {
    const run = defineStore<RunState>("run.cleared", { score: 0, alive: true });
    const host = makeContext();
    const guest = makeContext();
    run.write(host, { score: 12, alive: true });
    run.write(guest, { score: 34, alive: true });

    run.clear(host);

    expect(run.read(host)).toEqual({ score: 0, alive: true });
    expect(run.read(guest)).toEqual({ score: 34, alive: true });
  });

  test("a factory initial gives each context its own object, not a shared one", () => {
    const run = defineStore<RunState>("run.factory", () => ({ score: 0, alive: true }));
    const host = makeContext();
    const guest = makeContext();

    run.update(host, (previous) => ({ ...previous, score: previous.score + 5 }));

    expect(run.read(host).score).toBe(5);
    expect(run.read(guest).score).toBe(0);
  });
});
