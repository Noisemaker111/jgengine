/**
 * Navigation authored in the editor scene: `nav_area` box volumes that add walkable floor or block
 * it, and `nav_link` paths that connect two spots off the mesh (a door, a ladder, a jump across a
 * gap). Pure data — the bake (`@jgengine/navbake`), a grid tile builder (`navTileFromGrid`) and
 * `createNavRuntime` all read the same authored objects, so no game keeps nav coordinates.
 */
import { parseParams, validateParams, type ParamSchema } from "../generator/paramSchema";
import type { Vec3 } from "../world/geometry";
import type { NavMeshData, NavMeshLink } from "./navMesh";

/** What an authored off-mesh connection crosses; the runtime prices it by kind unless the author sets a cost. */
export type NavLinkKind = "door" | "ladder" | "jump" | "link";

/**
 * A connection the scene author places between two spots — a door through a wall, a ladder to a
 * deck, a jump across a gap. Authored as world points, not polygon ids, so it survives a re-bake:
 * `NavRuntime.applyMesh` resolves each end onto the nearest walkable polygon.
 */
export interface AuthoredNavLink {
  /** Stable authored id; reported by `unresolvedLinks()` when an end no longer touches the mesh. */
  id: string;
  /** Traversal kind; prices the link when `cost` is absent. Default `"link"`. */
  kind?: NavLinkKind;
  /** World point the agent leaves from. */
  from: Vec3;
  /** World point the agent arrives at. */
  to: Vec3;
  /** Path cost in world units; overrides the kind's price. Non-finite or negative falls back to the kind. */
  cost?: number;
  /** Also crossable from `to` back to `from` at the same price. Default false. */
  bidirectional?: boolean;
}

/**
 * Volume kind of an authored nav area: a box that adds walkable floor (`walkable`) or removes it (`blocked`).
 * @capability nav-authoring author nav-mesh areas and off-mesh links (doors, ladders, jumps) in the editor scene
 */
export const NAV_AREA_KIND = "nav_area";
/** Path kind of an authored off-mesh link: its first point is where the agent leaves, its last where it lands. */
export const NAV_LINK_KIND = "nav_link";

/** What a nav area does to the walkable surface under it. */
export type NavAreaMode = "walkable" | "blocked";

/** Every link kind the runtime prices. */
export const NAV_LINK_KINDS: readonly NavLinkKind[] = ["door", "ladder", "jump", "link"];

/** Inspector and `meta` schema of a `nav_area` volume. */
export const NAV_AREA_SCHEMA: ParamSchema = {
  fields: [
    {
      type: "select",
      key: "mode",
      label: "mode",
      options: [
        { value: "blocked", label: "Blocked" },
        { value: "walkable", label: "Walkable" },
      ],
      default: "blocked",
      vary: false,
    },
    { type: "number", key: "area", label: "area id", step: 1, min: 0, default: 0, vary: false },
  ],
};

/** Inspector and `meta` schema of a `nav_link` path. */
export const NAV_LINK_SCHEMA: ParamSchema = {
  fields: [
    {
      type: "select",
      key: "linkKind",
      label: "crossing",
      options: [
        { value: "door", label: "Door" },
        { value: "ladder", label: "Ladder" },
        { value: "jump", label: "Jump" },
        { value: "link", label: "Link" },
      ],
      default: "door",
      vary: false,
    },
    { type: "bool", key: "bidirectional", label: "both ways", default: true, vary: false },
    { type: "number", key: "cost", label: "cost (-1 prices by kind)", step: 0.5, min: -1, default: -1, vary: false },
  ],
};

/** One authored nav area read off a `nav_area` box volume. */
export interface AuthoredNavArea {
  id: string;
  mode: NavAreaMode;
  /** Area id stamped on walkable polygons it covers, priced by `areaCosts`; 0 leaves the default price. */
  area: number;
  /** Box corners, `center ± halfExtents`. */
  min: Vec3;
  max: Vec3;
  /** Height of the floor a walkable area adds: the volume's `center.y`. */
  floorY: number;
}

/** One authored nav object the reader skipped, and why. */
export interface NavAuthoringIssue {
  id: string;
  message: string;
}

/** Every nav area and link a scene authors, plus the objects that could not be read. */
export interface NavAuthoring {
  areas: AuthoredNavArea[];
  links: AuthoredNavLink[];
  issues: NavAuthoringIssue[];
}

type NavPoint = { x: number; y: number; z: number };

/** The slice of an editor volume a nav area reads (an `EditorVolume` fits). */
export interface NavAuthoringVolume {
  id: string;
  kind: string;
  shape: string;
  center: NavPoint;
  halfExtents?: NavPoint | undefined;
  meta?: Record<string, unknown> | undefined;
}

