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
  applyDiff(diff: WorldDiff): void;
  revision(): number;
}

/** Build a {@link WorldMirror} that replicates a host's baseline + diff stream onto `ctx` via `ctx.hydrate`. */
export function createWorldMirror(ctx: Pick<GameContext, "hydrate">): WorldMirror {
  let mirror: WorldSnapshot = {};
  let revision = 0;
  return {
    applyBaseline(nextRevision, snapshot) {
      mirror = snapshot;
      revision = nextRevision;
      ctx.hydrate(snapshot);
    },
    applyDiff(diff) {
      mirror = applyWorldDiff(mirror, diff);
      revision = diff.revision;
      ctx.hydrate(mirror);
    },
    revision: () => revision,
  };
}

/**
 * Pull one replication step from a co-located {@link HostedWorldSession} into a {@link WorldMirror} — the
 * no-network local path (host and client in one process). A fresh mirror pulls a baseline; thereafter it pulls
 * a diff since its own revision. The same `sync(sinceRevision)` call is what a networked transport marshals.
 */
export function pullWorld(session: HostedWorldSession, mirror: WorldMirror): void {
  const sync = session.sync(mirror.revision() === 0 ? null : mirror.revision());
  if (sync.kind === "baseline") mirror.applyBaseline(sync.revision, sync.snapshot);
  else mirror.applyDiff(sync.diff);
}
