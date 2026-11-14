import { createSceneSet } from "@jgengine/core/editor/sceneSet";

import sceneJson from "./editor.scene.json";
import downtownJson from "./downtown.scene.json";

/**
 * The streets a day can be worked on, as the engine's scene set: each map is its own scene document
 * (roads, plots, buildings, scatter, terrain). Picking another map switches the set, and the shell
 * rebuilds the game for that map in place (`withSceneSet` in `game.config.ts`): no page reload.
 * Edit a map with the editor CLI's `--scene <file>`.
 */
export type MapId = "main-street" | "downtown";

export interface MapDef {
  id: MapId;
  label: string;
  detail: string;
}

export const MAPS: Record<MapId, MapDef> = {
  "main-street": { id: "main-street", label: "Main Street", detail: "One long winding street and a short side street to the town hall" },
  downtown: { id: "downtown", label: "Downtown Grid", detail: "Harder: square blocks and two long entrances, west and north, meeting at the town hall" },
};

export const MAP_IDS: readonly MapId[] = ["main-street", "downtown"];

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

/** The map the town is on right now. */
export function activeMap(): MapId {
  return sceneSet.active();
}

/** Switch the town to another map: the shell rebuilds the game on it. Returns whether it switched. */
export function chooseMap(id: MapId): boolean {
  return sceneSet.select(id);
}
