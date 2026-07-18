import { describe, expect, test } from "bun:test";

import { defineGameDefinition } from "../game/defineGame";
import { createAssetCatalog } from "../scene/assetCatalog";
import { createGameContext, type GameContextContent } from "../runtime/gameContext";
import { defineKeyedStore } from "./defineKeyedStore";

const CONTENT: GameContextContent = {
  itemById: () => null,
  entityById: () => null,
  objectById: () => null,
};

function makeContext() {
  return createGameContext({
    definition: defineGameDefinition({ name: "KeyedStoreTest", assets: createAssetCatalog(), multiplayer: "off" }),
    content: CONTENT,
    player: { userId: "user_a", isNew: true },
  });
}

interface HeroState {
  classId: string;
  level: number;
}

describe("defineKeyedStore", () => {
  test("read returns the initial value before any write, per id", () => {
    const hero = defineKeyedStore<HeroState>((id) => `hero:${id}`, { classId: "none", level: 1 });
    const ctx = makeContext();
    expect(hero.read(ctx, "a")).toEqual({ classId: "none", level: 1 });
    expect(hero.peek(ctx, "a")).toBeUndefined();
  });

  test("keyFor composes the store key", () => {
    const hero = defineKeyedStore<HeroState>((id) => `hero:${id}`, { classId: "none", level: 1 });
    expect(hero.keyFor("a")).toBe("hero:a");
  });

  test("write then read round-trips the typed value, isolated per id", () => {
    const hero = defineKeyedStore<HeroState>((id) => `hero:${id}`, { classId: "none", level: 1 });
    const ctx = makeContext();
    hero.write(ctx, "a", { classId: "mage", level: 5 });
    expect(hero.read(ctx, "a")).toEqual({ classId: "mage", level: 5 });
    expect(hero.peek(ctx, "a")).toEqual({ classId: "mage", level: 5 });
    expect(hero.read(ctx, "b")).toEqual({ classId: "none", level: 1 });
    expect(hero.peek(ctx, "b")).toBeUndefined();
  });

  test("update read-modify-writes one id and returns the next value", () => {
    const hero = defineKeyedStore<HeroState>((id) => `hero:${id}`, { classId: "none", level: 1 });
    const ctx = makeContext();
    const next = hero.update(ctx, "a", (previous) => ({ ...previous, level: previous.level + 1 }));
    expect(next).toEqual({ classId: "none", level: 2 });
    expect(hero.read(ctx, "a")).toEqual({ classId: "none", level: 2 });
  });

  test("clear restores the initial for that id only", () => {
    const hero = defineKeyedStore<HeroState>((id) => `hero:${id}`, { classId: "none", level: 1 });
    const ctx = makeContext();
    hero.write(ctx, "a", { classId: "mage", level: 5 });
    hero.write(ctx, "b", { classId: "rogue", level: 3 });
    hero.clear(ctx, "a");
    expect(hero.peek(ctx, "a")).toBeUndefined();
    expect(hero.read(ctx, "a")).toEqual({ classId: "none", level: 1 });
    expect(hero.read(ctx, "b")).toEqual({ classId: "rogue", level: 3 });
  });

  test("writes bump ctx.version so subscribers observe the change", () => {
    const counter = defineKeyedStore<number>((id) => `count:${id}`, 0);
    const ctx = makeContext();
    const before = ctx.version();
    counter.write(ctx, "a", 1);
    expect(ctx.version()).not.toBe(before);
  });

  test("a factory initial keeps a stable identity per id across reads", () => {
    const hero = defineKeyedStore<HeroState>((id) => `hero:${id}`, () => ({ classId: "none", level: 1 }));
    const ctx = makeContext();
    expect(hero.read(ctx, "a")).toBe(hero.read(ctx, "a"));
    expect(hero.read(ctx, "a")).not.toBe(hero.read(ctx, "b"));
  });
});
