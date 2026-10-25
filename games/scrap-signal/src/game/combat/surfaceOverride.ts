import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import type { Surface } from "../handroll/guns";

/** A body presenting a surface other than its authored one: an Overdrive mutator's plating, say. */
const overridesOf = perContext(() => new Map<string, Surface>());

export function overrideSurface(ctx: GameContext, id: string, surface: Surface | null): void {
  if (surface === null) overridesOf(ctx).delete(id);
  else overridesOf(ctx).set(id, surface);
}

export function surfaceOverride(ctx: GameContext, id: string): Surface | undefined {
  return overridesOf(ctx).get(id);
}
