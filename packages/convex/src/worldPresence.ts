import type { DocumentByName, GenericQueryCtx } from "convex/server";
import type { JGDataModel, JGMutationCtx } from "./server";
import { DEFAULT_POSE_SYNC_RULES, decidePoseSync, shouldPersistWorldSnapshot, type IncomingPose, type PoseSyncRules } from "@jgengine/core/multiplayer/presenceModel";
import type { PresencePosition, PresenceResidentRow } from "@jgengine/core/multiplayer/presenceContract";
import { chunkKeyAt, chunkKeysAround, parseChunkKey, DEFAULT_CHUNK_SIZE } from "@jgengine/core/runtime/worldChunks";

type ReadContext = { db: Pick<GenericQueryCtx<JGDataModel>["db"], "get" | "query"> };
type PoseRow = DocumentByName<JGDataModel, "jgPoses">;

/** Normalized actor identity and pose read from an indexed jgPoses row. */
export interface WorldPresenceRecord extends PresenceResidentRow {
  _id: PoseRow["_id"];
  serverId: string;
  presenceId: string;
  homeGameId: string;
  kind: string;
  label: string | null;
  position: PresencePosition;
  rotationY: number;
  rotationPitch: number;
  lastSeenAt: number;
  lastWorldSnapshotAt?: number;
}

/** World chunk size and host-owned pose, checkpoint and retention policies. */
export interface WorldPresenceOptions {
  chunkSize?: number;
  rules?: PoseSyncRules;
  idleTimeoutMs?: number;
  revokedTtlMs?: number;
  snapshotIntervalMs?: number;
}

/** Persist game-owned last-position state when the host store requests a checkpoint. */
export type PresenceSnapshotWriter = (presence: WorldPresenceRecord, nowMs: number) => Promise<void>;

function record(row: PoseRow): WorldPresenceRecord {
  return { _id: row._id, serverId: row.serverId, presenceId: row.sessionId ?? row.userId,
    actorExternalId: row.userId, ownerActorId: row.ownerActorId,
    homeGameId: row.homeGameId ?? "", kind: row.kind ?? "player", label: row.label ?? null,
    position: { x: row.x, y: row.y, z: row.z }, rotationY: row.rotationY,
    rotationPitch: row.rotationPitch, lastSeenAt: row.updatedAt, lastWorldSnapshotAt: row.lastWorldSnapshotAt };
}

function finitePose(position: IncomingPose["position"], rotationY?: number, rotationPitch?: number): void {
  for (const value of [position.x, position.z, position.y ?? 0, rotationY ?? 0, rotationPitch ?? 0]) {
    if (!Number.isFinite(value)) throw new RangeError("Presence pose must be finite");
  }
}

/** Indexed presence storage for hosts that own authentication, bot ownership and spawn policy.
 * @capability world-presence-store indexed neighborhood presence with pose throttling and physical expiry
 * Call only after resolving the actor and their world access; browser arguments are not trusted identities.
 */
