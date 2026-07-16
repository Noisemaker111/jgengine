export interface CommandRejection {
  reason: string;
}

export type CommandDecodeResult<TInput> =
  | { ok: true; value: TInput }
  | { ok: false; reason: string };

/** Parses raw `unknown` transport input into `TInput`, rejecting anything that doesn't match the command's declared shape. Runs before `validate`/`apply`, so a malformed payload never reaches game logic. */
export type CommandDecoder<TInput> = (input: unknown) => CommandDecodeResult<TInput>;

export interface CommandDefinition<TState, TInput> {
  /** Runtime codec for this command's input. Declaring one turns the boundary strict: a payload that fails to decode is rejected before `validate`/`apply` ever see it. Omit to keep passing raw input through unchanged (existing behavior). */
  decode?: CommandDecoder<TInput>;
  validate?(state: TState, input: TInput): CommandRejection | null;
  apply(state: TState, input: TInput): TState | void;
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

      let decoded = input as never;
      if (definition.decode) {
        const result = definition.decode(input);
        if (!result.ok) return { status: "rejected", reason: result.reason };
        decoded = result.value as never;
      }

      const rejection = definition.validate?.(state, decoded) ?? null;
      if (rejection) return { status: "rejected", reason: rejection.reason };

      const next = definition.apply(state, decoded);
      return { status: "applied", state: next === undefined ? state : next };
    },
  };
}
