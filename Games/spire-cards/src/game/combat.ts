import { createCardPile, type CardPile } from "@jgengine/core/cards/cardPile";
import {
  resolveDamage,
  type DamageInterceptor,
  type PendingDamage,
} from "@jgengine/core/combat/damageInterceptors";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import { createTurnLoop, type TurnLoop } from "@jgengine/core/turn/turnLoop";

import { buildStartingDeck, cardOf, type CardData } from "./cards";
import {
  ENEMY_CATALOG_ID,
  ENEMY_ID,
  ENERGY_POOL,
  HAND_SIZE,
  HERO_CATALOG_ID,
  MAX_ENERGY,
  TURN_ENEMY,
  TURN_HERO,
  intentForEncounter,
  type EnemyDef,
  type EnemyTier,
  type Intent,
} from "./enemy";

export type Phase = "player" | "enemy" | "won" | "lost";

export interface HandCard {
  id: string;
  card: CardData;
}

export interface CombatantView {
  hp: number;
  maxHp: number;
  block: number;
  strength: number;
  weak: number;
  vulnerable: number;
}

export interface CombatSnapshot {
  phase: Phase;
  round: number;
  energy: { current: number; max: number };
  hero: CombatantView;
  enemy: CombatantView & { name: string; tier: EnemyTier };
  intent: Intent | null;
  hand: readonly HandCard[];
  deckCount: number;
  discardCount: number;
  exhaustCount: number;
  log: readonly string[];
}

const EMPTY_VIEW: CombatantView = { hp: 0, maxHp: 0, block: 0, strength: 0, weak: 0, vulnerable: 0 };
const EMPTY_SNAPSHOT: CombatSnapshot = {
  phase: "player",
  round: 1,
  energy: { current: 0, max: MAX_ENERGY },
  hero: EMPTY_VIEW,
  enemy: { ...EMPTY_VIEW, name: "", tier: "normal" },
  intent: null,
  hand: [],
  deckCount: 0,
  discardCount: 0,
  exhaustCount: 0,
  log: [],
};

interface CombatState {
  pile: CardPile;
  turn: TurnLoop;
  phase: Phase;
  intent: Intent | null;
  enemyTurns: number;
  seed: number;
  rewardSerial: number;
  log: string[];
  enemy: EnemyDef;
}

function newPile(seed: number): CardPile {
  const pile = createCardPile(
    {
      zones: ["deck", "hand", "discard", "exhaust"],
      drawFrom: "deck",
      handZone: "hand",
      discardTo: "discard",
      handLimit: 10,
      reshuffleFrom: "discard",
    },
    { deck: buildStartingDeck() },
  );
  pile.shuffle("deck", seed);
  return pile;
}

function carryPile(pile: CardPile, seed: number): CardPile {
  const zones = pile.state().zones;
  const allCards = [...zones.deck, ...zones.hand, ...zones.discard, ...zones.exhaust];
  pile.reset({ zones: { deck: allCards, hand: [], discard: [], exhaust: [] } });
  pile.shuffle("deck", seed);
  return pile;
}

function statValue(ctx: GameContext, id: string, stat: string): { current: number; max: number } {
  const value = ctx.scene.entity.stats.get(id, stat);
  return value === null ? { current: 0, max: 0 } : { current: value.current, max: value.max };
}

function strengthOf(ctx: GameContext, id: string): number {
  return ctx.scene.entity.stats.get(id, "strength")?.current ?? 0;
}

function weakOf(ctx: GameContext, id: string): number {
  return ctx.scene.entity.stats.get(id, "weak")?.current ?? 0;
}

function vulnerableOf(ctx: GameContext, id: string): number {
  return ctx.scene.entity.stats.get(id, "vulnerable")?.current ?? 0;
}

function decayStatus(ctx: GameContext, id: string): void {
  for (const stat of ["weak", "vulnerable"] as const) {
    const current = ctx.scene.entity.stats.get(id, stat)?.current ?? 0;
    if (current > 0) ctx.scene.entity.stats.set(id, stat, { current: current - 1 });
  }
}

const WEAK_MULTIPLIER = 0.75;
const VULNERABLE_MULTIPLIER = 1.5;

