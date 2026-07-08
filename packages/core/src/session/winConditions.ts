export interface WinVerdict {
  winner: string;
  conditionId: string;
}

export interface WinConditionSet<TState> {
  add(id: string, evaluate: (state: TState) => string | null): () => void;
  evaluate(state: TState): WinVerdict | null;
  ids(): readonly string[];
}

export function createWinConditionSet<TState>(): WinConditionSet<TState> {
  const conditions: { id: string; evaluate: (state: TState) => string | null }[] = [];

  return {
    add(id, evaluate) {
      const entry = { id, evaluate };
      conditions.push(entry);
      return () => {
        const index = conditions.indexOf(entry);
        if (index !== -1) conditions.splice(index, 1);
      };
    },
    evaluate(state) {
      for (const condition of conditions) {
        const winner = condition.evaluate(state);
        if (winner !== null) return { winner, conditionId: condition.id };
      }
      return null;
    },
    ids: () => conditions.map((condition) => condition.id),
  };
}