/** The slice of an editor path a nav link reads (an `EditorPath` fits). */
export interface NavAuthoringPath {
  id: string;
  kind: string;
  points: readonly NavPoint[];
  meta?: Record<string, unknown> | undefined;
}

/** The slice of a scene document nav authoring reads (an `EditorDocument` fits). */
export interface NavAuthoringDocument {
  volumes: readonly NavAuthoringVolume[];
  paths: readonly NavAuthoringPath[];
}

type NavDocument = NavAuthoringDocument;

function finitePoint(point: NavPoint | undefined): boolean {
  return point !== undefined && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

function readArea(volume: NavAuthoringVolume, issues: NavAuthoringIssue[]): AuthoredNavArea | null {
  const metaIssues = validateParams(NAV_AREA_SCHEMA, volume.meta);
  for (const issue of metaIssues) issues.push({ id: volume.id, message: `${issue.key}: ${issue.message}` });
  if (metaIssues.length > 0) return null;
  const half = volume.halfExtents;
  if (volume.shape !== "box" || half === undefined) {
    issues.push({ id: volume.id, message: "a nav area must be a box volume" });
    return null;
  }
  if (!finitePoint(volume.center) || !finitePoint(half) || !(half.x > 0) || !(half.z > 0) || !(half.y >= 0)) {
    issues.push({ id: volume.id, message: "a nav area needs a finite center and positive half extents" });
    return null;
  }
  const params = parseParams(NAV_AREA_SCHEMA, volume.meta);
  const area = Math.floor(params["area"] as number);
  const c = volume.center;
  return {
    id: volume.id,
    mode: params["mode"] === "walkable" ? "walkable" : "blocked",
    area,
    min: [c.x - half.x, c.y - half.y, c.z - half.z],
    max: [c.x + half.x, c.y + half.y, c.z + half.z],
    floorY: c.y,
  };
}

function readLink(path: NavAuthoringPath, issues: NavAuthoringIssue[]): AuthoredNavLink | null {
  const metaIssues = validateParams(NAV_LINK_SCHEMA, path.meta);
  for (const issue of metaIssues) issues.push({ id: path.id, message: `${issue.key}: ${issue.message}` });
  if (metaIssues.length > 0) return null;
  const first = path.points[0];
  const last = path.points[path.points.length - 1];
  if (path.points.length < 2 || first === undefined || last === undefined) {
    issues.push({ id: path.id, message: "a nav link needs a start and an end point" });
    return null;
  }
  if (!finitePoint(first) || !finitePoint(last)) {
    issues.push({ id: path.id, message: "a nav link's ends must be finite" });
    return null;
  }
  if (first.x === last.x && first.y === last.y && first.z === last.z) {
    issues.push({ id: path.id, message: "a nav link's ends must differ" });
    return null;
  }
  const params = parseParams(NAV_LINK_SCHEMA, path.meta);
  const cost = params["cost"] as number;
  return {
    id: path.id,
    kind: params["linkKind"] as NavLinkKind,
    from: [first.x, first.y, first.z],
    to: [last.x, last.y, last.z],
    bidirectional: params["bidirectional"] === true,
    ...(cost >= 0 ? { cost } : {}),
  };
}

/**
 * Read every `nav_area` volume and `nav_link` path off a scene document. Objects that do not
 * validate are skipped and reported in `issues` rather than thrown, so one bad gizmo cannot take the
 * whole level's navigation down; `include` narrows the read (a game with several floors reads one).
 */
export function navAuthoringFromDocument(
  document: NavDocument,
  include: (object: NavAuthoringVolume | NavAuthoringPath) => boolean = () => true,
): NavAuthoring {
  const issues: NavAuthoringIssue[] = [];
  const areas: AuthoredNavArea[] = [];
  const links: AuthoredNavLink[] = [];
  for (const volume of document.volumes) {
    if (volume.kind !== NAV_AREA_KIND || !include(volume)) continue;
    const area = readArea(volume, issues);
    if (area !== null) areas.push(area);
  }
  for (const path of document.paths) {
    if (path.kind !== NAV_LINK_KIND || !include(path)) continue;
    const link = readLink(path, issues);
    if (link !== null) links.push(link);
  }
  return { areas, links, issues };
}

/** The authored off-mesh links of a scene document, ready for `createNavRuntime`'s `links`. */
export function navLinksFromDocument(
  document: NavDocument,
  include?: (object: NavAuthoringVolume | NavAuthoringPath) => boolean,
): AuthoredNavLink[] {
  return navAuthoringFromDocument(document, include).links;
}

/** Problems that keep a scene's nav objects from being read; empty means every one is valid. */
export function validateNavAuthoring(document: NavDocument): NavAuthoringIssue[] {
  return navAuthoringFromDocument(document).issues;
}

function insideXZ(area: AuthoredNavArea, x: number, z: number): boolean {
  return x >= area.min[0] && x <= area.max[0] && z >= area.min[2] && z <= area.max[2];
}

/**
 * The area id authored at a ground point, for a builder whose walkable surface is a rule
 * (`navTileFromGrid`'s `areaAt`): `null` inside a blocked area, the covering walkable area's id
 * (the last one authored wins) inside a walkable one, and the builder's own answer elsewhere.
 * Blocked beats walkable where they overlap.
 */
export function navAreaAt(areas: readonly AuthoredNavArea[], x: number, z: number, fallback: number | null): number | null {
  let walkable: number | null = null;
  for (const area of areas) {
    if (!insideXZ(area, x, z)) continue;
    if (area.mode === "blocked") return null;
    walkable = area.area;
  }
  return walkable ?? fallback;
}

/** Indexed triangles for a recast bake, as `bakeNavMesh` takes them. */
export interface NavBakeGeometry {
  positions: number[];
  indices: number[];
}

const BOX_FACES = [
  [0, 2, 3, 1],
  [4, 5, 7, 6],
  [0, 1, 5, 4],
  [2, 6, 7, 3],
  [0, 4, 6, 2],
  [1, 3, 7, 5],
] as const;

/**
 * The triangles authored areas add to a bake: each walkable area is a floor quad at its `floorY`
 * facing up, and each blocked area a closed box, so the baker erodes the walkable surface around it.
 * Append them to the scene's own geometry with {@link mergeNavGeometry}.
 */
export function navAreaGeometry(areas: readonly AuthoredNavArea[]): NavBakeGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const area of areas) {
    const base = positions.length / 3;
    const [x0, y0, z0] = area.min;
    const [x1, y1, z1] = area.max;
    if (area.mode === "walkable") {
      const y = area.floorY;
      positions.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
      // Counter-clockwise seen from above, so the face points up and recast reads it as floor.
      indices.push(base, base + 3, base + 2, base, base + 2, base + 1);
      continue;
    }
    for (let corner = 0; corner < 8; corner += 1) {
      positions.push(corner & 1 ? x1 : x0, corner & 2 ? y1 : y0, corner & 4 ? z1 : z0);
    }
    for (const face of BOX_FACES) {
      indices.push(base + face[0], base + face[1], base + face[2], base + face[0], base + face[2], base + face[3]);
    }
  }
  return { positions, indices };
}

