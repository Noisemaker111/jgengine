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
  private readonly eventListeners: Partial<{ [K in keyof TEventMap]: Set<(payload: TEventMap[K]) => void> }>;
  private readonly reduce: (state: TState, action: TAction) => TState;
  private readonly derive: ((state: TState) => TState) | null;
  private readonly onTransition: EngineStoreConfig<TState, TAction, TEventMap>["onTransition"];

  constructor(config: EngineStoreConfig<TState, TAction, TEventMap>) {
    this.snapshot = config.derive ? config.derive(config.initialState) : config.initialState;
    this.reduce = config.reduce;
    this.derive = config.derive ?? null;
    this.onTransition = config.onTransition;
    this.eventListeners = {};
  }

  getState() {
    return this.snapshot;
  }

  subscribe(listener: (state: TState) => void) {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  dispatch(action: TAction) {
    this.setState((current) => this.reduce(current, action));
  }

  on<K extends keyof TEventMap>(eventName: K, listener: (payload: TEventMap[K]) => void) {
    this.getEventBucket(eventName).add(listener);
    return () => this.getEventBucket(eventName).delete(listener);
  }

  private setState(updater: (current: TState) => TState) {
    const previous = this.snapshot;
    const reduced = updater(previous);
    const next = this.derive ? this.derive(reduced) : reduced;
    this.snapshot = next;
    for (const listener of this.stateListeners) listener(next);
    this.onTransition?.(previous, next, (eventName, payload) => this.emit(eventName, payload));
  }

  private emit<K extends keyof TEventMap>(eventName: K, payload: TEventMap[K]) {
    for (const listener of this.getEventBucket(eventName)) listener(payload);
  }

  private getEventBucket<K extends keyof TEventMap>(eventName: K) {
    const currentBucket = this.eventListeners[eventName];
    if (currentBucket !== undefined) return currentBucket;

    const nextBucket = new Set<(payload: TEventMap[K]) => void>();
    this.eventListeners[eventName] = nextBucket;
    return nextBucket;
  }
}

