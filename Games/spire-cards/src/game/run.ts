import { pileRng, shuffleWithRng } from "@jgengine/core/cards/cardPile";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { CARD_CATALOG, type CardData } from "./cards";
import { combat, type CombatSnapshot } from "./combat";
import { ENCOUNTERS, type EnemyDef } from "./enemy";

export type RunPhase = "combat" | "reward" | "victory" | "defeat";

export interface RunSnapshot {
  phase: RunPhase;
  encounterIndex: number;
  encounterCount: number;
  rewardOptions: readonly CardData[];
  combat: CombatSnapshot;
}

const STARTER_TYPES = new Set(["strike", "defend"]);
const REWARD_POOL = Object.keys(CARD_CATALOG).filter((type) => !STARTER_TYPES.has(type));

export interface RunStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): RunSnapshot;
  start(ctx: GameContext): void;
  canPlay(cardId: string): string | null;
  playCard(ctx: GameContext, cardId: string): void;
  endTurn(ctx: GameContext): void;
  canChooseReward(cardType: string): boolean;
  chooseReward(ctx: GameContext, cardType: string): void;
  skipReward(ctx: GameContext): void;
}

function createRunStore(): RunStore {
  const listeners = new Set<() => void>();
  let phase: RunPhase = "combat";
  let encounterIndex = 0;
  let rewardSeed = 0;
  let rewardOptions: CardData[] = [];
  let snapshot: RunSnapshot = {
    phase,
    encounterIndex,
    encounterCount: ENCOUNTERS.length,
    rewardOptions,
    combat: combat.getSnapshot(),
  };

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function currentEnemy(): EnemyDef {
    return ENCOUNTERS[encounterIndex]!;
  }

  function rollRewards(): CardData[] {
    rewardSeed += 1;
    const shuffled = shuffleWithRng(REWARD_POOL, pileRng(rewardSeed));
    return shuffled.slice(0, 3).map((type) => CARD_CATALOG[type]!);
  }

  function sync(): void {
    snapshot = {
      phase,
      encounterIndex,
      encounterCount: ENCOUNTERS.length,
      rewardOptions,
      combat: combat.getSnapshot(),
    };
    notify();
  }

  function advance(ctx: GameContext): void {
    encounterIndex += 1;
    phase = "combat";
    rewardOptions = [];
    combat.start(ctx, currentEnemy());
    sync();
  }

  combat.subscribe(() => {
    if (phase === "combat") {
      const combatPhase = combat.getSnapshot().phase;
      if (combatPhase === "won") {
        phase = encounterIndex >= ENCOUNTERS.length - 1 ? "victory" : "reward";
        if (phase === "reward") rewardOptions = rollRewards();
      } else if (combatPhase === "lost") {
        phase = "defeat";
      }
    }
    sync();
  });

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
      encounterIndex = 0;
      phase = "combat";
      rewardOptions = [];
      combat.start(ctx, currentEnemy(), { freshDeck: true });
      sync();
    },
    canPlay(cardId) {
      return combat.canPlay(cardId);
    },
    playCard(ctx, cardId) {
      combat.playCard(ctx, cardId);
    },
    endTurn(ctx) {
      combat.endTurn(ctx);
    },
    canChooseReward(cardType) {
      return phase === "reward" && rewardOptions.some((card) => card.type === cardType);
    },
    chooseReward(ctx, cardType) {
      if (!this.canChooseReward(cardType)) return;
      combat.addReward(ctx, cardType);
      advance(ctx);
    },
    skipReward(ctx) {
      if (phase !== "reward") return;
      advance(ctx);
    },
  };
}

export const run: RunStore = createRunStore();
