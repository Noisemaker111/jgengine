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
    reduce(state: TState, action: TAction) {
      let nextState = state;
      for (const feature of features) {
        nextState = feature.reduce ? feature.reduce(nextState, action) : nextState;
      }
      return nextState;
    },
    derive(state: TState) {
      let nextState = state;
      for (const feature of features) {
        nextState = feature.derive ? feature.derive(nextState) : nextState;
      }
      return nextState;
    },
    onTransition(previous: TState, next: TState, emit: <K extends keyof TEventMap>(eventName: K, payload: TEventMap[K]) => void) {
      for (const feature of features) {
        feature.onTransition?.(previous, next, emit);
      }
    },
  };
}
