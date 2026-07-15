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

function parseRoom(src: RoomSource): RoomDef {
  const rows = src.map;
  const height = rows.length;
  const width = Math.max(...rows.map((row) => row.length));
  const originX = -Math.floor((width - 1) / 2);
  const originZ = -Math.floor((height - 1) / 2);

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
    const line = rows[row] ?? "";
    for (let col = 0; col < width; col++) {
      const glyph = line[col] ?? "#";
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

export const ROOMS: readonly RoomDef[] = SOURCES.map(parseRoom);
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
