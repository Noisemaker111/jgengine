import { useGameStore } from "@jgengine/react/hooks";

import type { SessionState } from "../session/sessionState";
import type { CourseDef } from "../world/courses";

export function useSession(): SessionState | undefined {
  return useGameStore((ctx) => ctx.game.store.get("session") as SessionState | undefined);
}

export function useActiveCourse(): CourseDef | undefined {
  return useGameStore((ctx) => ctx.game.store.get("course") as CourseDef | undefined);
}
