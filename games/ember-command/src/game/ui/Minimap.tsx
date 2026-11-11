/** @jsxImportSource @jgengine/core/ui/jsx */
import { useMemo } from "@jgengine/core/ui/jsx";
import { RuneFor, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind, type RuneSource } from "@jgengine/core/ui/rune/primitives";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { projectToMinimap, type MinimapView } from "@jgengine/core/map/minimap";

import { enemyDrawn, fogLevel, fogSnapshot, FOG_ALPHA, type FogCellsSnapshot } from "../fog";
import { session } from "../session";
import { INK, MARAUDER_INK, OCHRE, BRASS, VANGUARD_INK } from "./theme";

export const MAP_SIZE = 168;
const RADIUS = 48; // the battlefield is 96×96 centred on the origin, so ±48 fills the frame
const VIEW: MinimapView = { center: [0, 0], worldRadius: RADIUS, size: MAP_SIZE };
const FOG_INK = "#3a2a18";

interface Blip { color: string; radius: number; stroke: boolean }
/** Marks per kind, in the survey's inks: the Vanguard blue, the hero brass, Marauders red, gold seams ochre. */
const BLIP: Record<string, Blip> = {
  playerHero: { color: BRASS, radius: 3.6, stroke: true },
  playerBuilding: { color: VANGUARD_INK, radius: 4.2, stroke: true },
  playerUnit: { color: VANGUARD_INK, radius: 2.5, stroke: false },
  enemyHero: { color: MARAUDER_INK, radius: 3.6, stroke: true },
  enemyBuilding: { color: MARAUDER_INK, radius: 4.2, stroke: true },
  enemyUnit: { color: MARAUDER_INK, radius: 2.5, stroke: false },
  goldmine: { color: OCHRE, radius: 2.7, stroke: false },
};

export interface FogRun { key: string; x: number; y: number; w: number; h: number; kind: "unseen" | "explored" }

/** One rectangle per row's run of cells in one fog state; cells in sight now are left clear. */
export function fogRuns(snapshot: FogCellsSnapshot): FogRun[] {
  const cells = snapshot.explored, seen = snapshot.visible.revealed;
  const cellPx = cells.cellSize * (MAP_SIZE / 2 / RADIUS);
  const state = (i: number) => (seen[i] === true ? 0 : cells.revealed[i] === true ? 1 : 2);
  const runs: FogRun[] = [];
  for (let row = 0; row < cells.rows; row += 1) {
    let col = 0;
    while (col < cells.cols) {
      const kind = state(row * cells.cols + col);
      let end = col + 1;
      while (end < cells.cols && state(row * cells.cols + end) === kind) end += 1;
      if (kind !== 0) {
        const z = cells.minZ + (row + 0.5) * cells.cellSize;
        const first = projectToMinimap([cells.minX + (col + 0.5) * cells.cellSize, z], VIEW);
        const last = projectToMinimap([cells.minX + (end - 0.5) * cells.cellSize, z], VIEW);
        const x = Math.min(first.x, last.x) - cellPx / 2;
        runs.push({ key: `${row}:${col}`, x: round(x), y: round(first.y - cellPx / 2), w: round(Math.abs(last.x - first.x) + cellPx), h: round(cellPx), kind: kind === 1 ? "explored" : "unseen" });
      }
      col = end;
    }
  }
  return runs;
}
const round = (v: number) => Math.round(v * 10) / 10;

interface Dot { id: string; kind: string }

/** Every blip the map may show now: friendly and sighted enemy units, buildings and surveyed seams. */
function tacticalDots(ctx: GameContext): Dot[] {
  const dots: Dot[] = [];
  for (const e of ctx.scene.entity.list()) {
    const unit = session.units.get(e.id);
    if (unit !== undefined) {
      if (unit.faction === "enemy" && unit.kind === "unit" && !enemyDrawn(session.fog, e.position[0], e.position[2])) continue;
      const role = unit.kind === "building" ? "Building" : unit.catalogId === "hero" ? "Hero" : "Unit";
      dots.push({ id: e.id, kind: `${unit.faction === "player" ? "player" : "enemy"}${role}` });
    } else if (e.name === "goldmine" && fogLevel(session.fog, e.position[0], e.position[2]) !== "unseen") {
      dots.push({ id: e.id, kind: "goldmine" });
    }
  }
  return dots;
}

