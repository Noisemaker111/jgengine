import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { session } from "./session";
import { park } from "./park";

export function traceNative(kind: string, details: unknown = null): void {
  if (!import.meta.env.DEV || import.meta.env.VITE_PARK_EVIDENCE !== "1") return;
  void fetch("/__brightway/evidence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, details }) }).catch(() => {});
}

export function tracePark(ctx: GameContext, kind: string, details: unknown = null): void {
  if (!import.meta.env.DEV || import.meta.env.VITE_PARK_EVIDENCE !== "1") return;
  const w = park.of(ctx);
  traceNative(kind, { details, clock: ctx.time.snapshot(), facts: w.facts(), guests: session.guests.size,
    builds: w.instances(), selected: session.selectedObject, tool: session.selectedTool });
}
