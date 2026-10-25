import {
  CLAIM_GAP_CELLS,
  cellKey,
  parseCellKey,
  type CellCoord,
} from "@llmville/game/datacenter/grid";
import {
  canClaimCell,
  type ClaimRejection,
  type DatacenterClaim,
} from "@llmville/game/datacenter/claims";

export type CellMapStatus =
  | { kind: "own" }
  | { kind: "other"; ownerGameId: string; ownerName: string }
  | { kind: "blocked" }
  | { kind: "open" };

export interface ClaimMapIndex {
  claimByCell: ReadonlyMap<string, DatacenterClaim>;
  blockedCellKeys: ReadonlySet<string>;
  ownedCellCount: number;
}

export function buildClaimMapIndex(
  claims: readonly DatacenterClaim[],
  ownerGameId: string | null,
): ClaimMapIndex {
  const claimByCell = new Map<string, DatacenterClaim>();
  const blockedCellKeys = new Set<string>();
  let ownedCellCount = 0;
  for (const claim of claims) {
    claimByCell.set(cellKey(claim), claim);
    if (claim.ownerGameId === ownerGameId) {
      ownedCellCount++;
      continue;
    }
    for (let dx = -CLAIM_GAP_CELLS; dx <= CLAIM_GAP_CELLS; dx++) {
      for (let dz = -CLAIM_GAP_CELLS; dz <= CLAIM_GAP_CELLS; dz++) {
        blockedCellKeys.add(cellKey({ cx: claim.cx + dx, cz: claim.cz + dz }));
      }
    }
  }
  for (const key of claimByCell.keys()) blockedCellKeys.delete(key);
  return { claimByCell, blockedCellKeys, ownedCellCount };
}

export function cellMapStatus(
  index: ClaimMapIndex,
  cell: CellCoord,
  ownerGameId: string | null,
): CellMapStatus {
  const key = cellKey(cell);
  const claim = index.claimByCell.get(key);
  if (claim !== undefined) {
    if (claim.ownerGameId === ownerGameId) return { kind: "own" };
    return { kind: "other", ownerGameId: claim.ownerGameId, ownerName: claim.ownerName };
  }
  if (index.blockedCellKeys.has(key)) return { kind: "blocked" };
  return { kind: "open" };
}

export function cellsInRect(a: CellCoord, b: CellCoord): CellCoord[] {
  const minCx = Math.min(a.cx, b.cx);
  const maxCx = Math.max(a.cx, b.cx);
  const minCz = Math.min(a.cz, b.cz);
  const maxCz = Math.max(a.cz, b.cz);
  const cells: CellCoord[] = [];
  for (let cz = minCz; cz <= maxCz; cz++) {
    for (let cx = minCx; cx <= maxCx; cx++) {
      cells.push({ cx, cz });
    }
  }
  return cells;
}

export interface ClaimRunStep {
  cell: CellCoord;
  cost: number;
  ok: boolean;
  reason?: ClaimRejection;
}

export interface ClaimRunPlan {
  steps: readonly ClaimRunStep[];
  claimable: readonly CellCoord[];
  totalCost: number;
  blockingReason: ClaimRejection | null;
}

export function planClaimRun(args: {
  cells: readonly CellCoord[];
  ownerGameId: string;
  claims: readonly DatacenterClaim[];
  money: number;
  ownerName?: string;
}): ClaimRunPlan {
  const working = [...args.claims];
  const steps: ClaimRunStep[] = [];
  const claimable: CellCoord[] = [];
  let money = args.money;
  let totalCost = 0;
  let blockingReason: ClaimRejection | null = null;
  for (const cell of args.cells) {
    const decision = canClaimCell({
      cell,
      ownerGameId: args.ownerGameId,
      claims: working,
      money,
    });
    if (!decision.ok) {
      steps.push({ cell, cost: 0, ok: false, reason: decision.reason });
      blockingReason ??= decision.reason;
      continue;
    }
    steps.push({ cell, cost: decision.cost, ok: true });
    claimable.push(cell);
    totalCost += decision.cost;
    money -= decision.cost;
    const nextOwnedCount = (working.find(claim => claim.ownerGameId === args.ownerGameId)?.ownerOwnedCellCount ?? working.filter(claim => claim.ownerGameId === args.ownerGameId).length) + 1;
    for (let index = 0; index < working.length; index++) {
      const claim = working[index]!;
      if (claim.ownerGameId === args.ownerGameId) working[index] = { ...claim, ownerOwnedCellCount: nextOwnedCount };
    }
    working.push({
      ownerOwnedCellCount: nextOwnedCount,
      cx: cell.cx,
      cz: cell.cz,
      ownerGameId: args.ownerGameId,
      ownerName: args.ownerName ?? "",
    });
  }
  return { steps, claimable, totalCost, blockingReason };
}

export function contiguousCellBlocks(cells: readonly CellCoord[]): CellCoord[][] {
  const remaining = new Set(cells.map((cell) => cellKey(cell)));
  const blocks: CellCoord[][] = [];
  for (const start of remaining) {
    if (!remaining.has(start)) continue;
    const block: CellCoord[] = [];
    const stack = [start];
    remaining.delete(start);
    while (stack.length > 0) {
      const key = stack.pop() as string;
      const cell = parseCellKey(key);
      block.push(cell);
      const neighbours = [
        { cx: cell.cx + 1, cz: cell.cz },
        { cx: cell.cx - 1, cz: cell.cz },
        { cx: cell.cx, cz: cell.cz + 1 },
        { cx: cell.cx, cz: cell.cz - 1 },
      ];
      for (const neighbour of neighbours) {
        const neighbourKey = cellKey(neighbour);
        if (!remaining.has(neighbourKey)) continue;
        remaining.delete(neighbourKey);
        stack.push(neighbourKey);
      }
    }
    blocks.push(block);
  }
  return blocks;
}

export type CellEdgeSide = "north" | "south" | "east" | "west";

export interface CellEdge extends CellCoord {
  side: CellEdgeSide;
}

const EDGE_NEIGHBOURS: readonly { side: CellEdgeSide; dx: number; dz: number }[] = [
  { side: "north", dx: 0, dz: -1 },
  { side: "south", dx: 0, dz: 1 },
  { side: "west", dx: -1, dz: 0 },
  { side: "east", dx: 1, dz: 0 },
];

export function cellBlockEdges(cells: readonly CellCoord[]): CellEdge[] {
  const present = new Set(cells.map((cell) => cellKey(cell)));
  const edges: CellEdge[] = [];
  for (const cell of cells) {
    for (const neighbour of EDGE_NEIGHBOURS) {
      const key = cellKey({ cx: cell.cx + neighbour.dx, cz: cell.cz + neighbour.dz });
      if (present.has(key)) continue;
      edges.push({ cx: cell.cx, cz: cell.cz, side: neighbour.side });
    }
  }
  return edges;
}

export function cellBlockCentroid(cells: readonly CellCoord[]): CellCoord {
  if (cells.length === 0) return { cx: 0, cz: 0 };
  let sumCx = 0;
  let sumCz = 0;
  for (const cell of cells) {
    sumCx += cell.cx;
    sumCz += cell.cz;
  }
  return { cx: sumCx / cells.length, cz: sumCz / cells.length };
}
