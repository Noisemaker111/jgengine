import { describe, expect, test } from "bun:test";

import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { buildStartingDeck, cardTypeOf } from "./cards";
import { combat } from "./combat";
import { content } from "./content";
import { game } from "./game.config";
import { ENEMY_ID, intentForTurn } from "./enemy";
import { onInit, onNewPlayer } from "./loop";

const HERO = "hero-test";

function boot(): GameContext {
  game.scene.clear();
  const ctx = createGameContext({
    definition: game,
    content,
    player: { userId: HERO, isNew: true },
  });
  onInit(ctx);
  onNewPlayer(ctx);
  return ctx;
}

function totalCards(): number {
  const snap = combat.getSnapshot();
  return snap.hand.length + snap.deckCount + snap.discardCount + snap.exhaustCount;
}

describe("spire-cards deck", () => {
  test("starting deck is 13 cards with the expected distribution", () => {
    const deck = buildStartingDeck();
    expect(deck.length).toBe(13);
    const counts: Record<string, number> = {};
    for (const id of deck) counts[cardTypeOf(id)] = (counts[cardTypeOf(id)] ?? 0) + 1;
    expect(counts["strike"]).toBe(4);
    expect(counts["defend"]).toBe(3);
    expect(counts["bash"]).toBe(1);
    expect(counts["inflame"]).toBe(1);
  });

  test("enemy intent pattern is deterministic and scales with strength", () => {
    expect(intentForTurn(0, 0)).toEqual({ kind: "attack", value: 9 });
    expect(intentForTurn(0, 3)).toEqual({ kind: "attack", value: 12 });
    expect(intentForTurn(2, 0)).toEqual({ kind: "defend", value: 7 });
    expect(intentForTurn(3, 0)).toEqual({ kind: "buff", value: 3 });
  });
});

describe("spire-cards combat", () => {
  test("opening state is populated and conserved", () => {
    boot();
    const snap = combat.getSnapshot();
    expect(snap.phase).toBe("player");
    expect(snap.hero.maxHp).toBe(72);
    expect(snap.enemy.maxHp).toBe(48);
    expect(snap.enemy.hp).toBe(48);
    expect(snap.hand.length).toBe(5);
    expect(snap.deckCount).toBe(8);
    expect(snap.energy).toEqual({ current: 3, max: 3 });
    expect(snap.intent).toEqual({ kind: "attack", value: 9 });
    expect(totalCards()).toBe(13);
  });

  test("playing a card spends energy and conserves the deck", () => {
    const ctx = boot();
    const before = combat.getSnapshot();
    const affordable = before.hand.find((entry) => combat.canPlay(entry.id) === null);
    expect(affordable).toBeDefined();
    ctx.game.commands.run("playCard", { cardId: affordable!.id });
    const after = combat.getSnapshot();
    expect(after.energy.current).toBeLessThan(before.energy.current);
    expect(totalCards()).toBe(13);
  });

  test("block absorbs damage before health via the receive order", () => {
    const ctx = boot();
    ctx.scene.entity.stats.set(ENEMY_ID, "block", { current: 5 });
    ctx.scene.entity.effect({ from: HERO, to: ENEMY_ID, effect: "strike", via: { amount: 8 } });
    expect(ctx.scene.entity.stats.get(ENEMY_ID, "block")?.current).toBe(0);
    expect(ctx.scene.entity.stats.get(ENEMY_ID, "health")?.current).toBe(45);
  });

  test("ending the turn resolves the enemy intent and advances the round", () => {
    const ctx = boot();
    ctx.game.commands.run("endTurn", {});
    const snap = combat.getSnapshot();
    expect(snap.phase).toBe("player");
    expect(snap.round).toBe(2);
    expect(snap.hero.hp).toBeLessThan(72);
    expect(snap.hand.length).toBe(5);
    expect(totalCards()).toBe(13);
  });

  test("reducing enemy health to zero wins the combat", () => {
    const ctx = boot();
    ctx.scene.entity.effect({ from: HERO, to: ENEMY_ID, effect: "strike", via: { amount: 999 } });
    expect(combat.getSnapshot().phase).toBe("won");
  });
});
