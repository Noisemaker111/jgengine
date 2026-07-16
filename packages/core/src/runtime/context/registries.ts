import { createCardPile, type CardPile, type CardPileConfig } from "../../cards/cardPile";
import { RaceState, type RaceEvent, type RaceStateConfig } from "../../game/race";
import { notifyAfter } from "../../store/changeSignal";
import { createTurnLoop, type TurnLoop, type TurnLoopConfig } from "../../turn/turnLoop";

/** @internal Lazily-created, id-keyed card-pile / turn-loop / race registries shared by `ctx.game.cards|turn|race` and their save modules. */
export interface ContextRegistries {
  pile(id: string, config?: CardPileConfig): CardPile;
  loop(id: string, config?: TurnLoopConfig): TurnLoop;
  raceState(id: string, config?: RaceStateConfig): RaceState;
  cardPiles: ReadonlyMap<string, CardPile>;
  turnLoops: ReadonlyMap<string, TurnLoop>;
}

/** @internal */
export function createContextRegistries(signalNotify: () => void): ContextRegistries {
  const cardPiles = new Map<string, CardPile>();
  function pile(id: string, config?: CardPileConfig): CardPile {
    const existing = cardPiles.get(id);
    if (existing !== undefined) return existing;
    if (config === undefined) {
      throw new Error(`cardPile "${id}" has not been created yet; pass a config on first access`);
    }
    const created = notifyAfter(
      createCardPile(config),
      ["shuffle", "draw", "discard", "exhaust", "move", "reset"],
      signalNotify,
    );
    cardPiles.set(id, created);
    return created;
  }

  const turnLoops = new Map<string, TurnLoop>();
  function loop(id: string, config?: TurnLoopConfig): TurnLoop {
    const existing = turnLoops.get(id);
    if (existing !== undefined) return existing;
    if (config === undefined) {
      throw new Error(`turn loop "${id}" has not been created yet; pass a config on first access`);
    }
    const raw = createTurnLoop(config);
    const wrappedCommit = notifyAfter(
      raw.commit,
      ["submit", "expected", "commit", "discard", "clear"],
      signalNotify,
    );
    const wrapped: TurnLoop = {
      ...notifyAfter(
        raw,
        [
          "setOrder",
          "addParticipant",
          "removeParticipant",
          "advancePhase",
          "advanceTurn",
          "advanceRound",
          "spend",
          "gain",
          "refill",
          "restore",
        ],
        signalNotify,
      ),
      commit: wrappedCommit,
    };
    turnLoops.set(id, wrapped);
    return wrapped;
  }

  class NotifyingRaceState extends RaceState {
    override addRacer(racerId: string, startTime?: number): void {
      super.addRacer(racerId, startTime);
      signalNotify();
    }
    override removeRacer(racerId: string): void {
      super.removeRacer(racerId);
      signalNotify();
    }
    override reset(): void {
      super.reset();
      signalNotify();
    }
    override eliminate(racerId: string): void {
      super.eliminate(racerId);
      signalNotify();
    }
    override update(
      now: number,
      positions: Record<string, readonly [number, number, number]> | Map<string, readonly [number, number, number]>,
    ): readonly RaceEvent[] {
      const raceEvents = super.update(now, positions);
      if (raceEvents.length > 0) signalNotify();
      return raceEvents;
    }
  }

  const raceStates = new Map<string, RaceState>();
  function raceState(id: string, config?: RaceStateConfig): RaceState {
    const existing = raceStates.get(id);
    if (existing !== undefined) return existing;
    if (config === undefined) {
      throw new Error(`race "${id}" has not been created yet; pass a config on first access`);
    }
    const created = new NotifyingRaceState(config);
    raceStates.set(id, created);
    return created;
  }

  return { pile, loop, raceState, cardPiles, turnLoops };
}
