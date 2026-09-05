import type { GameRuntimeSnapshot } from "../runtime/snapshot";
import { chunkKeyAt, updateChunk } from "../runtime/worldChunks";
import type { Aabb } from "./geometry";

/** Integer cell coordinates used for ownership on the ground plane. */
export type TerritoryCell = { x: number; z: number };
/** Cell size, foreign-owner gap, growth price, currency and starter-grant policy. */
export type TerritoryPolicy = {
  gapCells?: number;
  cellSize?: number;
  chunkSize?: number;
  currency?: string;
  price?: (ownedCount: number) => number;
  starterBlock?: number;
  nowMs?: number;
};
/** Atomic claim outcome with the replacement snapshot and total charge. */
export type TerritoryResult = { ok: true; snapshot: GameRuntimeSnapshot; cost: number } | { ok: false; reason: "territory.blocked" | "territory.unaffordable" };
/** Read-only footprint quote or a blocked/insufficient-balance rejection. */
export type TerritoryPlan = { ok: true; cells: TerritoryCell[]; cost: number } | { ok: false; reason: "territory.blocked" | "territory.unaffordable" };
/** Host-owned snapshot access used by the territory facade. */
export interface TerritoryStorage { get(): GameRuntimeSnapshot; set(snapshot: GameRuntimeSnapshot): void }

function checked(policy: TerritoryPolicy): Required<Pick<TerritoryPolicy, "gapCells" | "cellSize" | "chunkSize">> {
  if (policy.nowMs !== undefined && !Number.isFinite(policy.nowMs)) throw new RangeError("Invalid territory timestamp");
  const gapCells = policy.gapCells ?? 0, cellSize = policy.cellSize ?? 1, chunkSize = policy.chunkSize ?? 64;
  if (!Number.isSafeInteger(gapCells) || gapCells < 0 || gapCells > 128 || !Number.isFinite(cellSize) || cellSize <= 0 || !Number.isFinite(chunkSize) || chunkSize <= 0) throw new RangeError("Invalid territory policy");
  return { gapCells, cellSize, chunkSize };
}
function key(cell: TerritoryCell): string {
  if (!Number.isSafeInteger(cell.x) || !Number.isSafeInteger(cell.z)) throw new RangeError("Invalid territory cell");
  return `${cell.x},${cell.z}`;
}
/**
 * Persisted chunk key containing one territory cell.
 * @capability territory-cell-chunk Map ownership cells to persisted world chunks.
 */
export function territoryChunkKey(cell: TerritoryCell, policy: TerritoryPolicy = {}): string {
  key(cell);
  const { cellSize, chunkSize } = checked(policy);
  return chunkKeyAt([cell.x * cellSize, 0, cell.z * cellSize], chunkSize);
}
/**
 * Exact chunks needed to validate a footprint and its foreign-owner gap.
 * @capability territory-read-scope Load the footprint and foreign-owner gap without scanning the world.
 */
export function territoryChunkKeys(cells: readonly TerritoryCell[], policy: TerritoryPolicy = {}): string[] {
  const { gapCells } = checked(policy);
  const chunks = new Set<string>();
  if (cells.length * (2 * gapCells + 1) ** 2 > 1_000_000) throw new RangeError("Territory neighborhood is too large");
  for (const cell of cells) {
    key(cell);
    for (let x = cell.x - gapCells; x <= cell.x + gapCells; x++) {
      for (let z = cell.z - gapCells; z <= cell.z + gapCells; z++) chunks.add(territoryChunkKey({ x, z }, policy));
    }
  }
  return [...chunks];
}
/**
 * Owner of a loaded cell; hosts load the target and gap neighborhood before evaluating claims.
 * @capability territory-owner-query Read a loaded land cell owner for authoritative placement checks.
 */
export function territoryOwnerOf(snapshot: GameRuntimeSnapshot, cell: TerritoryCell, policy: TerritoryPolicy = {}): string | null {
  return snapshot.chunks[territoryChunkKey(cell, policy)]?.territory?.[key(cell)] ?? null;
}
/**
 * Cells touched by a placement, excluding cells that only touch its outer edge.
 * @capability territory-footprint Resolve exactly the ownership cells touched by a placement footprint.
 */
