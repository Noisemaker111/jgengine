import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cva } from "class-variance-authority";
import { useQuery } from "convex/react";
import { api } from "@llmville/backend/convex/_generated/api";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { InsetSection } from "@/components/ui/inset-section";
import { Token } from "@/components/ui/token";
import type { GameEngine } from "@/runtime/gameEngine";
import { readPlayerPosition, subscribePlayerPosition } from "@/runtime/playerPosition";
import { claimCost, type ClaimRejection, type DatacenterClaim } from "@llmville/game/datacenter/claims";
import {
  buildClaimMapIndex,
  cellBlockCentroid,
  cellBlockEdges,
  cellMapStatus,
  cellsInRect,
  contiguousCellBlocks,
  planClaimRun,
  type CellEdge,
} from "@llmville/game/datacenter/claimMap";
import { parseCellKey, worldToCell, type CellCoord } from "@llmville/game/datacenter/grid";
import {
  DATACENTER_COLUMN_SPACING_CELLS,
  DATACENTER_FLOOR_TILE_CELLS,
  isStructuralColumnCell,
} from "@llmville/game/datacenter/layout";

interface MapAppProps {
  money: number;
  canEditGame: boolean;
  localGameId: string;
  claims: readonly DatacenterClaim[];
  engine: GameEngine;
  onClaimCell: (cell: CellCoord) => Promise<{ claimed: boolean; reason?: string }>;
}

type MapMode = "pan" | "claim";

const REJECTION_LABEL: Record<ClaimRejection, string> = {
  already_claimed: "Already claimed",
  too_close_to_other_claim: "Inside a 4-cell walkway around another lab",
  insufficient_funds: "Not enough money",
};

const MIN_CELL_PX = 6;
const MAX_CELL_PX = 44;
const DEFAULT_CELL_PX = 18;
const CLICK_SLOP_PX = 4;
const OWNER_LABEL_MIN_CELL_PX = 12;
const GRID_LINE_MIN_CELL_PX = 9;

const COLOR = {
  floor: "#141d1c",
  grid: "#22302d",
  seam: "#2e403c",
  column: "#3a444b",
  own: "#5fc2a8",
  other: "#e0a95c",
  blocked: "#e8836b",
  player: "#f4ecdd",
} as const;

const mapControlButtonClass = cva(
  "pointer-events-auto h-8 min-w-8 rounded-md border border-brand-cream/15 bg-brand-ink/80 px-2 text-xs font-bold text-brand-cream/80 backdrop-blur transition-colors hover:border-brand-teal/60 hover:text-brand-cream",
  {
    variants: {
      active: {
        true: "border-brand-teal/70 bg-brand-teal/20 text-brand-cream",
        false: "",
      },
    },
    defaultVariants: { active: false },
  },
);

const verdictTextClass = cva("text-xs", {
  variants: {
    tone: {
      ok: "text-brand-teal",
      bad: "text-brand-coral",
      muted: "text-brand-cream/50",
    },
  },
  defaultVariants: { tone: "muted" },
});

interface ViewState {
  centerCx: number;
  centerCz: number;
  cellPx: number;
}

function cellsPath(cells: readonly CellCoord[], toX: (cx: number) => number, toY: (cz: number) => number, size: number): string {
  let path = "";
  for (const cell of cells) {
    path += `M${toX(cell.cx).toFixed(1)} ${toY(cell.cz).toFixed(1)}h${size.toFixed(1)}v${size.toFixed(1)}h${(-size).toFixed(1)}Z`;
  }
  return path;
}

function edgesPath(edges: readonly CellEdge[], toX: (cx: number) => number, toY: (cz: number) => number, size: number): string {
  let path = "";
  for (const edge of edges) {
    const x = toX(edge.cx);
    const y = toY(edge.cz);
    if (edge.side === "north") path += `M${x.toFixed(1)} ${y.toFixed(1)}h${size.toFixed(1)}`;
    else if (edge.side === "south") path += `M${x.toFixed(1)} ${(y + size).toFixed(1)}h${size.toFixed(1)}`;
    else if (edge.side === "west") path += `M${x.toFixed(1)} ${y.toFixed(1)}v${size.toFixed(1)}`;
    else path += `M${(x + size).toFixed(1)} ${y.toFixed(1)}v${size.toFixed(1)}`;
  }
  return path;
}

