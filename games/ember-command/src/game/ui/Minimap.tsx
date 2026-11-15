/** @jsxImportSource @jgengine/core/ui/jsx */
import { useMemo } from "@jgengine/core/ui/jsx";
import { RuneFor, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind, type RuneSource } from "@jgengine/core/ui/rune/primitives";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { projectToMinimap, type MinimapView } from "@jgengine/core/map/minimap";

import { enemyDrawn, fogLevel, fogSnapshot, FOG_ALPHA, type FogCellsSnapshot } from "../fog";
import { isMarked, session } from "../session";
import { YARD } from "../yardInstance";
import { hudStore } from "../hudStore";
import { INK, RIVAL_INK, OCHRE, BRASS, RED_INK } from "./theme";

export const MAP_SIZE = 168;
const RADIUS = 48; // the battlefield is 96×96 centred on the origin, so ±48 fills the frame
const VIEW: MinimapView = { center: [0, 0], worldRadius: RADIUS, size: MAP_SIZE };
const FOG_INK = "#1d2a10";

interface Blip { color: string; radius: number; stroke: boolean }
/** Marks per kind: the red colony, the Marshal in honey, the black ants in violet, sugar in ochre, leaf in green. */
const BLIP: Record<string, Blip> = {
  playerHero: { color: BRASS, radius: 3.6, stroke: true },
  playerBuilding: { color: RED_INK, radius: 4.2, stroke: true },
  playerUnit: { color: RED_INK, radius: 2.5, stroke: false },
  enemyHero: { color: RIVAL_INK, radius: 3.6, stroke: true },
  enemyBuilding: { color: RIVAL_INK, radius: 4.2, stroke: true },
  enemyUnit: { color: RIVAL_INK, radius: 2.5, stroke: false },
  crumbs: { color: OCHRE, radius: 2.7, stroke: false },
  popsicle: { color: "#ff3d6e", radius: 4, stroke: true },
  leaves: { color: "#2f7a1c", radius: 2.7, stroke: false },
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

/** The live lawn's landmarks, projected for the map: hose beads, patio slabs, the mower's lane band. */
function yardOverlay() {
const HOSE_DOTS = (() => {
  const out: { key: string; x: number; y: number }[] = [];
  const pts = YARD.hose?.points ?? [];
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1]!, b = pts[i]!;
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2.2);
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      const at = projectToMinimap([a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t], VIEW);
      if (at.x >= 0 && at.x <= MAP_SIZE && at.y >= 0 && at.y <= MAP_SIZE) out.push({ key: `h${i}:${s}`, x: round(at.x), y: round(at.y) });
    }
  }
  return out;
})();
const PATIO_RECTS = YARD.patios.map((slab, i) => {
  const a = projectToMinimap([slab.x - slab.halfX, slab.z - slab.halfZ], VIEW);
  const b = projectToMinimap([slab.x + slab.halfX, slab.z + slab.halfZ], VIEW);
  return { key: `p${i}`, x: round(Math.min(a.x, b.x)), y: round(Math.min(a.y, b.y)), w: round(Math.abs(b.x - a.x)), h: round(Math.abs(b.y - a.y)) };
});
const LANE = (() => {
  const lane = YARD.mowerLane;
  if (lane === null) return null;
  const top = projectToMinimap([0, lane.from.z - lane.halfWidth], VIEW);
  const bottom = projectToMinimap([0, lane.from.z + lane.halfWidth], VIEW);
  return { y: round(Math.min(top.y, bottom.y)), h: round(Math.abs(bottom.y - top.y)) };
})();
const HOT_RECTS = YARD.hot.map((slab, i) => {
  const a = projectToMinimap([slab.x - slab.halfX, slab.z - slab.halfZ], VIEW);
  const b = projectToMinimap([slab.x + slab.halfX, slab.z + slab.halfZ], VIEW);
  return { key: `hot${i}`, x: round(Math.min(a.x, b.x)), y: round(Math.min(a.y, b.y)), w: round(Math.abs(b.x - a.x)), h: round(Math.abs(b.y - a.y)) };
});
const CRACK_DOTS: { key: string; x: number; y: number }[] = [];
YARD.cracks.forEach((crack, c) => {
  for (let i = 1; i < crack.points.length; i += 1) {
    const a = crack.points[i - 1]!, b = crack.points[i]!;
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2);
    for (let k = 0; k < steps; k += 1) {
      const at = projectToMinimap([a.x + ((b.x - a.x) * k) / steps, a.z + ((b.z - a.z) * k) / steps], VIEW);
      CRACK_DOTS.push({ key: `c${c}:${i}:${k}`, x: round(at.x), y: round(at.y) });
    }
  }
});
return { HOSE_DOTS, PATIO_RECTS, LANE, HOT_RECTS, CRACK_DOTS };
}

