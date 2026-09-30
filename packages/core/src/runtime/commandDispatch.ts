import type { CommandResult } from "../commands/commandRegistry";
import type { GameContext } from "./gameContext";
import type { LiveGameBackend } from "./transport";

/** A UI command completes locally or after its authoritative host acknowledges it. */
export type DispatchedCommandResult = CommandResult<GameContext> | Promise<CommandResult<GameContext>>;

type Route = { transport: LiveGameBackend["transport"]; serverId: () => string | null };
const routes = new WeakMap<GameContext, Route>();

/** Bind UI command dispatch to the host for this context. A missing join rejects; it never mutates the local replica. */
export function bindCommandTransport(ctx: GameContext, route: Route): () => void {
  routes.set(ctx, route);
  return () => { if (routes.get(ctx) === route) routes.delete(ctx); };
}

/** Dispatch a player's command through the bound host, or locally for an unbound offline context. Await the result before showing success. */
export function dispatchCommand(ctx: GameContext, name: string, input: unknown): DispatchedCommandResult {
  const route = routes.get(ctx);
  if (route === undefined) return ctx.game.commands.run(name, input);
  const serverId = route.serverId();
  if (serverId === null) return { status: "rejected", reason: "not-joined" };
  return route.transport.runCommand({ serverId, command: name, input }).then(
    (result): CommandResult<GameContext> => result.ok
      ? { status: "applied", state: ctx }
      : { status: "rejected", reason: result.reason },
    (error: unknown): CommandResult<GameContext> => ({ status: "rejected", reason: error instanceof Error ? error.message : "Command transport failed" }),
  );
}
