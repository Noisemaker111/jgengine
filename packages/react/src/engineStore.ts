import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

export interface ReadableEngineStore<TState> {
  getState(): TState;
  subscribe(listener: (state: TState) => void): () => void;
}

export interface EventfulEngineStore<TEventMap extends object> {
  on<K extends keyof TEventMap>(eventName: K, listener: (payload: TEventMap[K]) => void): () => void;
}

export function useEngineState<TState>(store: ReadableEngineStore<TState>): TState {
  const subscribe = useCallback(
    (onChange: () => void) => store.subscribe(() => onChange()),
    [store],
  );
  const getSnapshot = useCallback(() => store.getState(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useEngineStore<TState, TSelected>(
  store: ReadableEngineStore<TState>,
  selector: (state: TState) => TSelected,
): TSelected {
  return selector(useEngineState(store));
}

export function useEngineEvent<TEventMap extends object, K extends keyof TEventMap>(
  store: EventfulEngineStore<TEventMap>,
  eventName: K,
  handler: (payload: TEventMap[K]) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => store.on(eventName, (payload) => handlerRef.current(payload)), [store, eventName]);
}