/** Every blip the map may show now: friendly and sighted enemy units, buildings and surveyed seams. */
function tacticalDots(ctx: GameContext): Dot[] {
  const dots: Dot[] = [];
  for (const e of ctx.scene.entity.list()) {
    const unit = session.units.get(e.id);
    if (unit !== undefined) {
      if (unit.faction === "enemy" && unit.kind === "unit" && !enemyDrawn(session.fog, e.position[0], e.position[2]) && !isMarked(e.id)) continue;
      const role = unit.kind === "building" ? "Building" : unit.catalogId === "hero" ? "Hero" : "Unit";
      dots.push({ id: e.id, kind: `${unit.faction === "player" ? "player" : "enemy"}${role}` });
    } else if ((e.name === "crumbs" || e.name === "popsicle" || e.name === "leaves") && fogLevel(session.fog, e.position[0], e.position[2]) !== "unseen") {
      dots.push({ id: e.id, kind: e.name });
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
 * The lawn map: green with the black colony's half washed violet, the hose, the patio stones and the
 * mower's lane (flashing red while it warns), fog runs re-read at the fog tick and blips that move at
 * their leaves. Enemy units out of the colony's sight have no blip.
 */
export function TacticalMinimap({ ctx }: { ctx: GameContext }) {
  const fog = useMemo(() => polledSource(() => fogRuns(fogSnapshot(session.fog)),
    (runs) => runs.map((r) => `${r.key}${r.kind[0]}${r.w}`).join(","), 200), []);
  const dots = useMemo(() => polledSource(() => tacticalDots(ctx), (list) => list.map((d) => d.id + d.kind).join(","), 150), [ctx]);
  const grid = Array.from({ length: 5 }, (_, i) => (i + 1) * (MAP_SIZE / 6));
  const { HOSE_DOTS, PATIO_RECTS, LANE, HOT_RECTS, CRACK_DOTS } = useMemo(yardOverlay, []);
  return <RuneView width={MAP_SIZE} height={MAP_SIZE} fill="#6fb83a" clip label="Battlefield minimap">
    <RuneView pin={[0, 0, null, null]} width={MAP_SIZE} height={MAP_SIZE / 2} fill="#4b3a6622" />
    {HOT_RECTS.map((r) => <RuneView key={r.key} pin={[r.x, r.y, null, null]} width={r.w} height={r.h} fill="#8d8a86" />)}
    {CRACK_DOTS.map((d) => <RuneView key={d.key} pin={[d.x - 1.4, d.y - 1.4, null, null]} width={2.8} height={2.8} radius={1.4} fill="#3fa0c8" />)}
    {PATIO_RECTS.map((r) => <RuneView key={r.key} pin={[r.x, r.y, null, null]} width={r.w} height={r.h} fill="#d8d2c4" radius={2} />)}
    {LANE === null ? null : <RuneView pin={[0, LANE.y, null, null]} width={MAP_SIZE} height={LANE.h} fill="#ff3b2f"
      opacity={bind(() => { const m = hudStore.get().hazards.mower; return m === "warning" ? 0.55 : m === "crossing" ? 0.7 : m === "idle" ? 0.16 : 0; })} />}
    {HOSE_DOTS.map((d) => <RuneView key={d.key} pin={[d.x - 1.6, d.y - 1.6, null, null]} width={3.2} height={3.2} radius={1.6} fill="#1f6e2a" />)}
    {grid.map((at) => <RuneView key={`v${at}`} pin={[at, 0, null, null]} width={1} height={MAP_SIZE} fill="#1f2a121f" />)}
    {grid.map((at) => <RuneView key={`h${at}`} pin={[0, at, null, null]} width={MAP_SIZE} height={1} fill="#1f2a121f" />)}
    <RuneFor source={fog} keyBy={(run) => `${run.key}:${run.kind}:${run.w}`}>{(run) =>
      <RuneView pin={[run.x, run.y, null, null]} width={run.w} height={run.h}
        fill={FOG_INK} opacity={run.kind === "unseen" ? FOG_ALPHA.unseen * 0.8 : FOG_ALPHA.explored * 0.45} />}
    </RuneFor>
    <RuneFor source={dots} keyBy={(dot) => dot.id}>{(dot) => <Blip ctx={ctx} dot={dot} />}</RuneFor>
    <BeamBlip />
  </RuneView>;
}

/** The magnifying glass's spot on the lawn map: a hot ring that pulses while it burns. */
function BeamBlip() {
  const at = () => {
    const hz = session.hazards;
    return hz.toggles.beam ? projectToMinimap([hz.beam.x, hz.beam.z], VIEW) : { x: -99, y: -99 };
  };
  const r = 6;
  return <RuneView pin={[0, 0, null, null]} width={r * 2} height={r * 2} radius={r} fill="#ffd84a99" border={{ width: 2, color: "#ff3b2f" }}
    x={bind(() => at().x - r)} y={bind(() => at().y - r)} opacity={bind(() => (session.hazards.beam.focused ? 1 : 0.45))} label="the beam" />;
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
