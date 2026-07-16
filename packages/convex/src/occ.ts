import type { GameRuntime } from "@jgengine/core/runtime/gameRuntime";
import type { GameRuntimeSnapshot } from "@jgengine/core/runtime/snapshot";

export const REVISION_CONFLICT_REASON = "Revision conflict";

/** @internal */
export function commitIfRevisionMatch(
  loadedRevision: number,
  currentRevision: number,
): { ok: true } | { ok: false; reason: string } {
  if (currentRevision !== loadedRevision) {
    return { ok: false, reason: REVISION_CONFLICT_REASON };
  }
  return { ok: true };
}

/** @internal */
export function applyCommandWithOcc(args: {
  loadedRevision: number;
  currentRevision: number;
  snapshot: GameRuntimeSnapshot;
  runtime: GameRuntime;
  actorUserId: string;
  command: string;
  input: unknown;
}):
  | { ok: true; snapshot: GameRuntimeSnapshot }
  | { ok: false; reason: string } {
  const gate = commitIfRevisionMatch(args.loadedRevision, args.currentRevision);
  if (!gate.ok) return gate;
  if (args.snapshot.revision !== args.loadedRevision) {
    return { ok: false, reason: REVISION_CONFLICT_REASON };
  }
  return args.runtime.runCommand(args.snapshot, args.actorUserId, args.command, args.input);
}
