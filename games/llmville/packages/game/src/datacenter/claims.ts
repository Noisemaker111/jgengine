import { createEmptyPlayerRow, createRuntimeSnapshot, type GameRuntimeSnapshot } from "@jgengine/core/runtime/snapshot";
import { planFootprintClaims as planTerritory, territoryChunkKey, type TerritoryPolicy } from "@jgengine/core/world/territory";
import { CLAIM_GAP_CELLS, CELL_SIZE, cellKey, type CellCoord } from "@llmville/game/datacenter/grid";

export interface DatacenterClaim {
  cx: number;
  cz: number;
  ownerGameId: string;
  ownerName: string;
  ownerOwnedCellCount?: number;
  claimedAt?: number;
  costPaid?: number;
}

export const CLAIM_BASE_COST = 25;
export const CLAIM_COST_GROWTH = 1.04;

export function claimCost(ownedCellCount: number): number {
  return Math.round(CLAIM_BASE_COST * CLAIM_COST_GROWTH ** ownedCellCount);
}

export const CELL_RENT_PER_GAME_DAY = 2;

export function cellRentForCount(count: number): number {
  return count * CELL_RENT_PER_GAME_DAY;
}

export type ClaimRejection = "already_claimed" | "too_close_to_other_claim" | "insufficient_funds";

export const TERRITORY_POLICY: TerritoryPolicy = { cellSize: CELL_SIZE, chunkSize: 64, gapCells: CLAIM_GAP_CELLS, price: claimCost, currency: "money", starterBlock: 3 };

export function claimsSnapshot(claims: readonly DatacenterClaim[], userId: string, money: number): GameRuntimeSnapshot {
  const snapshot = createRuntimeSnapshot({ gameId: "llmville", serverId: "preview", players: { [userId]: { ...createEmptyPlayerRow(userId), economy: { money }, territoryOwnedCount: claims.find(claim => claim.ownerGameId === userId)?.ownerOwnedCellCount ?? claims.filter(claim => claim.ownerGameId === userId).length } } });
  for (const claim of claims) {
    const chunkKey = territoryChunkKey({ x: claim.cx, z: claim.cz }, TERRITORY_POLICY);
    const chunk = snapshot.chunks[chunkKey] ?? { chunkKey, objects: [], entities: [] };
    snapshot.chunks[chunkKey] = { ...chunk, territory: { ...chunk.territory, [cellKey(claim)]: claim.ownerGameId } };
  }
  return snapshot;
}

export function canClaimCell(args: {
  cell: CellCoord; ownerGameId: string; claims: readonly DatacenterClaim[]; money: number;
}): { ok: true; cost: number } | { ok: false; reason: ClaimRejection } {
  if (args.claims.some(claim => claim.cx === args.cell.cx && claim.cz === args.cell.cz)) return { ok: false, reason: "already_claimed" };
  const result = planFootprintClaims({ ...args, cells: [args.cell] });
  return result.ok ? { ok: true, cost: result.totalCost } : result;
}

export function isCellOwnedBy(
  claims: readonly DatacenterClaim[],
  cell: CellCoord,
  ownerGameId: string,
): boolean {
  return claims.some(
    (claim) => claim.cx === cell.cx && claim.cz === cell.cz && claim.ownerGameId === ownerGameId,
  );
}

export function claimedCellsFor(claims: readonly DatacenterClaim[], ownerGameId: string): CellCoord[] {
  return claims
    .filter((claim) => claim.ownerGameId === ownerGameId)
    .map((claim) => ({ cx: claim.cx, cz: claim.cz }));
}

export interface FootprintClaimPlan {
  ok: true;
  newCells: CellCoord[];
  totalCost: number;
}

export type FootprintClaimResult = FootprintClaimPlan | { ok: false; reason: ClaimRejection };

export function planFootprintClaims(args: {
  cells: readonly CellCoord[]; ownerGameId: string; claims: readonly DatacenterClaim[]; money: number;
}): FootprintClaimResult {
  const cells = [...args.cells].sort((a, b) => a.cx - b.cx || a.cz - b.cz);
  const result = planTerritory(claimsSnapshot(args.claims, args.ownerGameId, args.money), args.ownerGameId, cells.map(cell => ({ x: cell.cx, z: cell.cz })), TERRITORY_POLICY);
  if (result.ok) return { ok: true, newCells: result.cells.map(cell => ({ cx: cell.x, cz: cell.z })), totalCost: result.cost };
  if (result.reason === "territory.unaffordable") return { ok: false, reason: "insufficient_funds" };
  return { ok: false, reason: cells.some(cell => args.claims.some(claim => claim.cx === cell.cx && claim.cz === cell.cz && claim.ownerGameId !== args.ownerGameId)) ? "already_claimed" : "too_close_to_other_claim" };
}

export interface PlacementCellQuote {
  newCells: CellCoord[];
  totalCost: number;
}

export interface PlacementCellPolicy {
  canUse(cell: CellCoord): boolean;
  quote(cells: readonly CellCoord[]): PlacementCellQuote;
}

function emptyQuote(): PlacementCellQuote {
  return { newCells: [], totalCost: 0 };
}

export function createPlacementCellPolicy(
  claims: readonly DatacenterClaim[],
  ownerGameId: string,
): PlacementCellPolicy {
  const plan = (cells: readonly CellCoord[]): FootprintClaimResult =>
    planFootprintClaims({ cells, ownerGameId, claims, money: Number.POSITIVE_INFINITY });
  return {
    canUse: (cell) => plan([cell]).ok,
    quote: (cells) => {
      const result = plan(cells);
      return result.ok ? { newCells: result.newCells, totalCost: result.totalCost } : emptyQuote();
    },
  };
}

export function ownedCellsPolicy(claimedCellKeys: ReadonlySet<string>): PlacementCellPolicy {
  return {
    canUse: (cell) => claimedCellKeys.has(cellKey(cell)),
    quote: emptyQuote,
  };
}