export function territoryFootprintCells(bounds: Aabb, cellSize = 1): TerritoryCell[] {
  if (!Number.isFinite(cellSize) || cellSize <= 0 || !Object.values(bounds).every(Number.isFinite) || bounds.maxX <= bounds.minX || bounds.maxZ <= bounds.minZ) throw new RangeError("Invalid territory footprint");
  const cells: TerritoryCell[] = [];
  const minX = Math.floor(bounds.minX / cellSize), maxX = Math.ceil(bounds.maxX / cellSize) - 1;
  const minZ = Math.floor(bounds.minZ / cellSize), maxZ = Math.ceil(bounds.maxZ / cellSize) - 1;
  if ((maxX - minX + 1) * (maxZ - minZ + 1) > 65536) throw new RangeError("Territory footprint is too large");
  for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) cells.push({ x, z });
  return cells;
}
/** Price and validate a footprint without mutating or charging; reuse for placement previews. */
export function planFootprintClaims(snapshot: GameRuntimeSnapshot, userId: string, footprint: readonly TerritoryCell[], policy: TerritoryPolicy = {}): TerritoryPlan {
  const { gapCells } = checked(policy);
  if (footprint.length * (2 * gapCells + 1) ** 2 > 1_000_000) throw new RangeError("Territory neighborhood is too large");
  const player = snapshot.players[userId];
  if (!player) return { ok: false, reason: "territory.blocked" };
  const cells: TerritoryCell[] = [], seen = new Set<string>();
  let cost = 0;
  const owned = Number(player.territoryOwnedCount ?? 0);
  if (!Number.isSafeInteger(owned) || owned < 0) throw new RangeError("Invalid territory owned count");
  for (const cell of footprint) {
    const cellKey = key(cell);
    if (seen.has(cellKey)) continue;
    seen.add(cellKey);
    const owner = territoryOwnerOf(snapshot, cell, policy);
    if (owner === userId) continue;
    if (owner !== null) return { ok: false, reason: "territory.blocked" };
    for (let x = cell.x - gapCells; x <= cell.x + gapCells; x++) for (let z = cell.z - gapCells; z <= cell.z + gapCells; z++) {
      const neighbor = territoryOwnerOf(snapshot, { x, z }, policy);
      if (neighbor !== null && neighbor !== userId) return { ok: false, reason: "territory.blocked" };
    }
    const price = policy.price?.(owned + cells.length) ?? 0;
    if (!Number.isFinite(price) || price < 0) throw new RangeError("Invalid territory price");
    cost += price;
    if (!Number.isFinite(cost)) throw new RangeError("Invalid territory cost");
    cells.push(cell);
  }
  if (cost > 0 && (!policy.currency || (player.economy[policy.currency] ?? 0) < cost)) return { ok: false, reason: "territory.unaffordable" };
  return { ok: true, cells, cost };
}
/** Atomically buy every unowned footprint cell, leaving the input untouched on failure. */
export function claimTerritory(snapshot: GameRuntimeSnapshot, userId: string, cells: readonly TerritoryCell[], policy: TerritoryPolicy = {}): TerritoryResult {
  const plan = planFootprintClaims(snapshot, userId, cells, policy);
  if (!plan.ok) return plan;
  let next = snapshot;
  for (const [index, cell] of plan.cells.entries()) next = updateChunk(next, territoryChunkKey(cell, policy), chunk => ({
    ...chunk,
    territory: { ...chunk.territory, [key(cell)]: userId },
    territoryReceipts: { ...chunk.territoryReceipts, [key(cell)]: { claimedAt: policy.nowMs ?? 0, costPaid: policy.price?.(Number(snapshot.players[userId]?.territoryOwnedCount ?? 0) + index) ?? 0 } },
  }));
  if (plan.cells.length === 0) return { ok: true, snapshot, cost: 0 };
  const player = snapshot.players[userId]!;
  next = { ...next, players: { ...next.players, [userId]: { ...player, territoryOwnedCount: Number(player.territoryOwnedCount ?? 0) + plan.cells.length, ownedTerritoryChunkKeys: [...new Set([...(player.ownedTerritoryChunkKeys ?? []), ...plan.cells.map(cell => territoryChunkKey(cell, policy))])], economy: policy.currency ? { ...player.economy, [policy.currency]: (player.economy[policy.currency] ?? 0) - plan.cost } : player.economy } }, dirty: { ...next.dirty, players: [...new Set([...next.dirty.players, userId])] } };
  return { ok: true, snapshot: next, cost: plan.cost };
}
/**
 * Placement transaction: rejected object placement also rolls back territory and its charge.
 * @capability territory-placement Purchase footprint cells atomically with object placement.
 */