/**
 * Weak reduces the attacker's outgoing hit before Vulnerable amplifies it.
 * Installed ahead of Vulnerable so the flooring order matches Slay-the-Spire:
 * floor(base * 0.75) THEN floor(that * 1.5). Passes through untouched when the
 * attacker carries no Weak stacks.
 */
function weakInterceptor(attackerWeak: number): DamageInterceptor {
  return {
    id: "spire.weak",
    intercept(pending) {
      if (attackerWeak <= 0) return { kind: "pass" };
      return {
        kind: "transform",
        amount: Math.floor(pending.amount * WEAK_MULTIPLIER),
        note: `weak x${WEAK_MULTIPLIER}`,
      };
    },
  };
}

/**
 * Vulnerable amplifies the incoming hit against the defender, applied AFTER Weak
 * so the two floors compose in the historical order. Passes through untouched
 * when the defender carries no Vulnerable stacks.
 */
function vulnerableInterceptor(defenderVulnerable: number): DamageInterceptor {
  return {
    id: "spire.vulnerable",
    intercept(pending) {
      if (defenderVulnerable <= 0) return { kind: "pass" };
      return {
        kind: "transform",
        amount: Math.floor(pending.amount * VULNERABLE_MULTIPLIER),
        note: `vulnerable x${VULNERABLE_MULTIPLIER}`,
      };
    },
  };
}

/**
 * Resolve a strike's final impact through the shared `@jgengine/core` damage
 * interception pipeline: Weak then Vulnerable, each an ordered, inspectable
 * interceptor with provenance rather than an inline multiplier. `source`/`target`
 * are threaded purely for provenance readability and do not affect the number.
 */
export function scaleDamage(
  base: number,
  attackerWeak: number,
  defenderVulnerable: number,
  source = "attacker",
  target = "defender",
): number {
  const pending: PendingDamage = { source, target, amount: Math.max(0, base), tag: "strike" };
  const resolution = resolveDamage(
    [weakInterceptor(attackerWeak), vulnerableInterceptor(defenderVulnerable)],
    pending,
    { nowMs: 0 },
  );
  return resolution.applications.reduce((sum, application) => sum + application.amount, 0);
}

function statusLabel(status: "weak" | "vulnerable"): string {
  return status === "weak" ? "Weak" : "Vulnerable";
}

export interface CombatStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): CombatSnapshot;
  start(ctx: GameContext, enemy: EnemyDef, options?: { freshDeck?: boolean }): void;
  canPlay(cardId: string): string | null;
  playCard(ctx: GameContext, cardId: string): void;
  endTurn(ctx: GameContext): void;
  addReward(ctx: GameContext, cardType: string): void;
  onEntityDied(ctx: GameContext, instanceId: string): void;
}

