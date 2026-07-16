import type { GameContext } from "./gameContext";
import type { HostedWorldSession } from "./hostedWorldSession";
import { applyWorldDiff, type WorldDiff } from "./worldReplication";
import type { WorldSnapshot } from "./worldSnapshot";

/**
 * The client end of host-authoritative replication: folds a host's baseline + {@link WorldDiff} stream onto a
 * local {@link GameContext}. It keeps the last full {@link WorldSnapshot}, advances it with each diff, and pushes
 * the result through `ctx.hydrate` — so the client mirrors exactly the subsystems its own game opted into and
 * silently ignores host modules it lacks. This is the inverse of a {@link HostedWorldSession}; the transport in
 * between (loopback, ws, Convex) is irrelevant.
 */
export interface WorldMirror {
  applyBaseline(revision: number, snapshot: WorldSnapshot): void;
  /**
   * Fold one {@link WorldDiff} onto the mirror. A diff whose `revision` doesn't advance past the mirror's own
   * (stale or a duplicate resend) is ignored. A diff carrying `baseRevision` that doesn't match the mirror's
   * current revision means frames were skipped in transit — the diff is ignored and {@link needsResync} flips
   * true until the next {@link applyBaseline} instead of folding a gap onto local state. A diff without
   * `baseRevision` (legacy producer) always applies, matching the pre-revision-checking behavior.
   */
  applyDiff(diff: WorldDiff): void;
  revision(): number;
  /** True after `applyDiff` detected a skipped revision; the caller should fetch a fresh baseline instead of more diffs. */
  needsResync(): boolean;
}

/** Build a {@link WorldMirror} that replicates a host's baseline + diff stream onto `ctx` via `ctx.hydrate`.
 * @internal
 */
export function createWorldMirror(ctx: Pick<GameContext, "hydrate">): WorldMirror {
  let mirror: WorldSnapshot = {};
  let revision = 0;
  let resyncNeeded = false;
  return {
    applyBaseline(nextRevision, snapshot) {
      mirror = snapshot;
      revision = nextRevision;
      resyncNeeded = false;
      ctx.hydrate(snapshot);
    },
    applyDiff(diff) {
      if (diff.revision <= revision) return;
      if (diff.baseRevision !== undefined && diff.baseRevision !== revision) {
        resyncNeeded = true;
        return;
      }
      resyncNeeded = false;
      mirror = applyWorldDiff(mirror, diff);
      revision = diff.revision;
      ctx.hydrate(mirror);
    },
    revision: () => revision,
    needsResync: () => resyncNeeded,
  };
}

/**
 * Pull one replication step from a co-located {@link HostedWorldSession} into a {@link WorldMirror} — the
 * no-network local path (host and client in one process). A fresh mirror pulls a baseline; thereafter it pulls
 * a diff since its own revision. The same `sync(sinceRevision)` call is what a networked transport marshals.
  * @internal
  */
export function pullWorld(session: HostedWorldSession, mirror: WorldMirror): void {
  const sync = session.sync(mirror.revision() === 0 ? null : mirror.revision());
  if (sync.kind === "baseline") mirror.applyBaseline(sync.revision, sync.snapshot);
  else mirror.applyDiff(sync.diff);
}
