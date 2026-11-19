import { devtools } from "../devtools/devtools";
import type { Vec3 } from "../world/geometry";
import {
  createNavMeshQuery,
  type NavMeshData,
  type NavMeshLink,
  type NavMeshPath,
  type NavMeshQuery,
  type NavMeshQueryOptions,
} from "./navMesh";
import type { AuthoredNavLink, NavLinkKind } from "./navAuthoring";

export interface NavRegion {
  min: readonly [number, number];
  max: readonly [number, number];
}

export interface NavRebuildStats {
  added: number;
  removed: number;
  kept: number;
  remap: Int32Array;
}

export interface NavRuntimeSnapshot {
  areaCosts: Record<number, number>;
  maxNodes: number;
  links: AuthoredNavLink[];
  linkCosts: Partial<Record<NavLinkKind, number>>;
  linkSnapRadius: number;
}

export interface NavRuntime {
  readonly mesh: NavMeshData;
  plan(from: Vec3, to: Vec3): NavMeshPath | null;
  findPolygon(point: Vec3): number | null;
  closestPoint(point: Vec3): Vec3 | null;
  raycast(from: Vec3, to: Vec3): boolean;
  /**
   * Exchange the bake for a newer one. The new geometry is authoritative; polygons that survive the
   * re-bake keep their identity through `remap`, so routing state over them stays valid and only the
   * routes crossing changed polygons need re-planning.
   */
  applyMesh(next: NavMeshData): NavRebuildStats;
  links(): readonly NavMeshLink[];
  unresolvedLinks(): readonly string[];
  rebuilds(): number;
  retune(patch: NavRuntimeOptions): void;
  snapshot(): NavRuntimeSnapshot;
  restore(next: NavRuntimeSnapshot): void;
  dispose(): void;
}

export interface NavRuntimeOptions extends NavMeshQueryOptions {
  links?: readonly AuthoredNavLink[];
  linkCosts?: Partial<Record<NavLinkKind, number>>;
  /** How far an authored link end may sit from the mesh before the link is reported unresolved. Default 2. */
  linkSnapRadius?: number;
  /** Register a devtools probe under this name so the perf overlay shows mesh and routing counters. */
  devtoolsName?: string;
}

const DEFAULT_LINK_COSTS: Record<NavLinkKind, number> = { door: 0.5, ladder: 4, jump: 1.5, link: 0 };
const DEFAULT_SNAP_RADIUS = 2;

export interface SceneBake {
  kind: string;
  id: string;
  data: unknown;
}

function finiteNumbers(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

function isPolygonList(value: unknown, vertexCount: number): value is number[][] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (ring) =>
      Array.isArray(ring) &&
      ring.length >= 3 &&
      ring.every((index) => typeof index === "number" && Number.isInteger(index) && index >= 0 && index < vertexCount),
  );
}

/** @capability navmesh-from-scene read the editor's baked nav mesh off a scene document */
export function navMeshFromBake(bakes: readonly SceneBake[] | undefined, id = "main"): NavMeshData | null {
  const bake = bakes?.find((entry) => entry.kind === "nav" && entry.id === id);
  if (bake === undefined) return null;
  if (bake.data === null || typeof bake.data !== "object") throw new Error(`nav bake "${id}" has no data object`);
  const data = bake.data as Partial<NavMeshData>;
  if (!finiteNumbers(data.verts) || data.verts.length % 3 !== 0) {
    throw new Error(`nav bake "${id}" verts must be finite xyz triples`);
  }
  const vertexCount = data.verts.length / 3;
  if (!isPolygonList(data.polys, vertexCount)) throw new Error(`nav bake "${id}" polys must index its verts`);
  if (data.links !== undefined && !Array.isArray(data.links)) throw new Error(`nav bake "${id}" links must be an array`);
  const links: NavMeshLink[] = (data.links ?? []).map((link) => ({
    from: link.from,
    to: link.to,
    ...(link.cost === undefined ? {} : { cost: link.cost }),
    ...(link.start === undefined ? {} : { start: link.start }),
    ...(link.end === undefined ? {} : { end: link.end }),
    ...(typeof link.id === "string" ? { id: link.id } : {}),
    ...(typeof link.kind === "string" ? { kind: link.kind } : {}),
  }));
  for (const link of links) {
    if (!Number.isInteger(link.from) || !Number.isInteger(link.to)) throw new Error(`nav bake "${id}" links need polygon ids`);
  }
  const areas = data.areas;
  const validAreas = finiteNumbers(areas) && areas.length === data.polys.length;
  return { verts: [...data.verts], polys: data.polys.map((ring) => [...ring]), links, ...(validAreas ? { areas: [...areas] } : {}) };
}

