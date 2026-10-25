export interface StateFeature<TState, TAction, TEventMap extends object> {
  reduce?: (state: TState, action: TAction) => TState;
  derive?: (state: TState) => TState;
  onTransition?: (
    previous: TState,
    next: TState,
    emit: <K extends keyof TEventMap>(eventName: K, payload: TEventMap[K]) => void,
  ) => void;
}

export function composeStateFeatures<TState, TAction, TEventMap extends object>(
  features: readonly StateFeature<TState, TAction, TEventMap>[],
) {
  return {
    reduce(state: TState, action: TAction): TState {
      let nextState = state;
      for (const feature of features) {
        nextState = feature.reduce ? feature.reduce(nextState, action) : nextState;
      }
      return nextState;
    },
    derive(state: TState): TState {
      let nextState = state;
      for (const feature of features) {
        nextState = feature.derive ? feature.derive(nextState) : nextState;
      }
      return nextState;
    },
    onTransition(
      previous: TState,
      next: TState,
      emit: <K extends keyof TEventMap>(eventName: K, payload: TEventMap[K]) => void,
    ): void {
      for (const feature of features) {
        feature.onTransition?.(previous, next, emit);
      }
    },
  };
}

export interface EngineStoreConfig<TState, TAction, TEventMap extends object> {
  initialState: TState;
  reduce: (state: TState, action: TAction) => TState;
  derive?: (state: TState) => TState;
  onTransition?: (
    previous: TState,
    next: TState,
    emit: <K extends keyof TEventMap>(eventName: K, payload: TEventMap[K]) => void,
  ) => void;
}

export class EngineStore<TState, TAction, TEventMap extends object> {
  private snapshot: TState;
  private readonly stateListeners = new Set<(state: TState) => void>();
  private readonly eventListeners: Partial<Record<keyof TEventMap, Set<(payload: never) => void>>> = {};
  private readonly reduce: (state: TState, action: TAction) => TState;
  private readonly derive: ((state: TState) => TState) | null;
  private readonly onTransition: EngineStoreConfig<TState, TAction, TEventMap>["onTransition"];

  constructor(config: EngineStoreConfig<TState, TAction, TEventMap>) {
    this.snapshot = config.derive ? config.derive(config.initialState) : config.initialState;
    this.reduce = config.reduce;
    this.derive = config.derive ?? null;
    this.onTransition = config.onTransition;
  }

  getState(): TState {
    return this.snapshot;
  }

  subscribe(listener: (state: TState) => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  dispatch(action: TAction): void {
    const previous = this.snapshot;
    const reduced = this.reduce(previous, action);
    const next = this.derive ? this.derive(reduced) : reduced;
    this.snapshot = next;
    for (const listener of this.stateListeners) listener(next);
    this.onTransition?.(previous, next, (eventName, payload) => {
      this.emit(eventName, payload);
    });
  }

  on<K extends keyof TEventMap>(eventName: K, listener: (payload: TEventMap[K]) => void): () => void {
    const bucket = this.getEventBucket(eventName);
    bucket.add(listener as (payload: never) => void);
    return () => {
      bucket.delete(listener as (payload: never) => void);
    };
  }

  private emit<K extends keyof TEventMap>(eventName: K, payload: TEventMap[K]): void {
    for (const listener of this.getEventBucket(eventName)) {
      (listener as (value: TEventMap[K]) => void)(payload);
    }
  }

  private getEventBucket<K extends keyof TEventMap>(eventName: K): Set<(payload: never) => void> {
    const currentBucket = this.eventListeners[eventName];
    if (currentBucket !== undefined) return currentBucket;
    const nextBucket = new Set<(payload: never) => void>();
    this.eventListeners[eventName] = nextBucket;
    return nextBucket;
  }
}
