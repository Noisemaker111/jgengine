export type CommandValidationError = { reason: string };

/**
 * Which slice of a server has to be hydrated before some work runs against it. Both fields default to
 * "everything", which costs a read per member plus one per chunk — the cost that makes a large shared
 * world unaffordable per mutation. Narrow them when the caller knows what it will touch.
 */
export type CommandScope = {
  /** Member ids to hydrate; omit for the whole roster. */
  players?: readonly string[];
  /** Chunk keys to hydrate; omit for every chunk of the server, `[]` for none. */
  chunkKeys?: readonly string[];
};

/** Declarative read scope; actor is resolved before host hydration. */
export type CommandScopeDefinition = Omit<CommandScope, "players"> & { players?: readonly string[] | "actor" };

export type CommandDef<TInput = unknown> = {
  /**
   * What this command reads and writes, derived from its own input. A host that hydrates through a
   * scope loads only this slice instead of the whole world, and refuses the command if `apply` then
   * dirties a player or chunk the scope did not name — writing an unhydrated chunk would overwrite
   * the stored one with a blank. Omit it to load only the actor and no chunks; return `{}` to request the whole world.
   */
  scope?: (input: TInput, actorUserId: string) => CommandScopeDefinition;
  /** `nowMs` is the host wall clock, in ms — read it rather than a `now` the client put in `input`. */
  validate: (
    snapshot: import("./snapshot").GameRuntimeSnapshot,
    input: TInput,
    actorUserId: string,
    nowMs: number,
  ) => CommandValidationError | null;
  apply: (
    snapshot: import("./snapshot").GameRuntimeSnapshot,
    input: TInput,
    actorUserId: string,
    nowMs: number,
  ) => import("./snapshot").GameRuntimeSnapshot;
};

/**
 * The resolved scope, defaulting to the actor and no chunks.
 * Evaluate it before hydration: the actor and the command's own input are both known by then.
 * @internal
 */
export function resolveCommandScope<TInput>(
  commands: Record<string, CommandDef<TInput>>,
  commandName: string,
  input: TInput,
  actorUserId: string,
): CommandScope {
  const scope = commands[commandName]?.scope?.(input, actorUserId) ?? { players: "actor", chunkKeys: [] };
  const { players, ...rest } = scope;
  return players === undefined ? rest : { ...rest, players: players === "actor" ? [actorUserId] : players };
}

/**
 * Widen a scope so the actor is always hydrated. A command's own player row is dirtied by
 * {@link runCommand} whatever the command did, and an unhydrated player is dropped from the persist.
 * @internal
 */
export function scopeWithActor(
  scope: CommandScope | undefined,
  actorUserId: string,
): CommandScope | undefined {
  if (!scope || scope.players === undefined || scope.players.includes(actorUserId)) return scope;
  return { ...scope, players: [...scope.players, actorUserId] };
}

/**
 * Why a command's writes escaped the scope it was hydrated under, or `null` when they did not.
 * A write outside the scope is a silent overwrite of unread state, so the host refuses it.
 * @internal
 */
export function commandScopeEscape(
  scope: CommandScope | undefined,
  dirty: import("./snapshot").GameRuntimeSnapshot["dirty"],
  commandName: string,
): string | null {
  if (!scope) return null;
  const strayPlayers =
    scope.players === undefined ? [] : dirty.players.filter((id) => !scope.players?.includes(id));
  const strayChunks =
    scope.chunkKeys === undefined ? [] : dirty.chunks.filter((key) => !scope.chunkKeys?.includes(key));
  if (strayPlayers.length === 0 && strayChunks.length === 0) return null;
  const parts = [
    strayPlayers.length > 0 ? `players ${strayPlayers.join(", ")}` : null,
    strayChunks.length > 0 ? `chunks ${strayChunks.join(", ")}` : null,
  ].filter((part): part is string => part !== null);
  return `Command "${commandName}" wrote outside its declared scope: ${parts.join("; ")}`;
}

export type RunCommandResult =
  | { ok: true; snapshot: import("./snapshot").GameRuntimeSnapshot }
  | { ok: false; reason: string };

/** @internal */
export function runCommand<TInput>(
  snapshot: import("./snapshot").GameRuntimeSnapshot,
  commands: Record<string, CommandDef<TInput>>,
  commandName: string,
  input: TInput,
  actorUserId: string,
  nowMs: number = Date.now(),
): RunCommandResult {
  const command = commands[commandName];
  if (!command) {
    return { ok: false, reason: `Unknown command: ${commandName}` };
  }

  const validationError = command.validate(snapshot, input, actorUserId, nowMs);
  if (validationError) {
    return { ok: false, reason: validationError.reason };
  }

  const next = command.apply(snapshot, input, actorUserId, nowMs);
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