function round(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

function vertexKey(x: number, y: number, z: number): string {
  return `${round(x)}|${round(y)}|${round(z)}`;
}

function polySignature(mesh: NavMeshData, ring: readonly number[]): string {
  if (ring.length === 0) return "";
  const keys: string[] = [];
  let best = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const index = ring[i]!;
    const key = vertexKey(mesh.verts[index * 3] ?? 0, mesh.verts[index * 3 + 1] ?? 0, mesh.verts[index * 3 + 2] ?? 0);
    keys.push(key);
    if (key < keys[best]!) best = i;
  }
  return [...keys.slice(best), ...keys.slice(0, best)].join(";");
}

function linkCost(link: AuthoredNavLink, costs: Readonly<Partial<Record<NavLinkKind, number>>>): number {
  if (link.cost !== undefined && Number.isFinite(link.cost) && link.cost >= 0) return link.cost;
  const kind = link.kind ?? "link";
  const cost = costs[kind] ?? DEFAULT_LINK_COSTS[kind];
  return Number.isFinite(cost) && cost >= 0 ? cost : DEFAULT_LINK_COSTS[kind];
}

function samePoint(a: Vec3 | undefined, b: Vec3 | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function sameLinks(a: readonly NavMeshLink[], b: readonly NavMeshLink[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i]!;
    const right = b[i]!;
    if (left.from !== right.from || left.to !== right.to || left.cost !== right.cost) return false;
    if (left.id !== right.id || left.kind !== right.kind) return false;
    if (!samePoint(left.start, right.start) || !samePoint(left.end, right.end)) return false;
  }
  return true;
}

