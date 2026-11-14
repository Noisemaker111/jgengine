/**
 * The streets a day can be worked on. Each map is its own scene document (roads, plots, buildings,
 * scatter, terrain) and the town's world model is built from that map's plots when the game loads,
 * so a map is chosen before boot: `?map=<id>` in the URL, else the last map the player picked.
 * Picking another map stores the choice and reloads, the way a different level loads.
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

function isMapId(value: unknown): value is MapId {
  return typeof value === "string" && (MAP_IDS as readonly string[]).includes(value);
}

/** The map this boot runs: the URL's `?map=`, else the stored pick, else Main Street. */
export function resolveActiveMap(): MapId {
  try {
    // Headless runs (balance sims, staged captures) pick a map with DND_MAP=<id>.
    const fromEnv = typeof process === "undefined" ? undefined : process.env?.["DND_MAP"];
    if (isMapId(fromEnv)) return fromEnv;
    const search = typeof location === "undefined" ? "" : location.search;
    const fromUrl = new URLSearchParams(search).get("map");
    if (isMapId(fromUrl)) return fromUrl;
    const stored = typeof localStorage === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
    if (isMapId(stored)) return stored;
  } catch {
    // Storage can be blocked (private windows, previews): Main Street it is.
  }
  return "main-street";
}

export const ACTIVE_MAP: MapId = resolveActiveMap();

/**
 * Choose the map the next day runs on. The same map changes nothing; another one is stored and the
 * page reloads onto it (dropping any `?map=` that would pin the old one). Returns whether it reloads.
 */
export function chooseMap(id: MapId): boolean {
  if (id === ACTIVE_MAP) return false;
  try {
    localStorage.setItem(STORAGE_KEY, id);
    const url = new URL(location.href);
    url.searchParams.set("map", id);
    location.replace(url.toString());
    return true;
  } catch {
    return false;
  }
}
