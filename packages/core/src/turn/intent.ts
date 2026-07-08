export interface DeclaredIntent<TKind extends string = string> {
  participant: string;
  kind: TKind;
  magnitude?: number;
  target?: string;
  data?: unknown;
}

export interface IntentBoardSnapshot {
  intents: DeclaredIntent[];
}

export interface IntentBoard<TKind extends string = string> {
  declare(intent: DeclaredIntent<TKind>): void;
  peek(participant: string): DeclaredIntent<TKind> | null;
  all(): readonly DeclaredIntent<TKind>[];
  resolve(participant: string): DeclaredIntent<TKind> | null;
  clear(participant?: string): void;
  capture(): IntentBoardSnapshot;
  restore(snapshot: IntentBoardSnapshot): void;
}

export function createIntentBoard<TKind extends string = string>(): IntentBoard<TKind> {
  const intents = new Map<string, DeclaredIntent<TKind>>();

  return {
    declare(intent) {
      intents.set(intent.participant, intent);
    },
    peek: (participant) => intents.get(participant) ?? null,
    all: () => [...intents.values()],
    resolve(participant) {
      const intent = intents.get(participant);
      if (intent === undefined) return null;
      intents.delete(participant);
      return intent;
    },
    clear(participant) {
      if (participant === undefined) {
        intents.clear();
        return;
      }
      intents.delete(participant);
    },
    capture: () => ({ intents: [...intents.values()] as DeclaredIntent[] }),
    restore(snapshot) {
      intents.clear();
      for (const intent of snapshot.intents) intents.set(intent.participant, intent as DeclaredIntent<TKind>);
    },
  };
}
