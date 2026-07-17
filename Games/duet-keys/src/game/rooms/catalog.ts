import {
  getGridCell,
  importAsciiGrid,
  type EditorGridLayer,
  type EditorGridPaletteEntry,
} from "@jgengine/core/editor/index";

import type { Dir, HeroId, V2 } from "../types";

export interface Plate {
  readonly id: string;
  readonly cell: V2;
}

export interface Receiver {
  readonly id: string;
  readonly cell: V2;
}

export interface Gate {
  readonly id: string;
  readonly cells: readonly V2[];
  readonly plates: readonly string[];
  readonly receivers: readonly string[];
}

export interface SpikeGroup {
  readonly id: string;
  readonly cells: readonly V2[];
  readonly retractedBy: string | null;
}

export interface RoomDef {
  readonly id: string;
  readonly name: string;
  readonly objective: string;
  readonly floor: readonly V2[];
  readonly walls: readonly V2[];
  readonly spawn: Record<HeroId, V2>;
  readonly exit: Record<HeroId, V2>;
  readonly plates: readonly Plate[];
  readonly receivers: readonly Receiver[];
  readonly gates: readonly Gate[];
  readonly spikes: readonly SpikeGroup[];
  readonly emitters: readonly V2[];
}

/** Per-room gate/spike wiring keyed by the map glyph. */
interface RoomLinks {
  gates?: Record<string, { plates?: string[]; receivers?: string[] }>;
  spikes?: Record<string, { retractedBy?: string }>;
  /** Direction a planted prism must face at each emitter tile — documentation only, not enforced. */
  hint?: string;
}

interface RoomSource {
  id: string;
  name: string;
  objective: string;
  map: readonly string[];
  links?: RoomLinks;
}

const PLATE_GLYPHS = "123456789";
const RECEIVER_GLYPHS = "rstuvw";
const GATE_GLYPHS = "GHIJK";
const SPIKE_GLYPHS = "XYZ";

/**
 * Palette registered for every duet-keys room grid layer. The value id equals the map glyph, so
 * the ASCII maps below are a pure import adapter into the editor-owned grid document — the grid,
 * not the ASCII, is the canonical representation the room parser, gameplay, and rendering read.
 */
export const ROOM_PALETTE: readonly EditorGridPaletteEntry[] = [
  { id: "#", glyph: "#", label: "Wall", color: "#0f172a" },
  { id: ".", glyph: ".", label: "Floor", color: "#334155" },
  { id: "L", glyph: "L", label: "Lumen spawn", color: "#38bdf8" },
  { id: "A", glyph: "A", label: "Anchor spawn", color: "#f59e0b" },
  { id: "o", glyph: "o", label: "Lumen exit", color: "#22d3ee" },
  { id: "0", glyph: "0", label: "Anchor exit", color: "#fbbf24" },
  { id: "E", glyph: "E", label: "Prism emitter", color: "#a78bfa" },
  ...[...PLATE_GLYPHS].map((glyph) => ({ id: glyph, glyph, label: `Plate ${glyph}`, color: "#fb923c" })),
  ...[...RECEIVER_GLYPHS].map((glyph) => ({ id: glyph, glyph, label: `Receiver ${glyph}`, color: "#60a5fa" })),
  ...[...GATE_GLYPHS].map((glyph) => ({ id: glyph, glyph, label: `Gate ${glyph}`, color: "#94a3b8" })),
  ...[...SPIKE_GLYPHS].map((glyph) => ({ id: glyph, glyph, label: `Spikes ${glyph}`, color: "#ef4444" })),
];

/**
 * Imports one room's ASCII map into an editor-owned grid layer positioned so cell (col,row) maps
 * to the same world V2 the game uses. Space (and any padding) is the empty value = wall; every
 * other glyph is stored as its own value id.
 */
export function roomGridLayer(src: RoomSource): EditorGridLayer {
  const height = src.map.length;
  const width = Math.max(...src.map.map((row) => row.length));
  const originX = -Math.floor((width - 1) / 2);
  const originZ = -Math.floor((height - 1) / 2);
  return importAsciiGrid(src.map.join("\n"), {
    id: `room_${src.id}`,
    kind: "room",
    label: src.name,
    palette: ROOM_PALETTE,
    empty: "",
    origin: { x: originX, y: 0, z: originZ },
    cellSize: 1,
    meta: { objective: src.objective, ...(src.links === undefined ? {} : { links: src.links }) },
  });
}

