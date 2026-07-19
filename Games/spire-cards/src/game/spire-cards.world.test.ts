import { describe, expect, test } from "bun:test";

import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { buildStartingDeck, cardTypeOf } from "./cards";
import { combatHandle, scaleDamage, type CombatStore } from "./combat";
import { content } from "./content";
import { ENCOUNTERS, ENEMY_ID, intentForEncounter } from "./enemy";
import { game } from "../game.config";
import { onInit, onNewPlayer } from "../loop";
import { runHandle, type RunStore } from "./run";

const HERO = "hero-test";

function boot(): { ctx: GameContext; combat: CombatStore; run: RunStore } {
  const ctx = createGameContext({
    definition: game.game,
    content,
    player: { userId: HERO, isNew: true },
  });
  onInit(ctx);
  onNewPlayer(ctx);
  return { ctx, combat: combatHandle.read(ctx), run: runHandle.read(ctx) };
}

function totalCards(combat: CombatStore): number {
  const snap = combat.getSnapshot();
  return snap.hand.length + snap.deckCount + snap.discardCount + snap.exhaustCount;
}

function killEnemy(ctx: GameContext): void {
  ctx.scene.entity.effect({ from: HERO, to: ENEMY_ID, effect: "strike", via: { amount: 999 } });
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
    const slime = ENCOUNTERS[0]!;
    expect(intentForEncounter(slime, 0, 0)).toEqual({ kind: "attack", value: 9, hits: undefined });
    expect(intentForEncounter(slime, 0, 3)).toEqual({ kind: "attack", value: 12, hits: undefined });
    expect(intentForEncounter(slime, 2, 0)).toEqual({ kind: "defend", value: 7 });
    expect(intentForEncounter(slime, 3, 0)).toEqual({ kind: "buff", value: 3 });
  });
});

describe("spire-cards status math", () => {
  test("weak scales damage down, vulnerable scales it up, both floor and stack", () => {
    expect(scaleDamage(12, 0, 0)).toBe(12);
    expect(scaleDamage(9, 1, 0)).toBe(6);
    expect(scaleDamage(9, 0, 1)).toBe(13);
    expect(scaleDamage(9, 1, 1)).toBe(9);
    expect(scaleDamage(0, 1, 1)).toBe(0);
  });

  test("pipeline scaleDamage reproduces the inline weak/vulnerable math exactly", () => {
    // Reference: the pre-adoption inline math (weak floor first, then vulnerable floor).
    const inlineScale = (base: number, attackerWeak: number, defenderVulnerable: number): number => {
      let amount = Math.max(0, base);
      if (attackerWeak > 0) amount = Math.floor(amount * 0.75);
      if (defenderVulnerable > 0) amount = Math.floor(amount * 1.5);
      return Math.max(0, amount);
    };
    for (let base = -3; base <= 60; base += 1) {
      for (const weak of [0, 1, 2]) {
        for (const vulnerable of [0, 1, 2]) {
          expect(scaleDamage(base, weak, vulnerable)).toBe(inlineScale(base, weak, vulnerable));
        }
      }
    }
  });
});

describe("spire-cards combat", () => {
  test("opening state is populated and conserved", () => {
    const { combat } = boot();
    const snap = combat.getSnapshot();
    expect(snap.phase).toBe("player");
    expect(snap.hero.maxHp).toBe(72);
    expect(snap.enemy.maxHp).toBe(48);
    expect(snap.enemy.hp).toBe(48);
    expect(snap.enemy.name).toBe("Acid Slime");
    expect(snap.enemy.tier).toBe("normal");
    expect(snap.hand.length).toBe(5);
    expect(snap.deckCount).toBe(8);
    expect(snap.energy).toEqual({ current: 3, max: 3 });
    expect(snap.intent).toEqual({ kind: "attack", value: 9, hits: undefined });
    expect(totalCards(combat)).toBe(13);
  });

  test("playing a card spends energy and conserves the deck", () => {
    const { ctx, combat } = boot();
    const before = combat.getSnapshot();
    const affordable = before.hand.find((entry) => combat.canPlay(entry.id) === null);
    expect(affordable).toBeDefined();
    ctx.game.commands.run("playCard", { cardId: affordable!.id });
    const after = combat.getSnapshot();
    expect(after.energy.current).toBeLessThan(before.energy.current);
    expect(totalCards(combat)).toBe(13);
  });

  test("block absorbs damage before health via the receive order", () => {
    const { ctx } = boot();
    ctx.scene.entity.stats.set(ENEMY_ID, "block", { current: 5 });
    ctx.scene.entity.effect({ from: HERO, to: ENEMY_ID, effect: "strike", via: { amount: 8 } });
    expect(ctx.scene.entity.stats.get(ENEMY_ID, "block")?.current).toBe(0);
    expect(ctx.scene.entity.stats.get(ENEMY_ID, "health")?.current).toBe(45);
  });

  test("ending the turn resolves the enemy intent and advances the round", () => {
    const { ctx, combat } = boot();
    ctx.game.commands.run("endTurn", {});
    const snap = combat.getSnapshot();
    expect(snap.phase).toBe("player");
    expect(snap.round).toBe(2);
    expect(snap.hero.hp).toBeLessThan(72);
    expect(snap.hand.length).toBe(5);
    expect(totalCards(combat)).toBe(13);
  });

  test("reducing enemy health to zero wins the combat", () => {
    const { ctx, combat } = boot();
    killEnemy(ctx);
    expect(combat.getSnapshot().phase).toBe("won");
  });
});

