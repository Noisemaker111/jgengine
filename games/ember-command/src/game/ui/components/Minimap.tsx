import { useEffect, useMemo, useState } from "@jgengine/core/ui/jsx";
import { MinimapChrome, type MinimapChromeMarker } from "@jgengine/core/map/map.view";
import { useGameContext } from "@jgengine/react/provider";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { live } from "@jgengine/core/ui/liveValue";
import { projectToMinimap, type MinimapView } from "@jgengine/core/map/minimap";

import { enemyDrawn, fogLevel, fogSnapshot, FOG_ALPHA, type FogCellsSnapshot } from "../../fog";
import { session } from "../../session";

const SIZE = 168;
const RADIUS = 48; // battlefield is 96×96 centred on the origin, so ±48 fills the frame

// North-up, origin-centred view. `projectToMinimap([x,z], VIEW)` reproduces the old
// `toMap` mapping exactly: ((v + 48) / 96) * 168 === 84 + 1.75·v.
const VIEW: MinimapView = { center: [0, 0], worldRadius: RADIUS, size: SIZE };

interface Blip {
  color: string;
  radius: number;
  stroke: boolean;
}

/** Marks per marker kind, in the survey's inks: the Vanguard in blue, the hero in brass, the
 * Marauders in red, gold seams in ochre. Buildings carry an iron-gall outline. */
const BLIP: Record<string, Blip> = {
  playerHero: { color: "#c99a4a", radius: 3.6, stroke: true },
  playerBuilding: { color: "#2d5b8c", radius: 4.2, stroke: true },
  playerUnit: { color: "#2d5b8c", radius: 2.5, stroke: false },
  enemyHero: { color: "#a3291c", radius: 3.6, stroke: true },
  enemyBuilding: { color: "#a3291c", radius: 4.2, stroke: true },
  enemyUnit: { color: "#a3291c", radius: 2.5, stroke: false },
  goldmine: { color: "#b0741c", radius: 2.7, stroke: false },
};

const INK = "#2b1d10";
const FOG_INK = "#3a2a18";

/** The fog grids, re-read on the fog tick (5 Hz) so the map never shows a stale sightline. */
function useFogSnapshot(): FogCellsSnapshot | null {
  const [snapshot, setSnapshot] = useState<FogCellsSnapshot | null>(() => fogSnapshot(session.fog));
  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = fogSnapshot(session.fog);
      setSnapshot((prev) => (prev !== null && prev.visible === next.visible && prev.explored === next.explored ? prev : next));
    }, 200);
    return () => window.clearInterval(timer);
  }, []);
  return snapshot;
}

/** One SVG path per fog state: solid over ground never seen, dimmed over ground explored but out of
 * sight now. Cells seen this tick are left alone so the terrain (and the blips on it) reads clearly.
 * Each row's run of cells in one state is one rectangle, so the path is a few rows of text, not a
 * rectangle per cell rebuilt on every fog tick. */
export function fogPaths(snapshot: FogCellsSnapshot): { unseen: string; explored: string } {
  const cells = snapshot.explored;
  const seen = snapshot.visible.revealed;
  const cellPx = cells.cellSize * (SIZE / 2 / RADIUS);
  const height = cellPx.toFixed(1);
  let unseen = "";
  let explored = "";
  const state = (index: number) => (seen[index] === true ? 0 : cells.revealed[index] === true ? 1 : 2);
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
        const width = (Math.abs(last.x - first.x) + cellPx).toFixed(1);
        const d = `M${(Math.min(first.x, last.x) - cellPx / 2).toFixed(1)} ${(first.y - cellPx / 2).toFixed(1)}h${width}v${height}h-${width}z`;
        if (kind === 1) explored += d;
        else unseen += d;
      }
      col = end;
    }
  }
  return { unseen, explored };
}

