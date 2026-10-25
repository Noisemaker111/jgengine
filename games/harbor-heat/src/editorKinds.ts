import { definePlaceableMarkerKind } from "@jgengine/core/scene/sceneKinds";

/**
 * Harbor Heat's own click-to-place marker kinds. Registering them here (imported for its side effect by
 * `editorLayers.ts`, which the editor always loads for this game) makes "Stash", "Bounty", "Crossing"
 * and "Kerb space" tools in the editor's `+ Add` menu: pick one, click the world to drop it, Shift-click
 * to keep placing a whole run of them. The runtime still reads these off `editorLayers.markers` by
 * `kind` — the registration only teaches the editor how to place and inspect them.
 */
export const STASH_KIND = definePlaceableMarkerKind({
  kind: "stash",
  label: "Stash",
  category: "Harbor Heat",
  accent: "#38d6c4",
  fields: [{ type: "number", key: "value", label: "Payout ($)", default: 300, min: 0, step: 50 }],
});

export const BOUNTY_KIND = definePlaceableMarkerKind({
  kind: "bounty",
  label: "Bounty spot",
  category: "Harbor Heat",
  accent: "#6d2f8f",
});

/**
 * A signalised (or first-come) crossing. The engine's lane-graph reader (`laneGraphFromDocument`) reads
 * `traffic_intersection` markers for a junction's right-of-way and signal program; registering the kind
 * makes it placeable and gives the common knobs an inspector. The signal program itself is authored as
 * `meta.signal` in the document, because a nested object is not a marker field.
 */
export const TRAFFIC_INTERSECTION_KIND = definePlaceableMarkerKind({
  kind: "traffic_intersection",
  label: "Traffic crossing",
  category: "Harbor Heat",
  accent: "#f6cf4a",
  fields: [
    {
      type: "select",
      key: "rightOfWay",
      label: "Right of way",
      options: [
        { value: "signal", label: "Signal" },
        { value: "priority", label: "First come" },
      ],
      default: "signal",
    },
    { type: "number", key: "offsetSeconds", label: "Cycle offset (s)", default: 0, min: 0, step: 0.5 },
    { type: "number", key: "stopLine", label: "Stop line (m)", default: 6, min: 1, step: 0.5 },
  ],
});

/** A kerbside parking spot. The lane graph projects it onto its nearest lane and its arc. */
export const TRAFFIC_PARKING_KIND = definePlaceableMarkerKind({
  kind: "traffic_parking",
  label: "Kerb space",
  category: "Harbor Heat",
  accent: "#8aa0b4",
});

/**
 * A place a resident's day can name: a home, a workplace, a diner. `game/world/residents.ts` reads
 * these as the routine anchors, so moving one in the editor moves where that resident goes.
 */
export const RESIDENT_PLACE_KIND = definePlaceableMarkerKind({
  kind: "resident_place",
  label: "Resident place",
  category: "Harbor Heat",
  accent: "#e8a14a",
});

/**
 * A business lot the player can buy as a front. `meta.business` names the city kind it becomes and
 * `meta.price` what it costs; the city's `fronts` slot of the same id stands here.
 */
export const FRONT_KIND = definePlaceableMarkerKind({
  kind: "front",
  label: "Business front",
  category: "Harbor Heat",
  accent: "#ff5fa2",
  fields: [
    { type: "text", key: "business", label: "City kind", default: "lounge" },
    { type: "number", key: "price", label: "Price ($)", default: 3000, min: 0, step: 100 },
  ],
});

/**
 * Cover HHPD can't see into: a garage bay, a wash bay, a safehouse garage. Standing inside one runs
 * the cold trail faster; `meta.needs` names what the player must own first (`safehouse` or a front slot).
 */
export const HIDEOUT_KIND = definePlaceableMarkerKind({
  kind: "hideout",
  label: "Hideout",
  category: "Harbor Heat",
  accent: "#3b4a5c",
  fields: [
    { type: "number", key: "radius", label: "Radius (m)", default: 9, min: 2, step: 0.5 },
    { type: "text", key: "needs", label: "Needs owned", default: "" },
  ],
});

/**
 * A kerb or counter a side job starts or ends at. `meta.tags` lists which gigs use it, comma
 * separated: `fare` (taxi pickups and drops), `flowers` (flower-run addresses), `florist` (the shop
 * flower runs load at). `game/jobs/gigs.ts` reads them as the side-job board's spots.
 */
export const GIG_STOP_KIND = definePlaceableMarkerKind({
  kind: "gig_stop",
  label: "Gig stop",
  category: "Harbor Heat",
  accent: "#f2c14e",
  fields: [{ type: "text", key: "tags", label: "Tags", default: "fare" }],
});

/**
 * A gang's block: the centre of the turf and how far it reaches. `game/city.ts` names which crew
 * holds it and which blocks it borders; moving one in the editor moves where its crew stands.
 */
export const TURF_KIND = definePlaceableMarkerKind({
  kind: "turf",
  label: "Gang turf",
  category: "Harbor Heat",
  accent: "#1fb5a8",
  fields: [{ type: "number", key: "radius", label: "Radius (m)", default: 45, min: 10, step: 5 }],
});
