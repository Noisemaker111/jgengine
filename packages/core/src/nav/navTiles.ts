import { createWorldStreamer, gridCellId, gridShards, type StreamFocus, type WorldStreamer, type WorldStreamerState, type WorldStreamerTuning } from "../visibility/streamer";
import type { NavMeshData } from "./navMesh";
import { createNavRuntime, type NavRegion, type NavRuntime, type NavRuntimeOptions } from "./navRuntime";

/** The XZ square one nav tile covers. */
export interface NavTileBounds {
  min: readonly [number, number];
  max: readonly [number, number];
}

/** The tile a builder is asked for: its grid id and footprint. */
export interface NavTileRequest {
  id: string;
  bounds: NavTileBounds;
}

/**
 * Builds one tile's polygons from the world as it is now. Its vertices are world coordinates and stay
 * inside the tile's bounds; polygons meeting a tile border are stitched to the neighbouring tile's.
 */
export type NavTileBuilder = (tile: NavTileRequest) => NavMeshData;

/** Where built tiles are kept, so a tile that streams back in is not rebuilt. Inject one to persist tiles. */
export interface NavTileStore {
  get(id: string): NavMeshData | undefined;
  set(id: string, tile: NavMeshData): void;
  delete(id: string): void;
}

/** Which tiles stream in around focus points, for {@link NavTiles.follow}. */
export interface NavTileStreaming extends WorldStreamerTuning {
  /** The world area tiles may cover. */
  area: NavTileBounds;
}

/** Options for {@link createNavTiles}. */
export interface NavTilesOptions extends NavRuntimeOptions {
  /** Tile edge in metres; tiles align to world origin. */
  tileSize: number;
  build: NavTileBuilder;
  /** Built-tile storage. Default an in-memory map. */
  store?: NavTileStore;
  /** Stream tiles in and out around focus points with {@link NavTiles.follow}. */
  streaming?: NavTileStreaming;
  /** Vertices of neighbouring tiles closer than this weld into one. Default 0.001 m. */
  weld?: number;
}

/** What the tiled mesh holds and what its last changes cost. */
export interface NavTileStats {
  tiles: number;
  polys: number;
  builds: number;
  lastBuildMs: number;
  lastComposeMs: number;
}

/** Plain JSON state of a {@link NavTiles}: the routed tiles, the runtime's tuning and the streamer's residency. */
export interface NavTilesSnapshot {
  tiles: string[];
  runtime: ReturnType<NavRuntime["snapshot"]>;
  streaming: WorldStreamerState | null;
}

/** A nav mesh kept as tiles: built, stored, rebuilt and streamed one tile at a time, routed as one mesh. */
export interface NavTiles {
  /** The routing seam over every loaded tile: `plan`, `findPolygon`, `raycast` and the rest work across tile borders. */
  readonly runtime: NavRuntime;
  /** The id of the tile holding a world point. */
  tileAt(x: number, z: number): string;
  /** Route the given tiles in, building any the store does not hold. Returns the ids newly loaded. */
  load(ids: readonly string[]): string[];
  /** Take the given tiles out of routing; their built data stays stored. Returns the ids removed. */
  unload(ids: readonly string[]): string[];
  /** Rebuild only the tiles a changed region touches; stored tiles there that are not loaded are dropped. Returns the rebuilt ids. */
  invalidate(region: NavRegion): string[];
  /** Load and unload tiles around focus points within the streaming budget. Throws without `streaming`. */
  follow(focus: StreamFocus | readonly StreamFocus[]): { load: string[]; unload: string[] };
  loaded(): string[];
  stats(): NavTileStats;
  snapshot(): NavTilesSnapshot;
  restore(next: NavTilesSnapshot): void;
  dispose(): void;
}

function tileBounds(id: string, size: number): NavTileBounds {
  const [col = 0, row = 0] = id.split(",").map(Number);
  return { min: [col * size, row * size], max: [(col + 1) * size, (row + 1) * size] };
}

