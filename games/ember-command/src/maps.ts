import { createSceneSet } from "@jgengine/core/editor/sceneSet";

import backyardJson from "./editor.scene.json";
import frontYardJson from "./frontyard.scene.json";

/**
 * The lawns a battle can be fought on, as the engine's scene set: each is its own scene document
 * (nests, food, the yard's landmarks and hazards, scatter, terrain). Choosing another lawn switches the
 * set and the shell rebuilds the game on it in place (`withSceneSet` in `game.config.ts`). Edit a lawn
 * with the editor CLI's `--scene <file>`.
 */
export type MapId = "backyard" | "front-yard";

export interface MapDef {
  id: MapId;
  label: string;
  detail: string;
}

export const MAPS: Record<MapId, MapDef> = {
  backyard: { id: "backyard", label: "The Backyard", detail: "Grass forests, the garden hose, the sprinkler and the mower lane" },
  "front-yard": { id: "front-yard", label: "The Front Yard", detail: "A scorching driveway crossed only by cool sidewalk cracks, a parked car's moving shade, and wasps in the mailbox" },
};

export const MAP_IDS: readonly MapId[] = ["backyard", "front-yard"];

const STORAGE_KEY = "lawn-order:map";

/** A lawn pinned for this boot: headless runs set `LAWN_MAP`, a capture or a link sets `?map=`. */
function pinnedMap(): string | null {
  try {
    const fromEnv = typeof process === "undefined" ? undefined : process.env?.["LAWN_MAP"];
    if (typeof fromEnv === "string" && fromEnv !== "") return fromEnv;
    return typeof location === "undefined" ? null : new URLSearchParams(location.search).get("map");
  } catch {
    return null;
  }
}

export const sceneSet = createSceneSet<MapId>({
  scenes: {
    backyard: { label: MAPS.backyard.label, document: backyardJson, file: "editor.scene.json" },
    "front-yard": { label: MAPS["front-yard"].label, document: frontYardJson, file: "frontyard.scene.json" },
  },
  defaultId: "backyard",
  initial: pinnedMap(),
  storage: {
    read: () => (typeof localStorage === "undefined" ? null : localStorage.getItem(STORAGE_KEY)),
    write: (id) => {
      if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, id);
    },
  },
});

/** The lawn the battle is on right now. */
export function activeMap(): MapId {
  return sceneSet.active();
}

/** Switch to another lawn: the shell rebuilds the game on it. Returns whether it switched. */
export function chooseMap(id: MapId): boolean {
  return sceneSet.select(id);
}
