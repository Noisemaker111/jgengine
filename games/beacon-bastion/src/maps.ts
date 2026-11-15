import { createSceneSet } from "@jgengine/core/editor/sceneSet";

import sceneJson from "./editor.scene.json";
import downtownJson from "./downtown.scene.json";
import schoolJson from "./school.scene.json";

/**
 * The streets a day can be worked on, as the engine's scene set: each map is its own scene document
 * (roads, plots, buildings, scatter, terrain). Picking another map switches the set, and the shell
 * rebuilds the game for that map in place (`withSceneSet` in `game.config.ts`): no page reload.
 * Edit a map with the editor CLI's `--scene <file>`.
 */
export type MapId = "main-street" | "downtown" | "school";

/**
 * The School Campus's recess bell: every `every` seconds the kids pour into the schoolyard for
 * `seconds`, and tech on a road within `radius` of the yard crawls at `slow` of its pace.
 */
export interface RecessDef {
  every: number;
  seconds: number;
  slow: number;
  center: readonly [number, number];
  radius: number;
}

/**
 * A district's surge down its second road: from `fromWave` on, every wave sends these squads in by
 * the flank too, each growing by `growth` of its count a wave.
 */
export interface SurgeDef {
  fromWave: number;
  growth: number;
  groups: readonly { unit: string; count: number; at: number }[];
}

export interface MapDef {
  id: MapId;
  label: string;
  detail: string;
  /** Health multiplier on the ordinary tech (bosses keep their authored health). */
  toughness: number;
  /** A district's own street event, when it has one. */
  recess?: RecessDef;
  /** Extra tech down the second road, when the district has a surge. */
  surge?: SurgeDef;
}

export const MAPS: Record<MapId, MapDef> = {
  "main-street": { id: "main-street", label: "Main Street", detail: "One long winding street and a short side street to the town hall", toughness: 1 },
  downtown: {
    id: "downtown",
    label: "Downtown Grid",
    detail: "Harder: square blocks, and from the fourth wave a surge of tech down the long north road",
    toughness: 1,
    surge: {
      fromWave: 6,
      growth: 0.15,
      groups: [
        { unit: "tech_drone", count: 3, at: 3 },
        { unit: "tech_fridge", count: 1, at: 7 },
        { unit: "tech_scooter", count: 4, at: 9 },
        { unit: "tech_car", count: 1, at: 12 },
      ],
    },
  },
  school: {
    id: "school",
    label: "School Campus",
    detail: "The school run winds round the schoolyard and a bus lane cuts in from the south; at recess the kids crowd the yard's roads",
    toughness: 1.2,
    recess: { every: 40, seconds: 8, slow: 0.45, center: [-11, -2], radius: 15 },
  },
};

/** Every map, in season order: each district opens once the one before it has been held. */
export const MAP_IDS: readonly MapId[] = ["main-street", "downtown", "school"];

const STORAGE_KEY = "do-not-disturb:map";

/** A map pinned for this boot: headless runs set `DND_MAP`, a capture or a link sets `?map=`. */
function pinnedMap(): string | null {
  try {
    const fromEnv = typeof process === "undefined" ? undefined : process.env?.["DND_MAP"];
    if (typeof fromEnv === "string" && fromEnv !== "") return fromEnv;
    return typeof location === "undefined" ? null : new URLSearchParams(location.search).get("map");
  } catch {
    return null;
  }
}

export const sceneSet = createSceneSet<MapId>({
  scenes: {
    "main-street": { label: MAPS["main-street"].label, document: sceneJson, file: "editor.scene.json" },
    downtown: { label: MAPS.downtown.label, document: downtownJson, file: "downtown.scene.json" },
    school: { label: MAPS.school.label, document: schoolJson, file: "school.scene.json" },
  },
  defaultId: "main-street",
  initial: pinnedMap(),
  storage: {
    read: () => (typeof localStorage === "undefined" ? null : localStorage.getItem(STORAGE_KEY)),
    write: (id) => {
      if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, id);
    },
  },
});

/** The map the game's world is bound to; the set's selection leads it until the rebuild binds it. */
let bound: MapId = sceneSet.active();

/** Record the map the world was just bound to (`bindScene` calls it). @internal */
export function bindMap(id: MapId): void {
  bound = id;
}

/** The map the town is on right now: the one its roads, plots and waves are bound to. */
export function activeMap(): MapId {
  return bound;
}

/** Switch the town to another map: the shell rebuilds the game on it. Returns whether it switched. */
export function chooseMap(id: MapId): boolean {
  return sceneSet.select(id);
}
