export interface CommandRejection {
  reason: string;
}

export interface CommandDefinition<TState, TInput> {
  validate?(state: TState, input: TInput): CommandRejection | null;
  apply(state: TState, input: TInput): TState;
}

export type CommandResult<TState> =
  | { status: "applied"; state: TState }
  | { status: "rejected"; reason: string }
  | { status: "unknown-command" };

export interface CommandRegistry<TState> {
  define<TInput>(name: string, definition: CommandDefinition<TState, TInput>): void;
  has(name: string): boolean;
  names(): string[];
  run(state: TState, name: string, input: unknown): CommandResult<TState>;
}

export function createCommandRegistry<TState>(): CommandRegistry<TState> {
  const definitions = new Map<string, CommandDefinition<TState, never>>();

  return {
    define(name, definition) {
      if (definitions.has(name)) {
        throw new Error(`Command "${name}" is already defined.`);
      }
      definitions.set(name, definition as CommandDefinition<TState, never>);
    },
    has(name) {
      return definitions.has(name);
    },
    names() {
      return Array.from(definitions.keys());
    },
    run(state, name, input) {
      const definition = definitions.get(name);
      if (!definition) return { status: "unknown-command" };

      const rejection = definition.validate?.(state, input as never) ?? null;
      if (rejection) return { status: "rejected", reason: rejection.reason };

      return { status: "applied", state: definition.apply(state, input as never) };
    },
  };
}
