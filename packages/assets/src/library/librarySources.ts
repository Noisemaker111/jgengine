import type { LibraryLicense } from "./libraryLicense";

/** Where a library entry's bytes come from. */
export type LibrarySourceId =
  | "ambientcg"
  | "polyhaven"
  | "gameicons"
  | "sketchfab"
  | "kaykit"
  | "quaternius"
  | "rocketbox"
  | "makehuman"
  | "smithsonian";

/** What a library entry is, which decides where it is served and which browser tab shows it. */
export type LibraryKind = "model" | "character" | "animation" | "material" | "decal" | "hdri" | "icon";

/** Every {@link LibraryKind}, in browser tab order. */
export const LIBRARY_KINDS: readonly LibraryKind[] = ["model", "character", "animation", "material", "decal", "hdri", "icon"];

/** One upstream the library indexes. `{id}` in a template is replaced by the entry's native id. */
export interface LibrarySource {
  id: LibrarySourceId;
  title: string;
  homepage: string;
  /** Licence every entry carries unless the entry names its own. */
  license: LibraryLicense;
  /** Author every entry carries unless the entry names its own. */
  author: string;
  /** Page template for an entry; credits link it. */
  page: string;
  /** Preview image template, when the provider publishes one per entry. */
  thumbnail?: string;
  /** The kinds {@link thumbnail} applies to; every kind when absent. */
  thumbnailKinds?: readonly LibraryKind[];
  /** Whether the licence lets JGengine mirror the bytes (every accepted licence does; kept explicit for audits). */
  rehost: boolean;
  /** Environment variable holding the API token `assets pull` needs, when the provider gates downloads. */
  token?: string;
  /** Pinned upstream revision the index and thumbnails were read at, when the source is a git repo. */
  revision?: string;
}

/** The game-icons.net repository commit the icon index and thumbnails are pinned to. */
export const GAMEICONS_REVISION = "82d948812bfe3f269ef8f731dcdb07b08160edc4";

/** The Microsoft Rocketbox commit the avatar index and previews are pinned to (the same one `rocketboxPull` reads). */
export const ROCKETBOX_REVISION = "0943055db6ec570bcef9f2c8b41c9e5467c808f9";

/** The MakeHuman commit the pinned people are built from (the same one `makehumanPull` reads). */
export const MAKEHUMAN_REVISION = "a8bc2d54ff0ac92e78ff71431b1023eda42bf482";

/** The upstreams the shared asset library indexes, in ingest order. */
export const ASSET_LIBRARY_SOURCES: readonly LibrarySource[] = [
  {
    id: "ambientcg",
    title: "ambientCG",
    homepage: "https://ambientcg.com",
    license: "CC0-1.0",
    author: "Lennart Demes (ambientCG)",
    page: "https://ambientcg.com/a/{id}",
    thumbnail: "https://acg-media.struffelproductions.com/file/ambientCG-Web/media/thumbnail/128-PNG/{id}.png",
    rehost: true,
  },
  {
    id: "polyhaven",
    title: "Poly Haven",
    homepage: "https://polyhaven.com",
    license: "CC0-1.0",
    author: "Poly Haven",
    page: "https://polyhaven.com/a/{id}",
    thumbnail: "https://cdn.polyhaven.com/asset_img/thumbs/{id}.png?width=128&height=128",
    rehost: true,
  },
  {
    id: "gameicons",
    title: "game-icons.net",
    homepage: "https://game-icons.net",
    license: "CC-BY-3.0",
    author: "game-icons.net contributors",
    page: "https://game-icons.net/1x1/{id}.html",
    thumbnail: `https://cdn.jsdelivr.net/gh/game-icons/icons@${GAMEICONS_REVISION}/{id}.svg`,
    rehost: true,
    revision: GAMEICONS_REVISION,
  },
  {
    id: "sketchfab",
    title: "Sketchfab (CC0 and CC BY models)",
    homepage: "https://sketchfab.com",
    license: "CC-BY-4.0",
    author: "Sketchfab creator",
    page: "https://sketchfab.com/3d-models/{id}",
    rehost: true,
    token: "SKETCHFAB_TOKEN",
  },
  {
    id: "rocketbox",
    title: "Microsoft Rocketbox Avatar Library",
    homepage: "https://github.com/microsoft/Microsoft-Rocketbox",
    license: "MIT",
    author: "Microsoft (Rocketbox Studios GmbH)",
    page: `https://github.com/microsoft/Microsoft-Rocketbox/tree/${ROCKETBOX_REVISION}/Assets/{id}`,
    thumbnail: `https://cdn.jsdelivr.net/gh/microsoft/Microsoft-Rocketbox@${ROCKETBOX_REVISION}/Assets/{id}/{name}.png`,
    thumbnailKinds: ["character"],
    rehost: true,
    revision: ROCKETBOX_REVISION,
  },
  {
    id: "makehuman",
    title: "MakeHuman (CC0 people built by JGengine)",
    homepage: "http://www.makehumancommunity.org",
    license: "CC0-1.0",
    author: "MakeHuman Community (Data Collection AB, Joel Palmius, Jonas Hauquier; base by Manuel Bastioni)",
    page: `https://github.com/makehumancommunity/makehuman/tree/${MAKEHUMAN_REVISION}/makehuman/data`,
    rehost: true,
    revision: MAKEHUMAN_REVISION,
  },
  {
    id: "smithsonian",
    title: "Smithsonian Open Access (CC0 3D)",
    homepage: "https://www.si.edu/openaccess",
    license: "CC0-1.0",
    author: "Smithsonian Institution",
    page: "https://3d-api.si.edu/voyager/3d_package:{id}",
    thumbnail: "https://3d-api.si.edu/content/document/3d_package:{id}/scene-image-thumb.jpg",
    rehost: true,
  },
  {
    id: "kaykit",
    title: "KayKit",
    homepage: "https://kaylousberg.com/game-assets",
    license: "CC0-1.0",
    author: "Kay Lousberg",
    page: "https://kaylousberg.com/game-assets",
    rehost: true,
  },
  {
    id: "quaternius",
    title: "Quaternius (CC0 releases)",
    homepage: "https://quaternius.com",
    license: "CC0-1.0",
    author: "Quaternius",
    page: "https://quaternius.com",
    rehost: true,
  },
];

const byId: ReadonlyMap<string, LibrarySource> = new Map(ASSET_LIBRARY_SOURCES.map((source) => [source.id, source]));

/** The library source with this id, or undefined. */
export function librarySource(id: string): LibrarySource | undefined {
  return byId.get(id);
}

/**
 * Fills a source template: `{id}` is the entry's native id with its path separators kept, `{name}` its
 * last path segment; everything else is URL-encoded.
 *
 * @internal
 */
export function fillLibraryTemplate(template: string, id: string): string {
  const parts = id.split("/").map(encodeURIComponent);
  return template.replace("{id}", parts.join("/")).replace("{name}", parts[parts.length - 1] ?? "");
}