export function placeWithTerritory(snapshot: GameRuntimeSnapshot, userId: string, bounds: Aabb, policy: TerritoryPolicy, place: (snapshot: GameRuntimeSnapshot) => { ok: true; snapshot: GameRuntimeSnapshot } | { ok: false; reason: string }): { ok: true; snapshot: GameRuntimeSnapshot; cost: number } | { ok: false; reason: string } {
  const claimed = claimTerritory(snapshot, userId, territoryFootprintCells(bounds, policy.cellSize), policy);
  if (!claimed.ok) return claimed;
  const placed = place(claimed.snapshot);
  return placed.ok ? { ...placed, cost: claimed.cost } : placed;
}
/**
 * Snapshot-backed territory facade with host-owned storage and live policy.
 * @capability territory-ownership Claim, release and query land through host-owned snapshot storage.
 */
export function createTerritory(storage: TerritoryStorage, policy: () => TerritoryPolicy = () => ({})) {
  return {
    snapshot: () => storage.get(),
    restore: (snapshot: GameRuntimeSnapshot) => storage.set(snapshot),
    ownerOf: (cell: TerritoryCell) => territoryOwnerOf(storage.get(), cell, policy()),
    canUse: (userId: string, cell: TerritoryCell) => territoryOwnerOf(storage.get(), cell, policy()) === userId,
    claim(userId: string, cells: readonly TerritoryCell[]): TerritoryResult {
      const result = claimTerritory(storage.get(), userId, cells, policy());
      if (result.ok) storage.set(result.snapshot);
      return result;
    },
    release(userId: string, cell: TerritoryCell): boolean {
      const snapshot = storage.get(), config = policy();
      if (territoryOwnerOf(snapshot, cell, config) !== userId || !snapshot.players[userId]) return false;
      let next = updateChunk(snapshot, territoryChunkKey(cell, config), chunk => {
        const territory = { ...chunk.territory }, territoryReceipts = { ...chunk.territoryReceipts }; delete territory[key(cell)]; delete territoryReceipts[key(cell)]; return { ...chunk, territory, territoryReceipts };
      });
      const player = next.players[userId]!;
      next = { ...next, players: { ...next.players, [userId]: { ...player, territoryOwnedCount: Math.max(0, Number(player.territoryOwnedCount ?? 0) - 1), ownedTerritoryChunkKeys: (player.ownedTerritoryChunkKeys ?? []).filter(chunkKey => chunkKey !== territoryChunkKey(cell, config) || Object.values(next.chunks[chunkKey]?.territory ?? {}).includes(userId)) } }, dirty: { ...next.dirty, players: [...new Set([...next.dirty.players, userId])] } };
      storage.set(next); return true;
    },
    grantStarter(userId: string, center: TerritoryCell): TerritoryResult {
      const config = policy(), width = config.starterBlock ?? 3;
      if (!Number.isSafeInteger(width) || width < 1 || width > 128) throw new RangeError("Invalid starter block");
      const snapshot = storage.get();
      if (Number(snapshot.players[userId]?.territoryOwnedCount ?? 0) > 0) return { ok: true, snapshot, cost: 0 };
      const startX = center.x - Math.floor(width / 2), startZ = center.z - Math.floor(width / 2);
      const cells = territoryFootprintCells({ minX: startX, minZ: startZ, maxX: startX + width, maxZ: startZ + width });
      const result = claimTerritory(snapshot, userId, cells, { ...config, price: () => 0 });
      if (result.ok) storage.set(result.snapshot);
      return result;
    },
  };
}
/** Snapshot-backed claim, release, owner and starter-grant operations. */
export type Territory = ReturnType<typeof createTerritory>;