export function MapApp({ money, canEditGame, localGameId, claims, engine, onClaimCell }: MapAppProps) {
  const residents = useQuery(api.multiplayer.worldPresence.cityResidents, {});
  const [destinationId, setDestinationId] = useState("");
  const destination = residents?.find((resident) => resident.presenceId === destinationId);
  const destinationCell = destination ? worldToCell(destination.position.x, destination.position.z) : null;
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<ViewState>(() => {
    const start = worldToCell(readPlayerPosition(engine).x, readPlayerPosition(engine).z);
    return { centerCx: start.cx + 0.5, centerCz: start.cz + 0.5, cellPx: DEFAULT_CELL_PX };
  });
  const [mode, setMode] = useState<MapMode>("pan");
  const [playerCell, setPlayerCell] = useState<CellCoord>(() => {
    const position = readPlayerPosition(engine);
    return worldToCell(position.x, position.z);
  });
  const [hoveredCell, setHoveredCell] = useState<CellCoord | null>(null);
  const [selection, setSelection] = useState<{ from: CellCoord; to: CellCoord } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; moved: boolean } | null>(null);

  useEffect(() => {
    return subscribePlayerPosition(engine, (position) => {
      const cell = worldToCell(position.x, position.z);
      setPlayerCell((previous) => (previous.cx === cell.cx && previous.cz === cell.cz ? previous : cell));
    });
  }, [engine]);

  useEffect(() => {
    const element = surfaceRef.current;
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry === undefined) return;
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    setSize({ width: element.clientWidth, height: element.clientHeight });
    return () => observer.disconnect();
  }, []);

  const zoomBy = useCallback((factor: number) => {
    setView((previous) => ({
      ...previous,
      cellPx: Math.min(MAX_CELL_PX, Math.max(MIN_CELL_PX, previous.cellPx * factor)),
    }));
  }, []);

  useEffect(() => {
    const element = surfaceRef.current;
    if (element === null) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  const recenter = useCallback(() => {
    setView((previous) => ({ ...previous, centerCx: playerCell.cx + 0.5, centerCz: playerCell.cz + 0.5 }));
  }, [playerCell.cx, playerCell.cz]);

  const index = useMemo(() => buildClaimMapIndex(claims, localGameId), [claims, localGameId]);
  const nextCellCost = claimCost(index.ownedCellCount);

  const toX = useCallback(
    (cx: number) => (cx - view.centerCx) * view.cellPx + size.width / 2,
    [view.centerCx, view.cellPx, size.width],
  );
  const toY = useCallback(
    (cz: number) => (cz - view.centerCz) * view.cellPx + size.height / 2,
    [view.centerCz, view.cellPx, size.height],
  );
  const pointToCell = useCallback(
    (clientX: number, clientY: number): CellCoord | null => {
      const element = surfaceRef.current;
      if (element === null) return null;
      const rect = element.getBoundingClientRect();
      return {
        cx: Math.floor(view.centerCx + (clientX - rect.left - rect.width / 2) / view.cellPx),
        cz: Math.floor(view.centerCz + (clientY - rect.top - rect.height / 2) / view.cellPx),
      };
    },
    [view.centerCx, view.centerCz, view.cellPx],
  );

  const bounds = useMemo(() => {
    const halfCellsX = size.width / 2 / view.cellPx + 1;
    const halfCellsZ = size.height / 2 / view.cellPx + 1;
    return {
      minCx: Math.floor(view.centerCx - halfCellsX),
      maxCx: Math.ceil(view.centerCx + halfCellsX),
      minCz: Math.floor(view.centerCz - halfCellsZ),
      maxCz: Math.ceil(view.centerCz + halfCellsZ),
    };
  }, [size.width, size.height, view.centerCx, view.centerCz, view.cellPx]);

  const inView = useCallback(
    (cell: CellCoord) =>
      cell.cx >= bounds.minCx && cell.cx <= bounds.maxCx && cell.cz >= bounds.minCz && cell.cz <= bounds.maxCz,
    [bounds],
  );

  const geometry = useMemo(() => {
    const own: CellCoord[] = [];
    const foreignByOwner = new Map<string, { name: string; cells: CellCoord[] }>();
    for (const claim of claims) {
      if (!inView(claim)) continue;
      if (claim.ownerGameId === localGameId) {
        own.push({ cx: claim.cx, cz: claim.cz });
        continue;
      }
      const bucket = foreignByOwner.get(claim.ownerGameId) ?? { name: claim.ownerName, cells: [] };
      bucket.cells.push({ cx: claim.cx, cz: claim.cz });
      foreignByOwner.set(claim.ownerGameId, bucket);
    }
    const blocked: CellCoord[] = [];
    for (const key of index.blockedCellKeys) {
      const cell = parseCellKey(key);
      if (inView(cell)) blocked.push(cell);
    }
    const columns: CellCoord[] = [];
    const step = DATACENTER_COLUMN_SPACING_CELLS;
    const firstCx = Math.ceil(bounds.minCx / step) * step;
    const firstCz = Math.ceil(bounds.minCz / step) * step;
    for (let cx = firstCx; cx <= bounds.maxCx; cx += step) {
      for (let cz = firstCz; cz <= bounds.maxCz; cz += step) {
        const cell = { cx, cz };
        if (isStructuralColumnCell(cell)) columns.push(cell);
      }
    }
    const foreignCells: CellCoord[] = [];
    const foreignBlocks: { name: string; centroid: CellCoord }[] = [];
    const foreignEdges: CellEdge[] = [];
    for (const bucket of foreignByOwner.values()) {
      foreignCells.push(...bucket.cells);
      for (const block of contiguousCellBlocks(bucket.cells)) {
        foreignEdges.push(...cellBlockEdges(block));
        foreignBlocks.push({ name: bucket.name, centroid: cellBlockCentroid(block) });
      }
    }
    const ownEdges: CellEdge[] = [];
    for (const block of contiguousCellBlocks(own)) ownEdges.push(...cellBlockEdges(block));
    return { own, ownEdges, foreignCells, foreignEdges, foreignBlocks, blocked, columns };
  }, [claims, localGameId, index.blockedCellKeys, inView, bounds.minCx, bounds.minCz, bounds.maxCx, bounds.maxCz]);

  const selectedCells = useMemo(
    () => (selection === null ? [] : cellsInRect(selection.from, selection.to)),
    [selection],
  );

  const plan = useMemo(() => {
    const cells = selectedCells.length > 0 ? selectedCells : hoveredCell === null ? [] : [hoveredCell];
    if (cells.length === 0) return null;
    return planClaimRun({ cells, ownerGameId: localGameId, claims, money });
  }, [selectedCells, hoveredCell, localGameId, claims, money]);

  const hoveredStatus = hoveredCell === null ? null : cellMapStatus(index, hoveredCell, localGameId);

  const claimCells = useCallback(
    async (cells: readonly CellCoord[]) => {
      if (!canEditGame || cells.length === 0 || claiming) return;
      const runPlan = planClaimRun({ cells, ownerGameId: localGameId, claims, money });
      if (runPlan.claimable.length === 0) {
        setStatus(runPlan.blockingReason === null ? "Nothing to claim." : REJECTION_LABEL[runPlan.blockingReason]);
        return;
      }
      setClaiming(true);
      let claimed = 0;
      let spent = 0;
      let failure: string | null = null;
      for (const cell of runPlan.claimable) {
        const result = await onClaimCell(cell);
        if (!result.claimed) {
          const reason = result.reason as ClaimRejection | undefined;
          failure = reason === undefined ? "Claim failed." : REJECTION_LABEL[reason];
          break;
        }
        claimed += 1;
        spent += runPlan.steps.find((step) => step.cell.cx === cell.cx && step.cell.cz === cell.cz)?.cost ?? 0;
      }
      setClaiming(false);
      const claimedLabel = claimed === 0 ? "" : `Claimed ${claimed} cell${claimed === 1 ? "" : "s"} for $${spent.toLocaleString()}. `;
      setStatus(`${claimedLabel}${failure ?? ""}`.trim() || "Claim failed.");
    },
    [canEditGame, claiming, localGameId, claims, money, onClaimCell],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
    if (mode === "claim") {
      const cell = pointToCell(event.clientX, event.clientY);
      if (cell !== null) setSelection({ from: cell, to: cell });
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const cell = pointToCell(event.clientX, event.clientY);
    if (cell !== null) setHoveredCell(cell);
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientX - drag.startX) > CLICK_SLOP_PX || Math.abs(event.clientY - drag.startY) > CLICK_SLOP_PX) {
      drag.moved = true;
    }
    if (mode === "pan") {
      const dx = event.movementX / view.cellPx;
      const dz = event.movementY / view.cellPx;
      setView((previous) => ({ ...previous, centerCx: previous.centerCx - dx, centerCz: previous.centerCz - dz }));
      return;
    }
    if (cell !== null) setSelection((previous) => (previous === null ? null : { from: previous.from, to: cell }));
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (mode === "claim") {
      const cells = selection === null ? [] : cellsInRect(selection.from, selection.to);
      setSelection(null);
      void claimCells(cells);
      return;
    }
    if (drag.moved) return;
    const cell = pointToCell(event.clientX, event.clientY);
    if (cell !== null) void claimCells([cell]);
  };

  const cellPx = view.cellPx;
  const showGridLines = cellPx >= GRID_LINE_MIN_CELL_PX;
  const gridLines: { x1: number; y1: number; x2: number; y2: number; seam: boolean }[] = [];
  if (size.width > 0) {
    for (let cx = bounds.minCx; cx <= bounds.maxCx; cx++) {
      const seam = ((cx % DATACENTER_FLOOR_TILE_CELLS) + DATACENTER_FLOOR_TILE_CELLS) % DATACENTER_FLOOR_TILE_CELLS === 0;
      if (!seam && !showGridLines) continue;
      const x = toX(cx);
      gridLines.push({ x1: x, y1: 0, x2: x, y2: size.height, seam });
    }
    for (let cz = bounds.minCz; cz <= bounds.maxCz; cz++) {
      const seam = ((cz % DATACENTER_FLOOR_TILE_CELLS) + DATACENTER_FLOOR_TILE_CELLS) % DATACENTER_FLOOR_TILE_CELLS === 0;
      if (!seam && !showGridLines) continue;
      const y = toY(cz);
      gridLines.push({ x1: 0, y1: y, x2: size.width, y2: y, seam });
    }
  }

  const playerX = toX(playerCell.cx + 0.5);
  const playerY = toY(playerCell.cz + 0.5);

  const okCells = plan?.steps.filter((step) => step.ok).map((step) => step.cell) ?? [];
  const badCells = plan?.steps.filter((step) => !step.ok).map((step) => step.cell) ?? [];

  const verdict = (() => {
    if (plan === null) return { tone: "muted" as const, text: "Hover a cell to price it." };
    if (plan.claimable.length === 0) {
      return {
        tone: "bad" as const,
        text: plan.blockingReason === null ? "Nothing to claim." : REJECTION_LABEL[plan.blockingReason],
      };
    }
    const suffix = plan.blockingReason === null ? "" : ` — ${plan.steps.length - plan.claimable.length} skipped (${REJECTION_LABEL[plan.blockingReason]})`;
    return {
      tone: "ok" as const,
      text: `${plan.claimable.length} cell${plan.claimable.length === 1 ? "" : "s"} · $${plan.totalCost.toLocaleString()}${suffix}`,
    };
  })();

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <p className="text-sm font-bold text-brand-cream">Datacenter floor</p>
          <p className="text-xs text-brand-cream/50">
            {index.ownedCellCount} cell{index.ownedCellCount === 1 ? "" : "s"} · next ${nextCellCost.toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className={cn(mapControlButtonClass({ active: mode === "pan" }))} onClick={() => setMode("pan")}>
            Pan
          </button>
          <button type="button" className={cn(mapControlButtonClass({ active: mode === "claim" }))} onClick={() => setMode("claim")}>
            Drag-claim
          </button>
        </div>
      </div>

      <label className="flex flex-wrap items-center gap-2 text-xs text-brand-cream-dim">
        Visit a neighbor
        <select aria-label="Find a neighbor on the map" value={destinationId} className="min-w-0 flex-1 rounded-lg border border-white/15 bg-brand-ink p-2 text-brand-cream" onChange={(event) => {
          setDestinationId(event.target.value);
          const resident = residents?.find((entry) => entry.presenceId === event.target.value);
          if (!resident) return;
          const cell = worldToCell(resident.position.x, resident.position.z);
          setMode("pan");
          setView((previous) => ({ ...previous, centerCx: cell.cx + 0.5, centerCz: cell.cz + 0.5 }));
        }}>
          <option value="">Choose a lab</option>
          {residents?.filter((resident) => resident.gameId !== localGameId).map((resident) => <option key={resident.presenceId} value={resident.presenceId}>{resident.label ?? "Neighbor"}</option>)}
        </select>
      </label>
      {destinationCell && <p className="text-xs text-brand-teal">{destination?.label ?? "Neighbor"}: last saved cell ({destinationCell.cx}, {destinationCell.cz}). Walk there to visit their lab.</p>}
      <div
        ref={surfaceRef}
        className={cn(
          "relative min-h-0 flex-1 touch-none overflow-hidden rounded-lg border border-brand-cream/10 bg-brand-ink",
          mode === "pan" ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => setHoveredCell(null)}
      >
        <svg width={size.width} height={size.height} className="absolute inset-0 block">
          <defs>
            <pattern id="claim-map-blocked" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="8" height="8" fill={COLOR.blocked} fillOpacity="0.08" />
              <line x1="0" y1="0" x2="0" y2="8" stroke={COLOR.blocked} strokeOpacity="0.35" strokeWidth="2" />
            </pattern>
          </defs>
          <rect width={size.width} height={size.height} fill={COLOR.floor} />
          {gridLines.map((line, lineIndex) => (
            <line
              key={lineIndex}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={line.seam ? COLOR.seam : COLOR.grid}
              strokeWidth={line.seam ? 1.2 : 0.6}
            />
          ))}
          <path d={cellsPath(geometry.blocked, toX, toY, cellPx)} fill="url(#claim-map-blocked)" />
          <path d={cellsPath(geometry.columns, toX, toY, cellPx)} fill={COLOR.column} fillOpacity="0.9" />
          <path d={cellsPath(geometry.foreignCells, toX, toY, cellPx)} fill={COLOR.other} fillOpacity="0.22" />
          <path d={edgesPath(geometry.foreignEdges, toX, toY, cellPx)} stroke={COLOR.other} strokeWidth="1.8" fill="none" />
          <path d={cellsPath(geometry.own, toX, toY, cellPx)} fill={COLOR.own} fillOpacity="0.3" />
          <path d={edgesPath(geometry.ownEdges, toX, toY, cellPx)} stroke={COLOR.own} strokeWidth="2.2" fill="none" />
          <path d={cellsPath(okCells, toX, toY, cellPx)} fill={COLOR.own} fillOpacity="0.35" stroke={COLOR.own} strokeWidth="1.4" />
          <path d={cellsPath(badCells, toX, toY, cellPx)} fill={COLOR.blocked} fillOpacity="0.3" stroke={COLOR.blocked} strokeWidth="1.4" />
          {cellPx >= OWNER_LABEL_MIN_CELL_PX
            && geometry.foreignBlocks.map((block, blockIndex) => (
              <text
                key={blockIndex}
                x={toX(block.centroid.cx + 0.5)}
                y={toY(block.centroid.cz + 0.5)}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={COLOR.other}
                fontSize={10}
                opacity={0.9}
              >
                {block.name}
              </text>
            ))}
          {destinationCell && <g><circle cx={toX(destinationCell.cx + 0.5)} cy={toY(destinationCell.cz + 0.5)} r={8} fill="none" stroke="#e8836b" strokeWidth={3} /><text x={toX(destinationCell.cx + 0.5)} y={toY(destinationCell.cz + 0.5) - 14} textAnchor="middle" fill="#e8836b" fontSize={11}>Visit here</text></g>}
          <g>
            <circle cx={playerX} cy={playerY} r={Math.max(3, cellPx * 0.28)} fill={COLOR.player} />
            <circle cx={playerX} cy={playerY} r={Math.max(7, cellPx * 0.7)} fill="none" stroke={COLOR.player} strokeOpacity="0.4" />
          </g>
        </svg>

        <div className="pointer-events-none absolute right-2 bottom-2 flex flex-col items-end gap-1">
          <button type="button" className={cn(mapControlButtonClass())} onClick={() => zoomBy(1.25)} aria-label="Zoom in">
            +
          </button>
          <button type="button" className={cn(mapControlButtonClass())} onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">
            −
          </button>
          <button type="button" className={cn(mapControlButtonClass())} onClick={recenter}>
            Me
          </button>
        </div>
      </div>

      <InsetSection
        label={hoveredCell === null ? "Floor" : `Cell (${hoveredCell.cx}, ${hoveredCell.cz})`}
        trailing={
          hoveredStatus === null ? null : hoveredStatus.kind === "own" ? (
            <Token tone="teal">Yours</Token>
          ) : hoveredStatus.kind === "other" ? (
            <Token tone="amber">{hoveredStatus.ownerName}</Token>
          ) : hoveredStatus.kind === "blocked" ? (
            <Token tone="coral">Walkway</Token>
          ) : (
            <Token tone="teal">Open</Token>
          )
        }
      >
        <p className={cn(verdictTextClass({ tone: verdict.tone }))}>{verdict.text}</p>
        <p className="mt-1 text-[11px] text-brand-cream/45">
          {mode === "pan"
            ? "Drag to pan, scroll or +/− to zoom, click a cell to claim it."
            : "Drag a rectangle to claim a run — cells are bought one at a time and each one costs more."}
        </p>
        {status !== null && <p className="mt-1 text-xs text-brand-cream/70">{status}</p>}
        {!canEditGame && <p className="mt-1 text-xs text-brand-coral">You can only view this lab.</p>}
        {claiming && (
          <div className="mt-2">
            <Button disabled>Claiming…</Button>
          </div>
        )}
      </InsetSection>
    </div>
  );
}