function memoryStore(): NavTileStore {
  const tiles = new Map<string, NavMeshData>();
  return { get: (id) => tiles.get(id), set: (id, tile) => void tiles.set(id, tile), delete: (id) => void tiles.delete(id) };
}

/**
 * Merge tiles into one mesh: vertices closer than `weld` become one, and a polygon edge running along
 * a tile border is split at every neighbouring-tile vertex lying on it, so the two sides share edges
 * exactly and the mesh query walks across the border as if it were one bake.
 * @internal
 */
export function composeNavTiles(tiles: readonly NavMeshData[], tileSize: number, weld = 0.001): NavMeshData {
  const verts: number[] = [];
  const polys: number[][] = [];
  const areas: number[] = [];
  const index = new Map<string, number>();
  const quant = (value: number) => Math.round(value / weld);
  const borderLines = new Map<string, { along: number; vertex: number }[]>();
  const onLine = (value: number) => {
    const k = Math.round(value / tileSize);
    return Math.abs(value - k * tileSize) <= weld ? k : null;
  };
  const vertexOf = (x: number, y: number, z: number): number => {
    const key = `${quant(x)},${quant(y)},${quant(z)}`;
    const known = index.get(key);
    if (known !== undefined) return known;
    const id = verts.length / 3;
    verts.push(x, y, z);
    index.set(key, id);
    const kx = onLine(x);
    const kz = onLine(z);
    if (kx !== null) pushLine(`x${kx}`, z, id);
    if (kz !== null) pushLine(`z${kz}`, x, id);
    return id;
  };
  const pushLine = (key: string, along: number, vertex: number) => {
    const line = borderLines.get(key);
    if (line === undefined) borderLines.set(key, [{ along, vertex }]);
    else line.push({ along, vertex });
  };
  for (const tile of tiles) {
    const local: number[] = [];
    for (let i = 0; i + 2 < tile.verts.length; i += 3) local.push(vertexOf(tile.verts[i] ?? 0, tile.verts[i + 1] ?? 0, tile.verts[i + 2] ?? 0));
    tile.polys.forEach((ring, p) => {
      polys.push(ring.map((v) => local[v] ?? 0));
      areas.push(tile.areas?.[p] ?? 0);
    });
  }
  for (const line of borderLines.values()) line.sort((a, b) => a.along - b.along);
  const split = (ring: number[]): number[] => {
    const out: number[] = [];
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i] ?? 0;
      const b = ring[(i + 1) % ring.length] ?? 0;
      out.push(a);
      const ax = verts[a * 3] ?? 0, az = verts[a * 3 + 2] ?? 0, bx = verts[b * 3] ?? 0, bz = verts[b * 3 + 2] ?? 0;
      const kx = onLine(ax) !== null && onLine(ax) === onLine(bx) && Math.abs(ax - bx) <= weld ? onLine(ax) : null;
      const kz = kx === null && onLine(az) !== null && onLine(az) === onLine(bz) && Math.abs(az - bz) <= weld ? onLine(az) : null;
      const line = kx !== null ? borderLines.get(`x${kx}`) : kz !== null ? borderLines.get(`z${kz}`) : undefined;
      if (line === undefined) continue;
      const from = kx !== null ? az : ax;
      const to = kx !== null ? bz : bx;
      const lo = Math.min(from, to) + weld;
      const hi = Math.max(from, to) - weld;
      const inside = line.filter((entry) => entry.along > lo && entry.along < hi && entry.vertex !== a && entry.vertex !== b);
      if (from > to) inside.reverse();
      for (const entry of inside) out.push(entry.vertex);
    }
    return out;
  };
  return { verts, polys: polys.map(split), links: [], areas };
}

/**
 * A nav mesh kept as square tiles: each tile is built by the game's builder from the world as it is
 * now and stored, a changed region rebuilds only the tiles it touches, tiles stream in and out around
 * focus points within a per-update budget, and every loaded tile is stitched into the one
 * {@link NavRuntime} agents already route on, so a path crosses tile borders and polygons that survive
 * a change keep their ids.
 * @capability navmesh-tiles build, store, rebuild and stream a nav mesh one tile at a time and route across tile borders
 */
