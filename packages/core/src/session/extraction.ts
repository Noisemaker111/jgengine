import {
  createDeliveryQueue,
  insureLost,
  partitionOnDeath,
  resolveConsolation,
  type ConsolationPolicy,
  type ContainerSnapshot,
  type DeliveryEntry,
  type DeliveryQueue,
  type InsurancePolicy,
  type ItemStack,
} from "../inventory/storageTier";
import {
  createContestedChannel,
  type ContestedChannel,
  type ContestedEvent,
} from "./contestedChannel";
import type { RingPoint } from "./ring";

export interface ExtractPoint {
  id: string;
  center: RingPoint;
  radius: number;
  holdSeconds: number;
  favorability?: Record<string, number>;
  interruptOnDamage?: boolean;
}

export interface RaidSessionConfig {
  extracts: readonly ExtractPoint[];
  insurance?: InsurancePolicy;
  consolation?: ConsolationPolicy;
}

export type RaidStatus = "in-raid" | "extracting" | "extracted" | "dead";

export interface ExtractionAttempt {
  extractId: string;
  channel: ContestedChannel;
}

export interface ExtractionResult {
  userId: string;
  extractId: string;
  banked: readonly ItemStack[];
}

export interface DeathResult {
  userId: string;
  kept: readonly ItemStack[];
  lost: readonly ItemStack[];
  scheduled: DeliveryEntry | null;
  consolationLoadoutId: string | null;
}

export interface RaidPlayerSnapshot {
  status: RaidStatus;
  extractId: string | null;
  progress: number;
  remaining: number;
}

export interface RaidSession {
  beginExtract(
    userId: string,
    extractId: string,
    position: RingPoint,
    team?: string,
  ): ContestedEvent | null;
  tickExtract(userId: string, dt: number, occupants?: Record<string, number>): ContestedEvent[];
  damage(userId: string, reason?: string): ContestedEvent | null;
  cancelExtract(userId: string): void;
  resolveExtraction(
    userId: string,
    containers: readonly ContainerSnapshot[],
  ): ExtractionResult | null;
  resolveDeath(
    userId: string,
    containers: readonly ContainerSnapshot[],
    now: number,
    rng?: () => number,
  ): DeathResult;
  claimDeliveries(now: number): readonly DeliveryEntry[];
  pendingDeliveries(userId?: string): readonly DeliveryEntry[];
  deliveries(): DeliveryQueue;
  extractPoint(extractId: string): ExtractPoint | undefined;
  status(userId: string): RaidStatus;
  playerSnapshot(userId: string): RaidPlayerSnapshot;
}

function inExtractZone(point: ExtractPoint, position: RingPoint): boolean {
  const dx = position[0] - point.center[0];
  const dz = position[1] - point.center[1];
  return dx * dx + dz * dz <= point.radius * point.radius;
}

function mergeAll(containers: readonly ContainerSnapshot[]): ItemStack[] {
  const totals = new Map<string, number>();
  for (const container of containers) {
    for (const stack of container.items) {
      totals.set(stack.itemId, (totals.get(stack.itemId) ?? 0) + stack.count);
    }
  }
  const out: ItemStack[] = [];
  for (const [itemId, count] of totals) if (count > 0) out.push({ itemId, count });
  return out;
}

export function createRaidSession(config: RaidSessionConfig): RaidSession {
  const points = new Map<string, ExtractPoint>();
  for (const point of config.extracts) points.set(point.id, point);
  const attempts = new Map<string, ExtractionAttempt>();
  const statuses = new Map<string, RaidStatus>();
  const queue = createDeliveryQueue();

  function statusOf(userId: string): RaidStatus {
    return statuses.get(userId) ?? "in-raid";
  }

  return {
    beginExtract(userId, extractId, position, team) {
      const point = points.get(extractId);
      if (point === undefined) return null;
      if (statusOf(userId) === "extracted" || statusOf(userId) === "dead") return null;
      if (!inExtractZone(point, position)) return null;
      const channel = createContestedChannel({
        duration: point.holdSeconds,
        interruptOnDamage: point.interruptOnDamage ?? true,
        favorability: point.favorability,
      });
      const event = channel.start(team ?? userId);
      attempts.set(userId, { extractId, channel });
      statuses.set(userId, "extracting");
      return event;
    },
    tickExtract(userId, dt, occupants) {
      const attempt = attempts.get(userId);
      if (attempt === undefined) return [];
      const events = attempt.channel.tick(dt, occupants);
      if (attempt.channel.phase() === "complete") statuses.set(userId, "extracted");
      return events;
    },
    damage(userId, reason) {
      const attempt = attempts.get(userId);
      if (attempt === undefined) return null;
      const event = attempt.channel.damage(reason);
      if (attempt.channel.phase() === "interrupted") statuses.set(userId, "in-raid");
      return event;
    },
    cancelExtract(userId) {
      attempts.delete(userId);
      if (statusOf(userId) === "extracting") statuses.set(userId, "in-raid");
    },
    resolveExtraction(userId, containers) {
      const attempt = attempts.get(userId);
      if (attempt === undefined) return null;
      if (attempt.channel.phase() !== "complete" && statusOf(userId) !== "extracted") return null;
      const extractId = attempt.extractId;
      attempts.delete(userId);
      statuses.set(userId, "extracted");
      return { userId, extractId, banked: mergeAll(containers) };
    },
    resolveDeath(userId, containers, now, rng) {
      attempts.delete(userId);
      statuses.set(userId, "dead");
      const partition = partitionOnDeath(containers);
      let scheduled: DeliveryEntry | null = null;
      if (config.insurance !== undefined) {
        const insured = insureLost(partition.lost, config.insurance, userId, now, rng);
        if (insured !== null) scheduled = queue.schedule(insured);
      }
      const consolation =
        config.consolation !== undefined ? resolveConsolation(config.consolation, partition) : null;
      return {
        userId,
        kept: partition.kept,
        lost: partition.lost,
        scheduled,
        consolationLoadoutId: consolation?.loadoutId ?? null,
      };
    },
    claimDeliveries: (now) => queue.claimDue(now),
    pendingDeliveries: (userId) => queue.pending(userId),
    deliveries: () => queue,
    extractPoint: (extractId) => points.get(extractId),
    status: statusOf,
    playerSnapshot: (userId) => {
      const attempt = attempts.get(userId);
      const channel = attempt?.channel;
      return {
        status: statusOf(userId),
        extractId: attempt?.extractId ?? null,
        progress: channel?.progress() ?? 0,
        remaining: channel?.remaining() ?? 0,
      };
    },
  };
}