export function createCombatStore(): CombatStore {
  const listeners = new Set<() => void>();
  let state: CombatState | null = null;
  let snapshot: CombatSnapshot = EMPTY_SNAPSHOT;

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function heroId(ctx: GameContext): string {
    return ctx.player.userId;
  }

  function drawCards(current: CombatState, count: number): string[] {
    return [...current.pile.draw(count)];
  }

  function sync(ctx: GameContext): void {
    if (state === null) {
      snapshot = EMPTY_SNAPSHOT;
      notify();
      return;
    }
    const current = state;
    const hero = heroId(ctx);
    const heroHealth = statValue(ctx, hero, "health");
    const enemyHealth = statValue(ctx, ENEMY_ID, "health");
    const energyPool = current.turn.pool(TURN_HERO, ENERGY_POOL);
    const handIds = current.pile.state().zones.hand;
    snapshot = {
      phase: current.phase,
      round: current.turn.round(),
      energy: {
        current: energyPool?.current ?? 0,
        max: energyPool?.max ?? MAX_ENERGY,
      },
      hero: {
        hp: heroHealth.current,
        maxHp: heroHealth.max,
        block: statValue(ctx, hero, "block").current,
        strength: strengthOf(ctx, hero),
        weak: weakOf(ctx, hero),
        vulnerable: vulnerableOf(ctx, hero),
      },
      enemy: {
        name: current.enemy.name,
        tier: current.enemy.tier,
        hp: enemyHealth.current,
        maxHp: enemyHealth.max,
        block: statValue(ctx, ENEMY_ID, "block").current,
        strength: strengthOf(ctx, ENEMY_ID),
        weak: weakOf(ctx, ENEMY_ID),
        vulnerable: vulnerableOf(ctx, ENEMY_ID),
      },
      intent: current.intent,
      hand: handIds.map((id) => ({ id, card: cardOf(id) })),
      deckCount: current.pile.count("deck"),
      discardCount: current.pile.count("discard"),
      exhaustCount: current.pile.count("exhaust"),
      log: [...current.log],
    };
    notify();
  }

  function log(current: CombatState, line: string): void {
    current.log.unshift(line);
    if (current.log.length > 24) current.log.pop();
  }

  function applyCard(ctx: GameContext, current: CombatState, card: CardData): void {
    const hero = heroId(ctx);
    const effects = card.effects;
    if (effects.strength !== undefined) {
      ctx.scene.entity.stats.delta(hero, "strength", effects.strength);
    }
    if (effects.block !== undefined) {
      ctx.scene.entity.stats.delta(hero, "block", effects.block);
    }
    if (effects.energy !== undefined) {
      current.turn.gain(TURN_HERO, ENERGY_POOL, effects.energy);
    }
    if (effects.damage !== undefined) {
      const base = effects.damage + strengthOf(ctx, hero);
      const amount = scaleDamage(base, weakOf(ctx, hero), vulnerableOf(ctx, ENEMY_ID), hero, ENEMY_ID);
      const hits = effects.hits ?? 1;
      for (let hit = 0; hit < hits; hit += 1) {
        if ((ctx.scene.entity.stats.get(ENEMY_ID, "health")?.current ?? 0) <= 0) break;
        ctx.scene.entity.effect({ from: hero, to: ENEMY_ID, effect: "strike", via: { amount } });
      }
    }
    if (effects.weak !== undefined) {
      ctx.scene.entity.stats.delta(ENEMY_ID, "weak", effects.weak);
    }
    if (effects.vulnerable !== undefined) {
      ctx.scene.entity.stats.delta(ENEMY_ID, "vulnerable", effects.vulnerable);
    }
    if (effects.draw !== undefined && effects.draw > 0) {
      drawCards(current, effects.draw);
    }
  }

  function executeIntent(ctx: GameContext, current: CombatState): void {
    const intent = current.intent;
    if (intent === null) return;
    const hero = heroId(ctx);
    const enemyName = current.enemy.name;
    if (intent.kind === "attack") {
      const amount = scaleDamage(intent.value, weakOf(ctx, ENEMY_ID), vulnerableOf(ctx, hero), ENEMY_ID, hero);
      const hits = intent.hits ?? 1;
      for (let hit = 0; hit < hits; hit += 1) {
        if ((ctx.scene.entity.stats.get(hero, "health")?.current ?? 0) <= 0) break;
        ctx.scene.entity.effect({ from: ENEMY_ID, to: hero, effect: "strike", via: { amount } });
      }
      log(current, hits > 1 ? `${enemyName} strikes ${hits}x for ${amount} each.` : `${enemyName} attacks for ${amount}.`);
    } else if (intent.kind === "defend") {
      ctx.scene.entity.stats.delta(ENEMY_ID, "block", intent.value);
      log(current, `${enemyName} guards for ${intent.value} Block.`);
    } else if (intent.kind === "buff") {
      ctx.scene.entity.stats.delta(ENEMY_ID, "strength", intent.value);
      log(current, `${enemyName} grows stronger (+${intent.value}).`);
    } else {
      ctx.scene.entity.stats.delta(hero, intent.status!, intent.value);
      log(current, `${enemyName} inflicts ${intent.value} ${statusLabel(intent.status!)}.`);
    }
  }

  function beginPlayerTurn(ctx: GameContext, current: CombatState): void {
    current.turn.advanceTurn();
    ctx.scene.entity.stats.set(heroId(ctx), "block", { current: 0 });
    drawCards(current, HAND_SIZE);
    current.intent = intentForEncounter(current.enemy, current.enemyTurns, strengthOf(ctx, ENEMY_ID));
    current.phase = "player";
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return snapshot;
    },
    start(ctx, enemy, options) {
      const seed = (state?.seed ?? 0) + 1;
      const turn = createTurnLoop({
        order: [TURN_HERO, TURN_ENEMY],
        pools: [{ id: ENERGY_POOL, max: MAX_ENERGY, start: MAX_ENERGY }],
      });
      const hero = heroId(ctx);
      const freshDeck = options?.freshDeck ?? state === null;
      const pile = freshDeck || state === null ? newPile(seed) : carryPile(state.pile, seed);
      if (freshDeck) {
        if (ctx.scene.entity.get(hero) !== null) ctx.scene.entity.despawn(hero);
        ctx.scene.entity.spawn(HERO_CATALOG_ID, { id: hero, role: "player", position: [-2, 0, 0] });
      } else {
        ctx.scene.entity.stats.set(hero, "block", { current: 0 });
        ctx.scene.entity.stats.set(hero, "weak", { current: 0 });
        ctx.scene.entity.stats.set(hero, "vulnerable", { current: 0 });
      }
      if (ctx.scene.entity.get(ENEMY_ID) !== null) ctx.scene.entity.despawn(ENEMY_ID);
      ctx.scene.entity.spawn(ENEMY_CATALOG_ID, { id: ENEMY_ID, role: "npc", position: [2, 0, 0] });
      ctx.scene.entity.stats.set(ENEMY_ID, "health", { max: enemy.maxHp, current: enemy.maxHp });
      const fresh: CombatState = {
        pile,
        turn,
        phase: "player",
        intent: null,
        enemyTurns: 0,
        seed,
        rewardSerial: state?.rewardSerial ?? 0,
        log: freshDeck ? [] : state?.log ?? [],
        enemy,
      };
      fresh.pile.draw(HAND_SIZE);
      fresh.intent = intentForEncounter(enemy, 0, strengthOf(ctx, ENEMY_ID));
      log(fresh, `${enemy.name} appears!`);
      state = fresh;
      sync(ctx);
    },
    canPlay(cardId) {
      if (state === null) return "no combat";
      if (state.phase !== "player") return "not your turn";
      if (state.pile.zoneOf(cardId) !== "hand") return "card not in hand";
      const energy = state.turn.pool(TURN_HERO, ENERGY_POOL);
      const cost = cardOf(cardId).cost;
      if (energy === null || energy.current < cost) return "not enough energy";
      return null;
    },
    playCard(ctx, cardId) {
      if (state === null || this.canPlay(cardId) !== null) return;
      const current = state;
      const card = cardOf(cardId);
      current.turn.spend(TURN_HERO, ENERGY_POOL, card.cost);
      applyCard(ctx, current, card);
      if (card.effects.exhaust) current.pile.exhaust([cardId], "exhaust");
      else current.pile.discard([cardId]);
      log(current, `You play ${card.name}.`);
      sync(ctx);
    },
    endTurn(ctx) {
      if (state === null || state.phase !== "player") return;
      const current = state;
      const hand = [...current.pile.state().zones.hand];
      if (hand.length > 0) current.pile.discard(hand);
      decayStatus(ctx, heroId(ctx));
      current.phase = "enemy";
      current.turn.advanceTurn();
      ctx.scene.entity.stats.set(ENEMY_ID, "block", { current: 0 });
      executeIntent(ctx, current);
      decayStatus(ctx, ENEMY_ID);
      current.enemyTurns += 1;
      const heroAlive = (ctx.scene.entity.stats.get(heroId(ctx), "health")?.current ?? 0) > 0;
      const enemyAlive = (ctx.scene.entity.stats.get(ENEMY_ID, "health")?.current ?? 0) > 0;
      if (heroAlive && enemyAlive) {
        beginPlayerTurn(ctx, current);
      }
      sync(ctx);
    },
    addReward(ctx, cardType) {
      if (state === null) return;
      const current = state;
      current.rewardSerial += 1;
      const cardId = `${cardType}#reward${current.rewardSerial}`;
      const zones = current.pile.state().zones;
      current.pile.reset({ zones: { ...zones, discard: [cardId, ...zones.discard] } });
      log(current, `${cardOf(cardId).name} joins your deck.`);
      sync(ctx);
    },
    onEntityDied(ctx, instanceId) {
      if (state === null) return;
      if (instanceId === ENEMY_ID) {
        state.phase = "won";
        log(state, `${state.enemy.name} is destroyed. Victory!`);
      } else if (instanceId === heroId(ctx)) {
        state.phase = "lost";
        log(state, "You fall in battle. Defeat.");
      }
      sync(ctx);
    },
  };
}

export const combatHandle = defineStore<CombatStore>("spire.combat", () => createCombatStore());
