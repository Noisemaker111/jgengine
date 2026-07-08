import { createCardPile, type CardPile } from "@jgengine/core/cards/cardPile";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createTurnLoop, type TurnLoop } from "@jgengine/core/turn/turnLoop";

import { buildStartingDeck, cardOf, type CardData } from "./cards";
import {
  ENEMY_ID,
  ENEMY_NAME,
  ENERGY_POOL,
  HAND_SIZE,
  MAX_ENERGY,
  TURN_ENEMY,
  TURN_HERO,
  intentForTurn,
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
}

export interface CombatSnapshot {
  phase: Phase;
  round: number;
  energy: { current: number; max: number };
  hero: CombatantView;
  enemy: CombatantView & { name: string };
  intent: Intent | null;
  hand: readonly HandCard[];
  deckCount: number;
  discardCount: number;
  exhaustCount: number;
  log: readonly string[];
}

const EMPTY_VIEW: CombatantView = { hp: 0, maxHp: 0, block: 0, strength: 0 };
const EMPTY_SNAPSHOT: CombatSnapshot = {
  phase: "player",
  round: 1,
  energy: { current: 0, max: MAX_ENERGY },
  hero: EMPTY_VIEW,
  enemy: { ...EMPTY_VIEW, name: ENEMY_NAME },
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
  log: string[];
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

function statValue(ctx: GameContext, id: string, stat: string): { current: number; max: number } {
  const value = ctx.scene.entity.stats.get(id, stat);
  return value === null ? { current: 0, max: 0 } : { current: value.current, max: value.max };
}

function strengthOf(ctx: GameContext, id: string): number {
  return ctx.scene.entity.stats.get(id, "strength")?.current ?? 0;
}

export interface CombatStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): CombatSnapshot;
  start(ctx: GameContext): void;
  canPlay(cardId: string): string | null;
  playCard(ctx: GameContext, cardId: string): void;
  endTurn(ctx: GameContext): void;
  onEntityDied(ctx: GameContext, instanceId: string): void;
}

function createCombatStore(): CombatStore {
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
      },
      enemy: {
        name: ENEMY_NAME,
        hp: enemyHealth.current,
        maxHp: enemyHealth.max,
        block: statValue(ctx, ENEMY_ID, "block").current,
        strength: strengthOf(ctx, ENEMY_ID),
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
    if (effects.damage !== undefined) {
      const total = effects.damage + strengthOf(ctx, hero);
      ctx.scene.entity.effect({ from: hero, to: ENEMY_ID, effect: "strike", via: { amount: total } });
    }
    if (effects.draw !== undefined && effects.draw > 0) {
      drawCards(current, effects.draw);
    }
  }

  function executeIntent(ctx: GameContext, current: CombatState): void {
    const intent = current.intent;
    if (intent === null) return;
    const hero = heroId(ctx);
    if (intent.kind === "attack") {
      ctx.scene.entity.effect({ from: ENEMY_ID, to: hero, effect: "strike", via: { amount: intent.value } });
      log(current, `${ENEMY_NAME} attacks for ${intent.value}.`);
    } else if (intent.kind === "defend") {
      ctx.scene.entity.stats.delta(ENEMY_ID, "block", intent.value);
      log(current, `${ENEMY_NAME} guards for ${intent.value} Block.`);
    } else {
      ctx.scene.entity.stats.delta(ENEMY_ID, "strength", intent.value);
      log(current, `${ENEMY_NAME} grows stronger (+${intent.value}).`);
    }
  }

  function beginPlayerTurn(ctx: GameContext, current: CombatState): void {
    current.turn.advanceTurn();
    ctx.scene.entity.stats.set(heroId(ctx), "block", { current: 0 });
    drawCards(current, HAND_SIZE);
    current.intent = intentForTurn(current.enemyTurns, strengthOf(ctx, ENEMY_ID));
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
    start(ctx) {
      const seed = (state?.seed ?? 0) + 1;
      const turn = createTurnLoop({
        order: [TURN_HERO, TURN_ENEMY],
        pools: [{ id: ENERGY_POOL, max: MAX_ENERGY, start: MAX_ENERGY }],
      });
      const fresh: CombatState = {
        pile: newPile(seed),
        turn,
        phase: "player",
        intent: null,
        enemyTurns: 0,
        seed,
        log: [],
      };
      fresh.pile.draw(HAND_SIZE);
      fresh.intent = intentForTurn(0, strengthOf(ctx, ENEMY_ID));
      log(fresh, "Combat begins.");
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
      current.pile.discard([cardId]);
      log(current, `You play ${card.name}.`);
      sync(ctx);
    },
    endTurn(ctx) {
      if (state === null || state.phase !== "player") return;
      const current = state;
      const hand = [...current.pile.state().zones.hand];
      if (hand.length > 0) current.pile.discard(hand);
      current.phase = "enemy";
      current.turn.advanceTurn();
      ctx.scene.entity.stats.set(ENEMY_ID, "block", { current: 0 });
      executeIntent(ctx, current);
      current.enemyTurns += 1;
      const heroAlive = (ctx.scene.entity.stats.get(heroId(ctx), "health")?.current ?? 0) > 0;
      const enemyAlive = (ctx.scene.entity.stats.get(ENEMY_ID, "health")?.current ?? 0) > 0;
      if (heroAlive && enemyAlive) {
        beginPlayerTurn(ctx, current);
      }
      sync(ctx);
    },
    onEntityDied(ctx, instanceId) {
      if (state === null) return;
      if (instanceId === ENEMY_ID) {
        state.phase = "won";
        log(state, `${ENEMY_NAME} is destroyed. Victory!`);
      } else if (instanceId === heroId(ctx)) {
        state.phase = "lost";
        log(state, "You fall in battle. Defeat.");
      }
      sync(ctx);
    },
  };
}

export const combat: CombatStore = createCombatStore();
