import { MinimapChrome, useMarkers, type MinimapChromeMarker } from "@jgengine/react/map";
import { useLiveMarkers } from "@jgengine/react/hooks";
import type { MinimapView } from "@jgengine/core/world/minimap";

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

/** Dot palette per marker kind — same faction colours and blip sizes as the old radar. */
const BLIP: Record<string, Blip> = {
  playerHero: { color: "#ffd24a", radius: 3.4, stroke: false },
  playerBuilding: { color: "#5b9bff", radius: 4, stroke: true },
  playerUnit: { color: "#5b9bff", radius: 2.4, stroke: false },
  enemyHero: { color: "#f0603f", radius: 3.4, stroke: false },
  enemyBuilding: { color: "#f0603f", radius: 4, stroke: true },
  enemyUnit: { color: "#f0603f", radius: 2.4, stroke: false },
  goldmine: { color: "#e8c14a", radius: 2.6, stroke: false },
};

/** A live top-down radar built on the shared minimap primitives: own forces blue, hero gold,
 * Marauders red, gold seams amber. `useLiveMarkers` rescans scene poses each HUD tick;
 * faction/kind come from the session roster, then `MinimapChrome` plots the dots over the
 * game's own square battlefield frame. */
export function Minimap() {
  const markers = useLiveMarkers((set, ctx) => {
    for (const e of ctx.scene.entity.list()) {
      const unit = session.units.get(e.id);
      if (unit !== undefined) {
        const side = unit.faction === "player" ? "player" : "enemy";
        const role = unit.kind === "building" ? "Building" : unit.catalogId === "hero" ? "Hero" : "Unit";
        set.add({ id: e.id, kind: `${side}${role}`, position: e.position });
      } else if (e.name === "goldmine") {
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
      ...(blip.stroke ? { strokeColor: "#0b1220", strokeWidth: 0.6 } : {}),
    };
  });

  return (
    <div className="rounded-lg border border-slate-500/40 bg-slate-900/80 p-1 shadow-lg backdrop-blur-sm">
      <svg width={SIZE} height={SIZE} className="block rounded" role="img" aria-label="Battlefield minimap">
        <rect x={0} y={0} width={SIZE} height={SIZE} fill="#25401f" rx={4} />
        <rect x={0} y={0} width={SIZE} height={SIZE / 2} fill="#3a2020" opacity={0.35} />
        <MinimapChrome view={VIEW} markers={dots} />
      </svg>
    </div>
  );
}
