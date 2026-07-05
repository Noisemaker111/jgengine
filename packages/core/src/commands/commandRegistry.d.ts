export interface CommandRejection {
    reason: string;
}
export interface CommandDefinition<TState, TInput> {
    validate?(state: TState, input: TInput): CommandRejection | null;
    apply(state: TState, input: TInput): TState;
}
export type CommandResult<TState> = {
    status: "applied";
    state: TState;
} | {
    status: "rejected";
    reason: string;
} | {
    status: "unknown-command";
};
export interface CommandRegistry<TState> {
    define<TInput>(name: string, definition: CommandDefinition<TState, TInput>): void;
    has(name: string): boolean;
    names(): string[];
    run(state: TState, name: string, input: unknown): CommandResult<TState>;
}
export declare function createCommandRegistry<TState>(): CommandRegistry<TState>;