export function createWorldPresenceStore(options: WorldPresenceOptions = {}) {
  const size = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const rules = options.rules ?? DEFAULT_POSE_SYNC_RULES;
  const idle = options.idleTimeoutMs ?? 240_000;
  const revokedTtl = options.revokedTtlMs ?? 600_000;
  const snapshotInterval = options.snapshotIntervalMs ?? 30_000;
  if (!Number.isFinite(size) || size <= 0 || !Number.isFinite(idle) || idle < 1 ||
      !Number.isFinite(revokedTtl) || revokedTtl < 0 || !Number.isFinite(snapshotInterval) || snapshotInterval < 0) throw new RangeError("Invalid world presence policy");

  async function active(ctx: ReadContext, actorExternalId: string, serverId?: string): Promise<WorldPresenceRecord | null> {
    const rows = serverId === undefined
      ? await ctx.db.query("jgPoses").withIndex("by_user", q => q.eq("userId", actorExternalId)).take(32)
      : await ctx.db.query("jgPoses").withIndex("by_server_and_user", q => q.eq("serverId", serverId).eq("userId", actorExternalId)).take(32);
    const live = rows.filter(row => row.revokedAt === undefined).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    return live ? record(live) : null;
  }

  return {
    active,
    async ensure(ctx: JGMutationCtx, args: {
      serverId: string; actorExternalId: string; homeGameId: string; kind: string;
      position: PresencePosition; presenceId?: string; label?: string; ownerActorId?: string;
    }, nowMs = Date.now()): Promise<WorldPresenceRecord> {
      finitePose(args.position);
      const rows = await ctx.db.query("jgPoses").withIndex("by_server_and_user", q => q.eq("serverId", args.serverId).eq("userId", args.actorExternalId)).take(32);
      const existing = rows.filter(row => row.revokedAt === undefined).sort((a, b) => b.updatedAt - a.updatedAt)[0];
      for (const row of rows) if (row._id !== existing?._id) await ctx.db.delete(row._id);
      const patch = { serverId: args.serverId, userId: args.actorExternalId, sessionId: args.presenceId ?? args.actorExternalId,
        homeGameId: args.homeGameId, kind: args.kind, ownerActorId: args.ownerActorId,
        label: args.label ?? existing?.label, x: args.position.x, y: args.position.y, z: args.position.z,
        rotationY: 0, rotationPitch: 0, chunkKey: chunkKeyAt([args.position.x, args.position.y, args.position.z], size),
        updatedAt: nowMs, revokedAt: undefined };
      const id = existing ? existing._id : await ctx.db.insert("jgPoses", patch);
      if (existing) await ctx.db.patch(id, patch);
      return record((await ctx.db.get("jgPoses", id))!);
    },
    async sync(ctx: JGMutationCtx, presence: WorldPresenceRecord, incoming?: IncomingPose, args: {
      nowMs?: number; rules?: PoseSyncRules; onSnapshot?: PresenceSnapshotWriter;
    } = {}): Promise<WorldPresenceRecord> {
      const nowMs = args.nowMs ?? Date.now();
      if (incoming) finitePose(incoming.position, incoming.rotationY, incoming.rotationPitch);
      const current = await ctx.db.get("jgPoses", presence._id);
      if (!current || current.revokedAt !== undefined) return presence;
      const currentRecord = record(current);
      const decision = decidePoseSync({ position: currentRecord.position, rotationY: current.rotationY,
        rotationPitch: current.rotationPitch, lastSeenAtMs: current.updatedAt }, incoming ?? { position: currentRecord.position }, args.rules ?? rules, nowMs);
      const next = { ...currentRecord, position: decision.position, rotationY: decision.rotationY, rotationPitch: decision.rotationPitch };
      const patch: Partial<PoseRow> = {};
      if (decision.changed) Object.assign(patch, { x: next.position.x, y: next.position.y, z: next.position.z,
        chunkKey: chunkKeyAt([next.position.x, next.position.y, next.position.z], size), rotationY: next.rotationY, rotationPitch: next.rotationPitch });
      if (decision.changed || decision.refreshKeepAlive) { patch.updatedAt = nowMs; next.lastSeenAt = nowMs; }
      if (args.onSnapshot && shouldPersistWorldSnapshot(current.lastWorldSnapshotAt, nowMs, snapshotInterval)) {
        await args.onSnapshot(next, nowMs);
        patch.lastWorldSnapshotAt = nowMs; next.lastWorldSnapshotAt = nowMs;
      }
      if (Object.keys(patch).length) await ctx.db.patch(current._id, patch);
      return next;
    },
    async revoke(ctx: JGMutationCtx, presence: WorldPresenceRecord, onSnapshot?: PresenceSnapshotWriter, nowMs = Date.now()): Promise<void> {
      const row = await ctx.db.get("jgPoses", presence._id);
      if (!row || row.revokedAt !== undefined) return;
      if (onSnapshot) await onSnapshot(record(row), nowMs);
      await ctx.db.patch(row._id, { revokedAt: nowMs, updatedAt: nowMs });
    },
    async nearby(ctx: ReadContext, serverId: string, viewerChunkKey = "0,0", args: { rings?: number; limit?: number } = {}): Promise<WorldPresenceRecord[]> {
      const coord = parseChunkKey(viewerChunkKey);
      if (!coord) return [];
      const requestedLimit = args.limit ?? 500;
      if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1) throw new RangeError("Invalid presence limit");
      const limit = Math.min(1000, requestedLimit);
      const rows: WorldPresenceRecord[] = [];
      for (const chunkKey of chunkKeysAround([coord.cx * size, 0, coord.cz * size], args.rings ?? 1, size)) {
        const chunk = await ctx.db.query("jgPoses").withIndex("by_server_and_chunk", q => q.eq("serverId", serverId).eq("chunkKey", chunkKey)).take(limit - rows.length);
        rows.push(...chunk.filter(row => row.revokedAt === undefined).map(record));
        if (rows.length >= limit) break;
      }
      return rows;
    },
    async reap(ctx: JGMutationCtx, args: { nowMs?: number; batchSize?: number; onSnapshot?: PresenceSnapshotWriter } = {}): Promise<{ reaped: number; deleted: number }> {
      const nowMs = args.nowMs ?? Date.now();
      const requestedBatch = args.batchSize ?? 200;
      if (!Number.isFinite(nowMs) || !Number.isSafeInteger(requestedBatch) || requestedBatch < 1) throw new RangeError("Invalid presence reaper batch");
      const batchSize = Math.min(500, requestedBatch);
      const rows = await ctx.db.query("jgPoses").withIndex("by_revoked_updated", q => q.eq("revokedAt", undefined).lt("updatedAt", nowMs - idle)).take(batchSize);
      let reaped = 0;
      for (const row of rows) {
        if (args.onSnapshot) await args.onSnapshot(record(row), nowMs);
        await ctx.db.delete(row._id); reaped++;
      }
      const revoked = await ctx.db.query("jgPoses").withIndex("by_revoked", q => q.gte("revokedAt", 0).lte("revokedAt", nowMs - revokedTtl)).take(batchSize - reaped);
      for (const row of revoked) await ctx.db.delete(row._id);
      return { reaped, deleted: reaped + revoked.length };
    },
  };
}
