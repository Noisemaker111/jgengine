import type { LibraryEntry } from "./assetLibrary";
import { rocketboxClipOf } from "./libraryRocketbox";

/**
 * A library id as a folder-safe lowercase slug (`Bricks090` → `bricks090`), the shipped catalog's material id scheme.
 *
 * @internal
 */
export function lowerLibraryId(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/** Where a pulled library entry is served from, relative to a game's `public/`. */
export interface LibraryServedPath {
  /** The folder `assets pull` fills (and the shared asset store links). */
  dir: string;
  /** The URL a game loads: a model file, a material folder, an HDRI or an icon. */
  url: string;
}

/**
 * The served folder and URL for a library entry. Pack entries (KayKit, Quaternius, game-icons) share
 * their pack's folder; everything else gets its own.
 *
 * @capability library-served-path the public folder and URL a pulled library asset is served from
 */
export function libraryServedPath(entry: LibraryEntry): LibraryServedPath {
  if (entry.pack !== undefined) {
    const kindDir = entry.kind === "icon" ? "sprites" : "models";
    return { dir: `${kindDir}/${entry.pack}`, url: `/${kindDir}/${entry.pack}/${entry.file ?? ""}` };
  }
  const id = entry.id;
  switch (entry.source) {
    case "ambientcg":
      if (entry.kind === "hdri") return { dir: `hdri/ambientcg/${id}`, url: `/hdri/ambientcg/${id}/${id}.exr` };
      return { dir: `materials/ambientcg-${lowerLibraryId(id)}`, url: `/materials/ambientcg-${lowerLibraryId(id)}` };
    case "polyhaven":
      if (entry.kind === "hdri") return { dir: `hdri/polyhaven/${id}`, url: `/hdri/polyhaven/${id}/${id}.hdr` };
      if (entry.kind === "material") return { dir: `materials/polyhaven-${lowerLibraryId(id)}`, url: `/materials/polyhaven-${lowerLibraryId(id)}` };
      return { dir: `models/library/polyhaven/${id}`, url: `/models/library/polyhaven/${id}/near.gltf` };
    case "rocketbox": {
      const name = id.split("/").pop() ?? id;
      if (entry.kind === "animation") {
        const clip = rocketboxClipOf(entry);
        return { dir: `animations/rocketbox/${clip.folder}/${clip.name}`, url: `/animations/rocketbox/${clip.folder}/${clip.name}/clip.glb` };
      }
      return { dir: `models/library/rocketbox/${name}`, url: `/models/library/rocketbox/${name}/model.glb` };
    }
    case "sketchfab":
      return { dir: `models/sketchfab/${id}`, url: `/models/sketchfab/${id}/model.glb` };
    case "kaykit":
    case "quaternius":
    case "gameicons":
      throw new Error(`${entry.key} has no pack; its record must name the pack that holds it`);
  }
}