/** Every blip on the tactical map now: friendly and seen enemy units, buildings and surveyed gold seams. */
function tacticalDots(ctx: GameContext): MinimapChromeMarker[] {
  const dots: MinimapChromeMarker[] = [];
  for (const e of ctx.scene.entity.list()) {
    const unit = session.units.get(e.id);
    let kind: string | null = null;
    if (unit !== undefined) {
      const x = e.position[0];
      const z = e.position[2];
      // Enemy units stay off the map until a friendly eye reaches them.
      if (unit.faction === "enemy" && unit.kind === "unit" && !enemyDrawn(session.fog, x, z)) continue;
      const side = unit.faction === "player" ? "player" : "enemy";
      const role = unit.kind === "building" ? "Building" : unit.catalogId === "hero" ? "Hero" : "Unit";
      kind = `${side}${role}`;
    } else if (e.name === "goldmine") {
      // Terrain the army has never reached is hidden entirely, seams included.
      if (fogLevel(session.fog, e.position[0], e.position[2]) === "unseen") continue;
      kind = "goldmine";
    }
    if (kind === null) continue;
    const blip = BLIP[kind] ?? { color: "#5b9bff", radius: 2.4, stroke: false };
    dots.push({
      id: e.id,
      position: [e.position[0], e.position[1], e.position[2]],
      color: blip.color,
      radius: blip.radius,
      ...(blip.stroke ? { strokeColor: INK, strokeWidth: 0.9 } : {}),
    });
  }
  return dots;
}

/** A live top-down radar built on the shared minimap primitives: own forces blue, hero gold,
 * Marauders red, gold seams amber. The blips are rescanned from scene poses every 100 ms and handed
 * to `MinimapChrome` as a live value, which moves them over the game's own square battlefield frame
 * without a render. Fog of war: unseen ground is black, explored-but-unseen ground is dimmed, and a
 * Marauder unit outside Vanguard sight has no blip at all. */
export function TacticalMinimap() {
  const fog = useFogSnapshot();

  const ctx = useGameContext();
  // Units move every frame; the blips are rescanned every 100 ms as before, and the chrome moves them without a render.
  const dots = useMemo(() => {
    let scannedAt = Number.NEGATIVE_INFINITY;
    let list: MinimapChromeMarker[] = [];
    return live(() => {
      const now = performance.now();
      if (now - scannedAt >= 100) {
        scannedAt = now;
        list = tacticalDots(ctx);
      }
      return list;
    });
  }, [ctx]);

  const fogPaint = useMemo(() => (fog === null ? null : fogPaths(fog)), [fog]);

  return (
    <svg width={SIZE} height={SIZE} className="ec-minimap" role="img" aria-label="Battlefield minimap">
      {/* The vale as a survey sheet: parchment, the Warcamp's half washed red, ruled survey squares. */}
      <rect x={0} y={0} width={SIZE} height={SIZE} fill="#dccaa0" />
      <rect x={0} y={0} width={SIZE} height={SIZE / 2} fill="#a3291c" opacity={0.08} />
      <path
        d={Array.from({ length: 5 }, (_, i) => `M${(i + 1) * (SIZE / 6)} 0V${SIZE}M0 ${(i + 1) * (SIZE / 6)}H${SIZE}`).join("")}
        stroke={INK}
        strokeOpacity={0.12}
        strokeWidth={0.6}
        fill="none"
      />
      {/* Ground never surveyed is cross-hatched in ink; ground surveyed but out of sight is washed. */}
      <defs>
        <pattern id="ec-unsurveyed" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill={FOG_INK} fillOpacity={0.42} />
          <path d="M0 0V6" stroke={INK} strokeOpacity={0.55} strokeWidth={1.4} />
        </pattern>
      </defs>
      {fogPaint !== null ? (
        <>
          <path d={fogPaint.unseen} fill="url(#ec-unsurveyed)" opacity={FOG_ALPHA.unseen} />
          <path d={fogPaint.explored} fill={FOG_INK} opacity={FOG_ALPHA.explored * 0.45} />
        </>
      ) : null}
      <MinimapChrome view={VIEW} markers={dots} />
    </svg>
  );
}