describe("spire-cards run progression", () => {
  test("winning a non-final encounter offers a card reward drawn from non-starter cards", () => {
    const { ctx, run } = boot();
    killEnemy(ctx);
    const snap = run.getSnapshot();
    expect(snap.phase).toBe("reward");
    expect(snap.rewardOptions.length).toBe(3);
    const types = new Set(snap.rewardOptions.map((c) => c.type));
    expect(types.size).toBe(3);
    for (const card of snap.rewardOptions) {
      expect(card.type).not.toBe("strike");
      expect(card.type).not.toBe("defend");
    }
  });

  test("choosing a reward adds the card to the deck and starts the next encounter", () => {
    const { ctx, combat, run } = boot();
    killEnemy(ctx);
    const before = totalCards(combat);
    const picked = run.getSnapshot().rewardOptions[0]!;
    run.chooseReward(ctx, picked.type);
    expect(totalCards(combat)).toBe(before + 1);
    const snap = run.getSnapshot();
    expect(snap.phase).toBe("combat");
    expect(snap.encounterIndex).toBe(1);
    expect(snap.combat.enemy.name).toBe(ENCOUNTERS[1]!.name);
    expect(snap.combat.enemy.maxHp).toBe(ENCOUNTERS[1]!.maxHp);
    expect(snap.combat.enemy.hp).toBe(ENCOUNTERS[1]!.maxHp);
  });

  test("skipping a reward advances the run without growing the deck", () => {
    const { ctx, combat, run } = boot();
    killEnemy(ctx);
    const before = totalCards(combat);
    run.skipReward(ctx);
    expect(totalCards(combat)).toBe(before);
    expect(run.getSnapshot().encounterIndex).toBe(1);
  });

  test("the hero keeps hp carried across encounters instead of healing on win", () => {
    const { ctx, combat, run } = boot();
    ctx.game.commands.run("endTurn", {});
    const hpAfterHit = combat.getSnapshot().hero.hp;
    expect(hpAfterHit).toBeLessThan(72);
    killEnemy(ctx);
    run.skipReward(ctx);
    expect(combat.getSnapshot().hero.hp).toBe(hpAfterHit);
  });

  test("clearing every encounter wins the run", () => {
    const { ctx, run } = boot();
    for (let i = 0; i < ENCOUNTERS.length; i += 1) {
      killEnemy(ctx);
      if (i < ENCOUNTERS.length - 1) {
        expect(run.getSnapshot().phase).toBe("reward");
        run.skipReward(ctx);
      }
    }
    expect(run.getSnapshot().phase).toBe("victory");
  });

  test("hero defeat ends the run in defeat", () => {
    const { ctx, combat, run } = boot();
    ctx.scene.entity.effect({ from: ENEMY_ID, to: HERO, effect: "strike", via: { amount: 999 } });
    expect(run.getSnapshot().phase).toBe("defeat");
    expect(combat.getSnapshot().phase).toBe("lost");
  });

  test("starting a new run resets the deck to the 13-card starter recipe", () => {
    const { ctx, combat, run } = boot();
    killEnemy(ctx);
    run.chooseReward(ctx, run.getSnapshot().rewardOptions[0]!.type);
    expect(totalCards(combat)).toBe(14);
    run.start(ctx);
    expect(totalCards(combat)).toBe(13);
    expect(run.getSnapshot().encounterIndex).toBe(0);
    expect(run.getSnapshot().phase).toBe("combat");
  });
});

describe("spire-cards enemy roster", () => {
  test("cultist telegraphs a strength buff then applies Weak to the hero on schedule", () => {
    const { ctx, combat, run } = boot();
    killEnemy(ctx);
    run.skipReward(ctx);
    expect(combat.getSnapshot().enemy.name).toBe("Cultist");
    for (let i = 0; i < 4; i += 1) ctx.game.commands.run("endTurn", {});
    expect(ctx.scene.entity.stats.get(HERO, "weak")?.current).toBe(2);
  });

  test("jaw worm's multi-hit attack strikes twice for the intent amount", () => {
    const { ctx, combat, run } = boot();
    killEnemy(ctx);
    run.skipReward(ctx);
    killEnemy(ctx);
    run.skipReward(ctx);
    expect(combat.getSnapshot().enemy.name).toBe("Jaw Worm");
    for (let i = 0; i < 3; i += 1) ctx.game.commands.run("endTurn", {});
    const before = combat.getSnapshot().hero.hp;
    const intent = combat.getSnapshot().intent;
    expect(intent).toEqual({ kind: "attack", value: 11, hits: 2 });
    ctx.game.commands.run("endTurn", {});
    const after = combat.getSnapshot().hero.hp;
    expect(before - after).toBe(22);
  });
});

describe("spire-cards reward cards", () => {
  test("exhaust cards move to the exhaust zone instead of discard when played", () => {
    const { ctx, combat, run } = boot();
    killEnemy(ctx);
    run.chooseReward(ctx, "impervious");
    let played = false;
    for (let i = 0; i < 3 && !played; i += 1) {
      const found = combat.getSnapshot().hand.find((entry) => entry.card.type === "impervious");
      if (found === undefined) {
        ctx.game.commands.run("endTurn", {});
        continue;
      }
      const discardBefore = combat.getSnapshot().discardCount;
      const exhaustBefore = combat.getSnapshot().exhaustCount;
      ctx.game.commands.run("playCard", { cardId: found.id });
      expect(combat.getSnapshot().exhaustCount).toBe(exhaustBefore + 1);
      expect(combat.getSnapshot().discardCount).toBe(discardBefore);
      played = true;
    }
    expect(played).toBe(true);
  });
});