/** A source that rescans while subscribed and publishes only when its membership changes. */
function polledSource<T>(scan: () => T[], key: (items: T[]) => string, everyMs: number): RuneSource<T> {
  let items: T[] = scan(), token = key(items);
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setInterval> | null = null;
  return {
    read: () => items,
    subscribe(change) {
      listeners.add(change);
      timer ??= setInterval(() => {
        const next = scan(), nextToken = key(next);
        if (nextToken === token) return;
        items = next; token = nextToken;
        for (const listener of listeners) listener();
      }, everyMs);
      return () => {
        listeners.delete(change);
        if (listeners.size === 0 && timer !== null) { clearInterval(timer); timer = null; }
      };
    },
  };
}

/**
 * The survey map: parchment with the Warcamp's half washed red, ruled squares, fog runs re-read at the
 * fog tick and blips that move at their leaves. Enemy units out of Vanguard sight have no blip.
 */
export function TacticalMinimap({ ctx }: { ctx: GameContext }) {
  const fog = useMemo(() => polledSource(() => fogRuns(fogSnapshot(session.fog)),
    (runs) => runs.map((r) => `${r.key}${r.kind[0]}${r.w}`).join(","), 200), []);
  const dots = useMemo(() => polledSource(() => tacticalDots(ctx), (list) => list.map((d) => d.id + d.kind).join(","), 150), [ctx]);
  const grid = Array.from({ length: 5 }, (_, i) => (i + 1) * (MAP_SIZE / 6));
  return <RuneView width={MAP_SIZE} height={MAP_SIZE} fill="#dccaa0" clip label="Battlefield minimap">
    <RuneView pin={[0, 0, null, null]} width={MAP_SIZE} height={MAP_SIZE / 2} fill="#a3291c14" />
    {grid.map((at) => <RuneView key={`v${at}`} pin={[at, 0, null, null]} width={1} height={MAP_SIZE} fill="#2b1d101f" />)}
    {grid.map((at) => <RuneView key={`h${at}`} pin={[0, at, null, null]} width={MAP_SIZE} height={1} fill="#2b1d101f" />)}
    <RuneFor source={fog} keyBy={(run) => `${run.key}:${run.kind}:${run.w}`}>{(run) =>
      <RuneView pin={[run.x, run.y, null, null]} width={run.w} height={run.h}
        fill={FOG_INK} opacity={run.kind === "unseen" ? FOG_ALPHA.unseen * 0.8 : FOG_ALPHA.explored * 0.45} />}
    </RuneFor>
    <RuneFor source={dots} keyBy={(dot) => dot.id}>{(dot) => <Blip ctx={ctx} dot={dot} />}</RuneFor>
  </RuneView>;
}

function Blip({ ctx, dot }: { ctx: GameContext; dot: Dot }) {
  const blip = BLIP[dot.kind] ?? { color: "#5b9bff", radius: 2.4, stroke: false };
  const d = blip.radius * 2;
  const at = () => {
    const p = ctx.scene.entity.get(dot.id)?.position;
    return p === undefined ? { x: -99, y: -99 } : projectToMinimap([p[0], p[2]], VIEW);
  };
  return <RuneView pin={[0, 0, null, null]} width={d} height={d} radius={blip.radius} fill={blip.color}
    {...(blip.stroke ? { border: { width: 1, color: INK } } : {})}
    x={bind(() => at().x - blip.radius)} y={bind(() => at().y - blip.radius)} />;
}