function parseRoom(layer: EditorGridLayer, src: RoomSource): RoomDef {
  const width = layer.cols;
  const height = layer.rows;
  const originX = layer.origin.x;
  const originZ = layer.origin.z;

  const floor: V2[] = [];
  const walls: V2[] = [];
  const emitters: V2[] = [];
  const spawn: Partial<Record<HeroId, V2>> = {};
  const exit: Partial<Record<HeroId, V2>> = {};
  const plates: Plate[] = [];
  const receivers: Receiver[] = [];
  const gateCells = new Map<string, V2[]>();
  const spikeCells = new Map<string, V2[]>();

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const raw = getGridCell(layer, col, row);
      const glyph = raw === "" ? "#" : raw;
      const cell: V2 = { x: col + originX, z: row + originZ };
      if (glyph === "#" || glyph === " ") {
        walls.push(cell);
        continue;
      }
      // everything non-wall is walkable floor
      floor.push(cell);
      if (glyph === ".") continue;
      if (glyph === "L") spawn.lumen = cell;
      else if (glyph === "A") spawn.anchor = cell;
      else if (glyph === "o") exit.lumen = cell;
      else if (glyph === "0") exit.anchor = cell;
      else if (glyph === "E") emitters.push(cell);
      else if (PLATE_GLYPHS.includes(glyph)) plates.push({ id: `p${glyph}`, cell });
      else if (RECEIVER_GLYPHS.includes(glyph)) receivers.push({ id: `r_${glyph}`, cell });
      else if (GATE_GLYPHS.includes(glyph)) push(gateCells, glyph, cell);
      else if (SPIKE_GLYPHS.includes(glyph)) push(spikeCells, glyph, cell);
      else throw new Error(`room ${src.id}: unknown glyph "${glyph}"`);
    }
  }

  const gates: Gate[] = [...gateCells.entries()].map(([glyph, cells]) => ({
    id: `g_${glyph}`,
    cells,
    plates: src.links?.gates?.[glyph]?.plates ?? [],
    receivers: src.links?.gates?.[glyph]?.receivers ?? [],
  }));
  const spikes: SpikeGroup[] = [...spikeCells.entries()].map(([glyph, cells]) => ({
    id: `s_${glyph}`,
    cells,
    retractedBy: src.links?.spikes?.[glyph]?.retractedBy ?? null,
  }));

  if (spawn.lumen === undefined || spawn.anchor === undefined)
    throw new Error(`room ${src.id}: missing a hero spawn (L/A)`);
  if (exit.lumen === undefined || exit.anchor === undefined)
    throw new Error(`room ${src.id}: missing an exit pad (o/0)`);

  return {
    id: src.id,
    name: src.name,
    objective: src.objective,
    floor,
    walls,
    spawn: { lumen: spawn.lumen, anchor: spawn.anchor },
    exit: { lumen: exit.lumen, anchor: exit.anchor },
    plates,
    receivers,
    gates,
    spikes,
    emitters,
  };
}

function push(map: Map<string, V2[]>, key: string, cell: V2): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [cell]);
  else list.push(cell);
}

// Legend: # wall · . floor · L/A hero spawns · o/0 exit pads · 1-9 plates · r/s/t receivers
// G/H/I gate doors · X/Y/Z spike fields · E prism-emitter marker (decor).
const SOURCES: readonly RoomSource[] = [
  {
    id: "hold-the-line",
    name: "Hold the Line",
    objective: "Anchor's weight holds the door — drop it on the plate, then both cross east.",
    map: [
      "#########",
      "#L.1.G.o#",
      "#....#..#",
      "#A...G.0#",
      "#########",
    ],
    links: { gates: { G: { plates: ["p1"] } } },
  },
  {
    id: "first-light",
    name: "First Light",
    objective: "Lumen's prism lights the door — aim it east into the receiver, then both cross.",
    map: [
      "#########",
      "#L.r.H.o#",
      "#....#..#",
      "#A...H.0#",
      "#########",
    ],
    links: { gates: { H: { receivers: ["r_r"] } } },
  },
  {
    id: "interlock",
    name: "Interlock",
    objective: "Each door answers to the other hero — anchor a plate, plant a prism, both cross.",
    map: [
      "###########",
      "#L.r.G...o#",
      "#.#########",
      "#A.1.H...0#",
      "###########",
    ],
    links: {
      gates: {
        G: { plates: ["p1"] },
        H: { receivers: ["r_r"] },
      },
    },
  },
  {
    id: "crosswire",
    name: "Crosswire",
    objective: "One prism lights Anchor's road and drops the spikes; Anchor's weight frees Lumen.",
    map: [
      "#############",
      "#L...r.G...o#",
      "#.#########.#",
      "#A.1.X.H...0#",
      "#############",
    ],
    links: {
      gates: {
        G: { plates: ["p1"] },
        H: { receivers: ["r_r"] },
      },
      spikes: {
        X: { retractedBy: "r_r" },
      },
    },
  },
];

/** Editor-owned grid layers for every room — the canonical, serializable room geometry. */
export const ROOM_GRIDS: readonly EditorGridLayer[] = SOURCES.map(roomGridLayer);
export const ROOMS: readonly RoomDef[] = SOURCES.map((src, index) => parseRoom(ROOM_GRIDS[index]!, src));
export const ROOM_COUNT = ROOMS.length;

export interface RoomBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
}

export function roomBounds(room: RoomDef): RoomBounds {
  const cells = [...room.floor, ...room.walls];
  const xs = cells.map((c) => c.x);
  const zs = cells.map((c) => c.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    width: maxX - minX + 1,
    depth: maxZ - minZ + 1,
  };
}