export function createNavTiles(options: NavTilesOptions): NavTiles {
  const size = options.tileSize;
  if (!(size > 0) || !Number.isFinite(size)) throw new RangeError("createNavTiles: tileSize must be positive and finite");
  const store = options.store ?? memoryStore();
  const weld = options.weld ?? 0.001;
  const loaded = new Set<string>();
  const runtime = createNavRuntime({ ...options, mesh: { verts: [], polys: [], links: [] } });
  const streamer: WorldStreamer | null =
    options.streaming === undefined
      ? null
      : createWorldStreamer({ ...options.streaming, shards: gridShards({ min: options.streaming.area.min, max: options.streaming.area.max, cellSize: size }) });
  let builds = 0;
  let lastBuildMs = 0;
  let lastComposeMs = 0;

  const tileData = (id: string, rebuild: boolean): NavMeshData => {
    const known = rebuild ? undefined : store.get(id);
    if (known !== undefined) return known;
    const started = performance.now();
    const built = options.build({ id, bounds: tileBounds(id, size) });
    lastBuildMs = performance.now() - started;
    builds += 1;
    store.set(id, built);
    return built;
  };

  const compose = () => {
    const started = performance.now();
    const ids = [...loaded].sort();
    runtime.applyMesh(composeNavTiles(ids.map((id) => tileData(id, false)), size, weld));
    lastComposeMs = performance.now() - started;
  };

  const loadIds = (ids: readonly string[]): string[] => {
    const added = ids.filter((id) => !loaded.has(id));
    for (const id of added) {
      tileData(id, false);
      loaded.add(id);
    }
    return added;
  };
  const unloadIds = (ids: readonly string[]): string[] => {
    const removed = ids.filter((id) => loaded.has(id));
    for (const id of removed) loaded.delete(id);
    return removed;
  };

  return {
    runtime,
    tileAt: (x, z) => gridCellId(x, z, size),
    load(ids) {
      const added = loadIds(ids);
      if (added.length > 0) compose();
      return added;
    },
    unload(ids) {
      const removed = unloadIds(ids);
      if (removed.length > 0) compose();
      return removed;
    },
    invalidate(region) {
      const rebuilt: string[] = [];
      for (let row = Math.floor(region.min[1] / size); row <= Math.floor(region.max[1] / size); row += 1) {
        for (let col = Math.floor(region.min[0] / size); col <= Math.floor(region.max[0] / size); col += 1) {
          const id = `${col},${row}`;
          if (loaded.has(id)) {
            tileData(id, true);
            rebuilt.push(id);
          } else store.delete(id);
        }
      }
      if (rebuilt.length > 0) compose();
      return rebuilt;
    },
    follow(focus) {
      if (streamer === null) throw new Error("createNavTiles: follow needs the streaming option");
      const update = streamer.update(focus);
      const unload = unloadIds(update.unload);
      const load = loadIds(update.load);
      if (load.length > 0 || unload.length > 0) compose();
      return { load, unload };
    },
    loaded: () => [...loaded].sort(),
    stats: () => ({ tiles: loaded.size, polys: runtime.mesh.polys.length, builds, lastBuildMs, lastComposeMs }),
    snapshot: () => ({ tiles: [...loaded].sort(), runtime: runtime.snapshot(), streaming: streamer?.snapshot() ?? null }),
    restore(next) {
      loaded.clear();
      for (const id of next.tiles) loaded.add(id);
      if (next.streaming !== null) streamer?.restore(next.streaming);
      runtime.restore(next.runtime);
      compose();
    },
    dispose() {
      runtime.dispose();
    },
  };
}