/** @capability nav-runtime route agents on an editor-baked nav mesh with authored links and re-bakes that keep polygon identity */
export function createNavRuntime(options: NavRuntimeOptions & { mesh: NavMeshData }): NavRuntime {
  let authored: AuthoredNavLink[] = (options.links ?? []).map((link) => ({ ...link }));
  let linkCosts: Partial<Record<NavLinkKind, number>> = { ...(options.linkCosts ?? {}) };
  let snapRadius = Math.max(0, options.linkSnapRadius ?? DEFAULT_SNAP_RADIUS);
  let resolved: NavMeshLink[] = [];
  let unresolved: string[] = [];
  let rebuildCount = 0;
  let planCount = 0;
  let lastPlanMs = 0;
  let mesh: NavMeshData = options.mesh;
  const queryOptions: NavMeshQueryOptions = {
    ...(options.areaCosts === undefined ? {} : { areaCosts: { ...options.areaCosts } }),
    ...(options.maxNodes === undefined ? {} : { maxNodes: options.maxNodes }),
  };
  let query: NavMeshQuery = createNavMeshQuery(mesh, queryOptions);

  function resolveLinks(): void {
    const base = mesh;
    const out: NavMeshLink[] = [];
    const missing: string[] = [];
    const seen = new Set<string>();
    for (const link of authored) {
      const from = query.findPolygon(link.from);
      const to = query.findPolygon(link.to);
      if (from === null || to === null || from === to) {
        missing.push(link.id);
        continue;
      }
      const startSurface = query.closestPoint(link.from);
      const endSurface = query.closestPoint(link.to);
      if (startSurface === null || endSurface === null) {
        missing.push(link.id);
        continue;
      }
      const startGap = Math.hypot(link.from[0] - startSurface[0], link.from[1] - startSurface[1], link.from[2] - startSurface[2]);
      const endGap = Math.hypot(link.to[0] - endSurface[0], link.to[1] - endSurface[1], link.to[2] - endSurface[2]);
      if (startGap > snapRadius || endGap > snapRadius) {
        missing.push(link.id);
        continue;
      }
      const cost = linkCost(link, linkCosts);
      const kind = link.kind ?? "link";
      const pair = `${from}>${to}`;
      if (!seen.has(pair)) {
        seen.add(pair);
        out.push({ from, to, cost, start: link.from, end: link.to, id: link.id, kind });
      }
      const back = `${to}>${from}`;
      if (link.bidirectional === true && !seen.has(back)) {
        seen.add(back);
        out.push({ from: to, to: from, cost, start: link.to, end: link.from, id: link.id, kind });
      }
    }
    resolved = out;
    unresolved = missing;
    if (!sameLinks(base.links, out)) mesh = { ...base, links: out };
    query = createNavMeshQuery(mesh, query.snapshot());
  }

  function probeLine(): string {
    const partial = planCount === 0 ? "no plans" : `${lastPlanMs.toFixed(2)} ms last`;
    return `${mesh.polys.length} polys ${resolved.length} links ${unresolved.length} unresolved ${rebuildCount} rebuilds ${planCount} plans ${partial}`;
  }

  const unregister = options.devtoolsName === undefined ? null : devtools.probes.register(options.devtoolsName, () => probeLine());
  resolveLinks();

  return {
    get mesh() {
      return mesh;
    },
    plan(from, to) {
      const started = performance.now();
      const path = query.findPath(from, to);
      planCount += 1;
      lastPlanMs = performance.now() - started;
      return path;
    },
    findPolygon: (point) => query.findPolygon(point),
    closestPoint: (point) => query.closestPoint(point),
    raycast: (from, to) => query.raycast(from, to),
    applyMesh(next) {
      const previous = mesh;
      const remap = new Int32Array(previous.polys.length).fill(-1);
      const swapped: NavMeshData = {
        verts: [...next.verts],
        polys: next.polys.map((ring) => [...ring]),
        links: [],
        ...(next.areas === undefined ? {} : { areas: [...next.areas] }),
      };
      // Polygon identity is matched on geometry, not array order: a bake numbers its polygons from
      // scratch, so the only stable handle a route can hold is where the polygon actually is.
      const bySignature = new Map<string, number>();
      for (let p = 0; p < swapped.polys.length; p += 1) {
        const key = polySignature(swapped, swapped.polys[p]!);
        if (!bySignature.has(key)) bySignature.set(key, p);
      }
      let kept = 0;
      let removed = 0;
      for (let p = 0; p < previous.polys.length; p += 1) {
        const match = bySignature.get(polySignature(previous, previous.polys[p]!));
        if (match === undefined) removed += 1;
        else {
          remap[p] = match;
          kept += 1;
        }
      }
      mesh = swapped;
      rebuildCount += 1;
      resolveLinks();
      return { added: Math.max(0, swapped.polys.length - kept), removed, kept, remap };
    },
    links: () => resolved,
    unresolvedLinks: () => unresolved,
    rebuilds: () => rebuildCount,
    retune(patch) {
      if (patch.areaCosts !== undefined || patch.maxNodes !== undefined) {
        query.retune({
          ...(patch.areaCosts === undefined ? {} : { areaCosts: { ...patch.areaCosts } }),
          ...(patch.maxNodes === undefined ? {} : { maxNodes: patch.maxNodes }),
        });
      }
      let relink = false;
      if (patch.links !== undefined) {
        authored = patch.links.map((link) => ({ ...link }));
        relink = true;
      }
      if (patch.linkCosts !== undefined) {
        linkCosts = { ...patch.linkCosts };
        relink = true;
      }
      if (patch.linkSnapRadius !== undefined) {
        snapRadius = Math.max(0, patch.linkSnapRadius);
        relink = true;
      }
      if (relink) resolveLinks();
    },
    snapshot() {
      const tuning = query.snapshot();
      return {
        areaCosts: { ...tuning.areaCosts },
        maxNodes: tuning.maxNodes,
        links: authored.map((link) => ({ ...link })),
        linkCosts: { ...linkCosts },
        linkSnapRadius: snapRadius,
      };
    },
    restore(next) {
      authored = next.links.map((link) => ({ ...link }));
      linkCosts = { ...next.linkCosts };
      snapRadius = Math.max(0, next.linkSnapRadius);
      query.restore({ areaCosts: { ...next.areaCosts }, maxNodes: next.maxNodes });
      resolveLinks();
    },
    dispose() {
      unregister?.();
    },
  };
}
