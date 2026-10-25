import { useEffect, useState } from "react";
import { MinimapChrome, useMarkers, type MinimapChromeMarker } from "@jgengine/react/map";
import { useLiveMarkers } from "@jgengine/react/hooks";
import { projectToMinimap, type MinimapView } from "@jgengine/core/world/minimap";

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
 * sight now. Cells seen this tick are left alone so the terrain (and the blips on it) reads clearly. */
function fogPaths(snapshot: FogCellsSnapshot): { unseen: string; explored: string } {
  const cells = snapshot.explored;
  const seen = snapshot.visible.revealed;
  const pxPerWorld = SIZE / 2 / RADIUS;
  const cellPx = cells.cellSize * pxPerWorld;
  const unseen: string[] = [];
  const explored: string[] = [];
  for (let row = 0; row < cells.rows; row += 1) {
    for (let col = 0; col < cells.cols; col += 1) {
      const index = row * cells.cols + col;
      if (seen[index] === true) continue;
      const at = projectToMinimap(
        [cells.minX + (col + 0.5) * cells.cellSize, cells.minZ + (row + 0.5) * cells.cellSize],
        VIEW,
      );
      const x = (at.x - cellPx / 2).toFixed(1);
      const y = (at.y - cellPx / 2).toFixed(1);
      const d = `M${x} ${y}h${cellPx.toFixed(1)}v${cellPx.toFixed(1)}h-${cellPx.toFixed(1)}z`;
      (cells.revealed[index] === true ? explored : unseen).push(d);
    }
  }
  return { unseen: unseen.join(""), explored: explored.join("") };
}

/** A live top-down radar built on the shared minimap primitives: own forces blue, hero gold,
 * Marauders red, gold seams amber. `useLiveMarkers` rescans scene poses each HUD tick;
 * faction/kind come from the session roster, then `MinimapChrome` plots the dots over the
 * game's own square battlefield frame. Fog of war: unseen ground is black, explored-but-unseen
 * ground is dimmed, and a Marauder unit outside Vanguard sight has no blip at all. */
export function Minimap() {
  const fog = useFogSnapshot();

  const markers = useLiveMarkers((set, ctx) => {
    for (const e of ctx.scene.entity.list()) {
      const unit = session.units.get(e.id);
      if (unit !== undefined) {
        const x = e.position[0];
        const z = e.position[2];
        // Enemy units stay off the map until a friendly eye reaches them.
        if (unit.faction === "enemy" && unit.kind === "unit" && !enemyDrawn(session.fog, x, z)) continue;
        const side = unit.faction === "player" ? "player" : "enemy";
        const role = unit.kind === "building" ? "Building" : unit.catalogId === "hero" ? "Hero" : "Unit";
        set.add({ id: e.id, kind: `${side}${role}`, position: e.position });
      } else if (e.name === "goldmine") {
        // Terrain the army has never reached is hidden entirely, seams included.
        if (fogLevel(session.fog, e.position[0], e.position[2]) === "unseen") continue;
        set.add({ id: e.id, kind: "goldmine", position: e.position });
      }
    }
  });

  const dots: MinimapChromeMarker[] = useMarkers(markers).map((m) => {
    const blip = BLIP[m.kind] ?? { color: "#5b9bff", radius: 2.4, stroke: false };
    return {
      id: m.id,
      position: m.position,
      color: blip.color,
      radius: blip.radius,
      ...(blip.stroke ? { strokeColor: INK, strokeWidth: 0.9 } : {}),
    };
  });

  const fogPaint = fog === null ? null : fogPaths(fog);

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
