/** @jsxImportSource @jgengine/core/ui/jsx */
import { useCallback, useEffect, useMemo, useRef, useState } from "@jgengine/core/ui/jsx";
import { useQuery } from "convex/react";
import { api } from "@llmville/backend/convex/_generated/api";
import { RuneAction, RuneGlyph, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";

import { Button, C, FULL, Label, Muted, Panel, Row, Stack, Text } from "../../ui/kit";
import type { GameEngine } from "../../runtime/gameEngine";
import { readPlayerPosition, subscribePlayerPosition } from "../../runtime/playerPosition";
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

/** A city resident the map can point at. */
export interface MapResident { presenceId: string; gameId: string; label?: string | null | undefined; position: { x: number; z: number } }

export function MapApp(props: MapAppProps) {
  const residents = useQuery(api.multiplayer.worldPresence.cityResidents, {});
  return <MapAppView {...props} residents={residents} />;
}

/**
 * The datacenter floor: your cells, neighbours' labs, walkways and columns around you. Drag pans (or,
 * in drag-claim mode, marks a run); a tap claims the cell under it; +/−/Me zoom and recenter.
 */
export function MapAppView({ money, canEditGame, localGameId, claims, engine, onClaimCell, residents }: MapAppProps & { residents: readonly MapResident[] | undefined }) {
  const { width: viewportWidth } = useRuneViewport();
  const side = Math.max(200, Math.min(520, viewportWidth - 72));
  const size = { width: side, height: side };
  const [destinationId, setDestinationId] = useState("");
  const destination = residents?.find((resident) => resident.presenceId === destinationId);
  const destinationCell = destination ? worldToCell(destination.position.x, destination.position.z) : null;
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
  const dragRef = useRef<{ startX: number; startY: number; lastX: number; lastY: number; moved: boolean } | null>(null);

  useEffect(() => subscribePlayerPosition(engine, (position) => {
    const cell = worldToCell(position.x, position.z);
    setPlayerCell((previous) => (previous.cx === cell.cx && previous.cz === cell.cz ? previous : cell));
  }), [engine]);

  const zoomBy = useCallback((factor: number) => {
    setView((previous) => ({ ...previous, cellPx: Math.min(MAX_CELL_PX, Math.max(MIN_CELL_PX, previous.cellPx * factor)) }));
  }, []);
  const recenter = useCallback(() => {
    setView((previous) => ({ ...previous, centerCx: playerCell.cx + 0.5, centerCz: playerCell.cz + 0.5 }));
  }, [playerCell.cx, playerCell.cz]);

  const index = useMemo(() => buildClaimMapIndex(claims, localGameId), [claims, localGameId]);
  const nextCellCost = claimCost(index.ownedCellCount);
  const toX = useCallback((cx: number) => (cx - view.centerCx) * view.cellPx + size.width / 2, [view.centerCx, view.cellPx, size.width]);
  const toY = useCallback((cz: number) => (cz - view.centerCz) * view.cellPx + size.height / 2, [view.centerCz, view.cellPx, size.height]);
  const pointToCell = useCallback((x: number, y: number): CellCoord => ({
    cx: Math.floor(view.centerCx + (x - size.width / 2) / view.cellPx),
    cz: Math.floor(view.centerCz + (y - size.height / 2) / view.cellPx),
  }), [view.centerCx, view.centerCz, view.cellPx, size.width, size.height]);
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

  /** The surface's one gesture: pan or mark a run while dragging; a still tap claims its cell. */
  const onGesture = (gesture: { phase: "down" | "move" | "up"; x: number; y: number; cancelled: boolean }) => {
    const cell = pointToCell(gesture.x, gesture.y);
    if (gesture.phase === "down") {
      dragRef.current = { startX: gesture.x, startY: gesture.y, lastX: gesture.x, lastY: gesture.y, moved: false };
      setHoveredCell(cell);
      if (mode === "claim") setSelection({ from: cell, to: cell });
      return;
    }
    const drag = dragRef.current;
    if (drag === null) return;
    if (Math.abs(gesture.x - drag.startX) > CLICK_SLOP_PX || Math.abs(gesture.y - drag.startY) > CLICK_SLOP_PX) drag.moved = true;
    if (gesture.phase === "move") {
      setHoveredCell(cell);
      if (mode === "pan") {
        const dx = (gesture.x - drag.lastX) / view.cellPx, dz = (gesture.y - drag.lastY) / view.cellPx;
        setView((previous) => ({ ...previous, centerCx: previous.centerCx - dx, centerCz: previous.centerCz - dz }));
      } else setSelection((previous) => (previous === null ? null : { from: previous.from, to: cell }));
      drag.lastX = gesture.x;
      drag.lastY = gesture.y;
      return;
    }
    dragRef.current = null;
    if (gesture.cancelled) { setSelection(null); return; }
    if (mode === "claim") {
      const cells = selection === null ? [] : cellsInRect(selection.from, cell);
      setSelection(null);
      void claimCells(cells);
      return;
    }
    if (!drag.moved) void claimCells([cell]);
  };

  const cellPx = view.cellPx;
  const showGridLines = cellPx >= GRID_LINE_MIN_CELL_PX;
  const gridLines: { x1: number; y1: number; x2: number; y2: number; seam: boolean }[] = [];
  {
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

  const artwork = mapArtwork({ size, cellPx, gridLines, geometry, okCells, badCells, toX, toY, destinationCell, playerX, playerY });
  const verdictColor = verdict.tone === "ok" ? C.teal : verdict.tone === "bad" ? C.coral : C.faint;
  const statusChip: readonly [string, string] | null = hoveredStatus === null ? null
    : hoveredStatus.kind === "own" ? ["Yours", C.teal]
      : hoveredStatus.kind === "other" ? [hoveredStatus.ownerName, C.amber]
        : hoveredStatus.kind === "blocked" ? ["Walkway", C.coral] : ["Open", C.teal];
  const neighbours = residents?.filter((resident) => resident.gameId !== localGameId) ?? [];

  return <Stack gap={10} width={FULL}>
    <Row justify="between" width={FULL}>
      <Row gap={8}><Text size={14} weight={800}>Datacenter floor</Text><Muted size={12}>{`${index.ownedCellCount} cell${index.ownedCellCount === 1 ? "" : "s"} · next $${nextCellCost.toLocaleString()}`}</Muted></Row>
      <Row gap={4}>
        <Button tone="chip" fill={mode === "pan" ? "#5fc2a833" : "#ffffff0d"} onPress={() => setMode("pan")}>Pan</Button>
        <Button tone="chip" fill={mode === "claim" ? "#5fc2a833" : "#ffffff0d"} onPress={() => setMode("claim")}>Drag-claim</Button>
      </Row>
    </Row>
    {neighbours.length === 0 ? null : <Stack gap={6} width={FULL}>
      <Label>VISIT A NEIGHBOR</Label>
      <RuneView layout="row" gap={4} width={FULL}>{neighbours.map((resident) => <Button key={resident.presenceId} tone="chip" fill={destinationId === resident.presenceId ? "#e8836b33" : "#ffffff0d"}
        label={`Find ${resident.label ?? "Neighbor"} on the map`} onPress={() => {
          setDestinationId(resident.presenceId);
          const cell = worldToCell(resident.position.x, resident.position.z);
          setMode("pan");
          setView((previous) => ({ ...previous, centerCx: cell.cx + 0.5, centerCz: cell.cz + 0.5 }));
        }}><Text size={11} weight={800}>{resident.label ?? "Neighbor"}</Text></Button>)}</RuneView>
    </Stack>}
    {destinationCell === null ? null : <Text size={12} color={C.teal}>{`${destination?.label ?? "Neighbor"}: last saved cell (${destinationCell.cx}, ${destinationCell.cz}). Walk there to visit their lab.`}</Text>}
    <RuneAction label="Datacenter map" width={side} height={side} radius={10} clip fill={COLOR.floor} border={{ width: 1, color: "#f4ecdd1a" }} onDrag={onGesture} onAdjust={(delta) => zoomBy(delta > 0 ? 1.25 : 1 / 1.25)}>
      <RuneGlyph artwork={artwork} size={side} />
      <RuneView anchor="bottom-right" inset={8} gap={4} items="end">
        <Button tone="ghost" minHeight={32} minWidth={32} padding={4} fill="#16201ecc" label="Zoom in" onPress={() => zoomBy(1.25)}><Text weight={800}>+</Text></Button>
        <Button tone="ghost" minHeight={32} minWidth={32} padding={4} fill="#16201ecc" label="Zoom out" onPress={() => zoomBy(1 / 1.25)}><Text weight={800}>−</Text></Button>
        <Button tone="ghost" minHeight={32} padding={[4, 8, 4, 8]} fill="#16201ecc" label="Center on me" onPress={recenter}><Text size={12} weight={800}>Me</Text></Button>
      </RuneView>
    </RuneAction>
    <Panel shell="inset" width={FULL} gap={6}>
      <Row justify="between" width={FULL}>
        <Label>{hoveredCell === null ? "FLOOR" : `CELL (${hoveredCell.cx}, ${hoveredCell.cz})`}</Label>
        {statusChip === null ? null : <Text size={11} weight={800} color={statusChip[1]}>{statusChip[0]}</Text>}
      </Row>
      <Text size={12} color={verdictColor}>{verdict.text}</Text>
      <Muted size={11}>{mode === "pan" ? "Drag to pan, +/− to zoom, tap a cell to claim it." : "Drag a rectangle to claim a run — cells are bought one at a time and each one costs more."}</Muted>
      {status === null ? null : <Text size={12} color={C.muted}>{status}</Text>}
      {canEditGame ? null : <Text size={12} color={C.coral}>You can only view this lab.</Text>}
      {claiming ? <Button tone="secondary" disabled>Claiming…</Button> : null}
    </Panel>
  </Stack>;
}

const escapeSvgText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** The floor as SVG artwork in the glyph's 24-unit box: grid, walkways, columns, claims, run, pins. */
function mapArtwork({ size, cellPx, gridLines, geometry, okCells, badCells, toX, toY, destinationCell, playerX, playerY }: {
  size: { width: number; height: number }; cellPx: number;
  gridLines: readonly { x1: number; y1: number; x2: number; y2: number; seam: boolean }[];
  geometry: { own: CellCoord[]; ownEdges: CellEdge[]; foreignCells: CellCoord[]; foreignEdges: CellEdge[]; foreignBlocks: { name: string; centroid: CellCoord }[]; blocked: CellCoord[]; columns: CellCoord[] };
  okCells: readonly CellCoord[]; badCells: readonly CellCoord[];
  toX: (cx: number) => number; toY: (cz: number) => number;
  destinationCell: CellCoord | null; playerX: number; playerY: number;
}): string {
  const lines = gridLines.map((line) => `<line x1="${line.x1.toFixed(1)}" y1="${line.y1.toFixed(1)}" x2="${line.x2.toFixed(1)}" y2="${line.y2.toFixed(1)}" stroke="${line.seam ? COLOR.seam : COLOR.grid}" stroke-width="${line.seam ? 1.2 : 0.6}"/>`).join("");
  const fill = (cells: readonly CellCoord[], color: string, opacity: number, stroke = "") => cells.length === 0 ? "" : `<path d="${cellsPath(cells, toX, toY, cellPx)}" fill="${color}" fill-opacity="${opacity}"${stroke === "" ? "" : ` stroke="${stroke}" stroke-width="1.4"`}/>`;
  const edges = (list: readonly CellEdge[], color: string, width: number) => list.length === 0 ? "" : `<path d="${edgesPath(list, toX, toY, cellPx)}" stroke="${color}" stroke-width="${width}" fill="none"/>`;
  const labels = cellPx < OWNER_LABEL_MIN_CELL_PX ? "" : geometry.foreignBlocks.map((block) => `<text x="${toX(block.centroid.cx + 0.5).toFixed(1)}" y="${toY(block.centroid.cz + 0.5).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="${COLOR.other}" font-size="10" opacity=".9">${escapeSvgText(block.name)}</text>`).join("");
  const pin = destinationCell === null ? "" : `<circle cx="${toX(destinationCell.cx + 0.5).toFixed(1)}" cy="${toY(destinationCell.cz + 0.5).toFixed(1)}" r="8" fill="none" stroke="#e8836b" stroke-width="3"/>`;
  const player = `<circle cx="${playerX.toFixed(1)}" cy="${playerY.toFixed(1)}" r="${Math.max(3, cellPx * 0.28).toFixed(1)}" fill="${COLOR.player}"/><circle cx="${playerX.toFixed(1)}" cy="${playerY.toFixed(1)}" r="${Math.max(7, cellPx * 0.7).toFixed(1)}" fill="none" stroke="${COLOR.player}" stroke-opacity=".4"/>`;
  const body = lines
    + fill(geometry.blocked, COLOR.blocked, 0.12)
    + fill(geometry.columns, COLOR.column, 0.9)
    + fill(geometry.foreignCells, COLOR.other, 0.22) + edges(geometry.foreignEdges, COLOR.other, 1.8)
    + fill(geometry.own, COLOR.own, 0.3) + edges(geometry.ownEdges, COLOR.own, 2.2)
    + fill(okCells, COLOR.own, 0.35, COLOR.own) + fill(badCells, COLOR.blocked, 0.3, COLOR.blocked)
    + labels + pin + player;
  return `<g transform="scale(${(24 / size.width).toFixed(5)})">${body}</g>`;
}
