export type CommandValidationError = { reason: string };

export type CommandDef<TInput = unknown> = {
  validate: (
    snapshot: import("./snapshot").GameRuntimeSnapshot,
    input: TInput,
    actorUserId: string,
  ) => CommandValidationError | null;
  apply: (
    snapshot: import("./snapshot").GameRuntimeSnapshot,
    input: TInput,
    actorUserId: string,
  ) => import("./snapshot").GameRuntimeSnapshot;
};

export type RunCommandResult =
  | { ok: true; snapshot: import("./snapshot").GameRuntimeSnapshot }
  | { ok: false; reason: string };

export function runCommand<TInput>(
  snapshot: import("./snapshot").GameRuntimeSnapshot,
  commands: Record<string, CommandDef<TInput>>,
  commandName: string,
  input: TInput,
  actorUserId: string,
): RunCommandResult {
  const command = commands[commandName];
  if (!command) {
    return { ok: false, reason: `Unknown command: ${commandName}` };
  }

  const validationError = command.validate(snapshot, input, actorUserId);
  if (validationError) {
    return { ok: false, reason: validationError.reason };
  }

  const next = command.apply(snapshot, input, actorUserId);
  return {
    ok: true,
    snapshot: {
      ...next,
      revision: snapshot.revision + 1,
      dirty: {
        server: true,
        players: next.dirty.players.includes(actorUserId)
          ? next.dirty.players
          : [...next.dirty.players, actorUserId],
        chunks: next.dirty.chunks,
      },
    },
  };
}
