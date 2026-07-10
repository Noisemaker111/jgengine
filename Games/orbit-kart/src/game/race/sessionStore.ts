import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { RaceSession, SessionSnapshot } from "./session";

export const SESSION_STORE_KEY = "orbitKartSession";

export function readSession(ctx: GameContext): RaceSession | undefined {
  return ctx.game.store.get(SESSION_STORE_KEY) as RaceSession | undefined;
}

export function readSnapshot(ctx: GameContext): SessionSnapshot | null {
  const session = readSession(ctx);
  return session === undefined ? null : session.snapshot();
}
