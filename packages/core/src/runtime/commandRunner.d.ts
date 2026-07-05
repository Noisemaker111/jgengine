export type CommandValidationError = {
    reason: string;
};
export type CommandDef<TInput = unknown> = {
    validate: (snapshot: import("./snapshot").GameRuntimeSnapshot, input: TInput) => CommandValidationError | null;
    apply: (snapshot: import("./snapshot").GameRuntimeSnapshot, input: TInput) => import("./snapshot").GameRuntimeSnapshot;
};
export type RunCommandResult = {
    ok: true;
    snapshot: import("./snapshot").GameRuntimeSnapshot;
} | {
    ok: false;
    reason: string;
};
export declare function runCommand<TInput>(snapshot: import("./snapshot").GameRuntimeSnapshot, commands: Record<string, CommandDef<TInput>>, commandName: string, input: TInput, actorUserId: string): RunCommandResult;
