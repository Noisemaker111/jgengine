import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { LiveGameBackend } from "@jgengine/core/runtime/transport";

/** Where a gameplay command goes when the shell dispatches it — run locally, or sent to the authoritative host. */
export interface CommandSink {
  run(name: string, input: unknown): void;
}

/** Runs commands on the local `ctx` — the default, client-authoritative path.
 * @internal
 */
export function localCommandSink(ctx: GameContext): CommandSink {
  return {
    run(name, input) {
      ctx.game.commands.run(name, input);
    },
  };
}

/** Sends commands to the authoritative host over the transport; the result replicates back through world sync.
 * @internal
 */
export function remoteCommandSink(
  backend: Pick<LiveGameBackend, "transport">,
  serverId: string,
  events?: Pick<GameContext["game"]["events"], "emit">,
): CommandSink {
  return {
    run(name, input) {
      void backend.transport.runCommand({ serverId, command: name, input }).then((result) => {
        // Host refusals reach the local notice feed the same way local ones do.
        if (!result.ok && result.message !== undefined) {
          events?.emit("command.refused", { command: name, reason: result.reason, message: result.message, actor: null });
        }
      }).catch(() => undefined);
    },
  };
}

/**
 * The sink a server-authoritative shell should dispatch gameplay commands through: remote when the game opts into
 * `authority: "server"` and a server is joined. Before join it discards commands rather than mutating a replica.
  * @internal
  */
export function resolveCommandSink(
  ctx: GameContext,
  opts: {
    serverAuthoritative: boolean;
    backend: Pick<LiveGameBackend, "transport"> | null;
    serverId: string | null;
  },
): CommandSink {
  if (opts.serverAuthoritative && opts.backend !== null && opts.serverId !== null) {
    return remoteCommandSink(opts.backend, opts.serverId, ctx.game.events);
  }
  if (opts.serverAuthoritative) return { run() {} };
  return localCommandSink(ctx);
}