/** Options for {@link navTileFromGrid}. */
export interface NavGridTileOptions {
  bounds: NavTileBounds;
  /** Sample spacing in metres; the tile edge should be a whole number of cells. */
  cellSize: number;
  /** The area id walkers use at a point (priced by the runtime's `areaCosts`), or null where nothing walks. */
  areaAt(x: number, z: number): number | null;
  /** Ground height at a point. Default 0. */
  heightAt?(x: number, z: number): number;
}

/**
 * Build one nav tile by sampling the world on a grid: each cell takes the area its centre reports,
 * runs of cells with one area merge into rectangles, and each rectangle's sides are split at its
 * neighbours' corners so adjacent rectangles share edges. The builder for a game whose walkable
 * ground is a rule (lots, roads, water) rather than baked triangles.
 * @capability navmesh-tile-from-grid build a nav tile from a walkable-area rule sampled on a grid
 */
export function navTileFromGrid(options: NavGridTileOptions): NavMeshData {
  const { bounds, cellSize } = options;
  const cols = Math.max(1, Math.round((bounds.max[0] - bounds.min[0]) / cellSize));
  const rows = Math.max(1, Math.round((bounds.max[1] - bounds.min[1]) / cellSize));
  const stepX = (bounds.max[0] - bounds.min[0]) / cols;
  const stepZ = (bounds.max[1] - bounds.min[1]) / rows;
  const area = new Int32Array(cols * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const value = options.areaAt(bounds.min[0] + (col + 0.5) * stepX, bounds.min[1] + (row + 0.5) * stepZ);
      area[row * cols + col] = value === null ? -1 : value;
    }
  }
  const used = new Uint8Array(cols * rows);
  const rects: { c0: number; r0: number; c1: number; r1: number; area: number }[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const at = row * cols + col;
      const value = area[at] ?? -1;
      if (value < 0 || used[at] === 1) continue;
      let c1 = col;
      while (c1 + 1 < cols && area[row * cols + c1 + 1] === value && used[row * cols + c1 + 1] === 0) c1 += 1;
      let r1 = row;
      grow: while (r1 + 1 < rows) {
        for (let c = col; c <= c1; c += 1) if (area[(r1 + 1) * cols + c] !== value || used[(r1 + 1) * cols + c] === 1) break grow;
        r1 += 1;
      }
      for (let r = row; r <= r1; r += 1) for (let c = col; c <= c1; c += 1) used[r * cols + c] = 1;
      rects.push({ c0: col, r0: row, c1: c1 + 1, r1: r1 + 1, area: value });
    }
  }
  const height = options.heightAt ?? (() => 0);
  const verts: number[] = [];
  const corner = new Map<number, number>();
  const stride = cols + 1;
  const vertex = (c: number, r: number): number => {
    const key = r * stride + c;
    const known = corner.get(key);
    if (known !== undefined) return known;
    const x = bounds.min[0] + c * stepX;
    const z = bounds.min[1] + r * stepZ;
    const id = verts.length / 3;
    verts.push(x, height(x, z), z);
    corner.set(key, id);
    return id;
  };
  for (const rect of rects) {
    vertex(rect.c0, rect.r0);
    vertex(rect.c1, rect.r0);
    vertex(rect.c1, rect.r1);
    vertex(rect.c0, rect.r1);
  }
  const polys: number[][] = [];
  const areas: number[] = [];
  for (const rect of rects) {
    const ring: number[] = [];
    const walk = (c: number, r: number, dc: number, dr: number, steps: number) => {
      for (let i = 0; i < steps; i += 1) {
        const id = corner.get((r + dr * i) * stride + (c + dc * i));
        if (id !== undefined) ring.push(id);
      }
    };
    walk(rect.c0, rect.r0, 1, 0, rect.c1 - rect.c0);
    walk(rect.c1, rect.r0, 0, 1, rect.r1 - rect.r0);
    walk(rect.c1, rect.r1, -1, 0, rect.c1 - rect.c0);
    walk(rect.c0, rect.r1, 0, -1, rect.r1 - rect.r0);
    polys.push(ring);
    areas.push(rect.area);
  }
  return { verts, polys, links: [], areas };
}