/** Concatenate indexed triangle sets into one, re-basing each set's indices. */
export function mergeNavGeometry(...sets: readonly { positions: readonly number[]; indices: readonly number[] }[]): NavBakeGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const set of sets) {
    const base = positions.length / 3;
    for (const value of set.positions) positions.push(value);
    for (const index of set.indices) indices.push(base + index);
  }
  return { positions, indices };
}

/**
 * Apply authored areas to a baked or built mesh: polygons standing in a blocked area (its footprint,
 * from its bottom to `climb` over its top) are removed, and polygons on a walkable area take its area
 * id. A polygon is judged by its centre, so an area should cover whole polygons where its price matters.
 * Links touching a removed polygon are dropped; the rest are re-indexed.
 */
export function applyNavAreas(mesh: NavMeshData, areas: readonly AuthoredNavArea[], options: { climb?: number } = {}): NavMeshData {
  if (areas.length === 0) return mesh;
  const climb = Math.max(0, options.climb ?? 0.5);
  const remap = new Int32Array(mesh.polys.length).fill(-1);
  const polys: number[][] = [];
  const out: number[] = [];
  let stamped = mesh.areas !== undefined;
  for (let p = 0; p < mesh.polys.length; p += 1) {
    const ring = mesh.polys[p]!;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const index of ring) {
      cx += mesh.verts[index * 3] ?? 0;
      cy += mesh.verts[index * 3 + 1] ?? 0;
      cz += mesh.verts[index * 3 + 2] ?? 0;
    }
    const n = Math.max(1, ring.length);
    cx /= n;
    cy /= n;
    cz /= n;
    let blocked = false;
    let area = mesh.areas?.[p] ?? 0;
    for (const entry of areas) {
      if (!insideXZ(entry, cx, cz)) continue;
      if (entry.mode === "blocked") {
        if (cy >= entry.min[1] - climb && cy <= entry.max[1] + climb) blocked = true;
      } else if (entry.area !== 0 && cy >= entry.min[1] - climb && cy <= entry.max[1] + climb) {
        area = entry.area;
        stamped = true;
      }
    }
    if (blocked) continue;
    remap[p] = polys.length;
    polys.push([...ring]);
    out.push(area);
  }
  const links: NavMeshLink[] = [];
  for (const link of mesh.links) {
    const from = remap[link.from] ?? -1;
    const to = remap[link.to] ?? -1;
    if (from >= 0 && to >= 0) links.push({ ...link, from, to });
  }
  return { verts: [...mesh.verts], polys, links, ...(stamped ? { areas: out } : {}) };
}
