export interface DeclaredIntent<TKind extends string = string> {
  kind: TKind;
  magnitude?: number;
  targetId?: string;
  note?: string;
}

export interface IntentBoard<TKind extends string = string> {
  declare(participantId: string, intent: DeclaredIntent<TKind>): void;
  peek(participantId: string): DeclaredIntent<TKind> | null;
  all(): readonly [string, DeclaredIntent<TKind>][];
  consume(participantId: string): DeclaredIntent<TKind> | null;
  clear(participantId?: string): void;
}

export function createIntentBoard<TKind extends string = string>(): IntentBoard<TKind> {
  const intents = new Map<string, DeclaredIntent<TKind>>();

  return {
    declare(participantId, intent) {
      intents.set(participantId, { ...intent });
    },
    peek(participantId) {
      const intent = intents.get(participantId);
      return intent === undefined ? null : { ...intent };
    },
    all() {
      return [...intents.entries()].map(
        ([participantId, intent]) => [participantId, { ...intent }] as [string, DeclaredIntent<TKind>],
      );
    },
    consume(participantId) {
      const intent = intents.get(participantId);
      if (intent === undefined) return null;
      intents.delete(participantId);
      return intent;
    },
    clear(participantId) {
      if (participantId === undefined) {
        intents.clear();
        return;
      }
      intents.delete(participantId);
    },
  };
}
