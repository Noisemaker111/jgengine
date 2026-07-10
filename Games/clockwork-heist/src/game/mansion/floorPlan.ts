export type WingId = "servants" | "gallery" | "scholar" | "state";

export interface RoomDef {
  id: string;
  name: string;
  wing: WingId;
  i: number;
  j: number;
  center: readonly [number, number];
  type: string;
}

export const ROOM_PITCH = 10;
export const ROOM_HALF = 4.5;
export const WALL_HEIGHT = 3;
export const DOOR_GAP_HALF_WIDTH = 1.4;

function roomCenter(i: number, j: number): readonly [number, number] {
  return [i * ROOM_PITCH, j * ROOM_PITCH];
}

export const ROOMS: readonly RoomDef[] = [
  { id: "servant_entrance", name: "Servant Entrance", wing: "servants", i: 0, j: 0, center: roomCenter(0, 0), type: "servant_entrance" },
  { id: "kitchen", name: "Kitchen", wing: "servants", i: 0, j: 1, center: roomCenter(0, 1), type: "kitchen" },
  { id: "pantry", name: "Pantry", wing: "servants", i: 0, j: 2, center: roomCenter(0, 2), type: "pantry" },
  { id: "grand_gallery", name: "Grand Gallery", wing: "gallery", i: 1, j: 0, center: roomCenter(1, 0), type: "gallery" },
  { id: "music_room", name: "Music Room", wing: "gallery", i: 1, j: 1, center: roomCenter(1, 1), type: "music_room" },
  { id: "conservatory", name: "Conservatory", wing: "gallery", i: 1, j: 2, center: roomCenter(1, 2), type: "conservatory" },
  { id: "library", name: "Library", wing: "scholar", i: 2, j: 0, center: roomCenter(2, 0), type: "library" },
  { id: "study", name: "Study", wing: "scholar", i: 2, j: 1, center: roomCenter(2, 1), type: "study" },
  { id: "smoking_room", name: "Smoking Room", wing: "scholar", i: 2, j: 2, center: roomCenter(2, 2), type: "smoking_room" },
  { id: "ballroom", name: "Ballroom", wing: "state", i: 3, j: 0, center: roomCenter(3, 0), type: "ballroom" },
  { id: "vault_antechamber", name: "Vault Antechamber", wing: "state", i: 3, j: 1, center: roomCenter(3, 1), type: "vault_antechamber" },
  { id: "trophy_room", name: "Trophy Room", wing: "state", i: 3, j: 2, center: roomCenter(3, 2), type: "trophy_room" },
];

export function roomAt(x: number, z: number): RoomDef | null {
  for (const room of ROOMS) {
    const [cx, cz] = room.center;
    if (Math.abs(x - cx) <= ROOM_HALF && Math.abs(z - cz) <= ROOM_HALF) return room;
  }
  return null;
}

export function roomById(id: string): RoomDef {
  const room = ROOMS.find((entry) => entry.id === id);
  if (room === undefined) throw new Error(`floorPlan: unknown room "${id}"`);
  return room;
}

export interface DoorwayConnection {
  id: string;
  roomA: string;
  roomB: string;
  gapCenter: readonly [number, number];
  axis: "x" | "z";
  scheduled: boolean;
}

export const SCHEDULED_DOORWAYS: readonly DoorwayConnection[] = [
  { id: "vault_door", roomA: "ballroom", roomB: "vault_antechamber", gapCenter: [30, 5], axis: "z", scheduled: true },
  { id: "gallery_door", roomA: "grand_gallery", roomB: "library", gapCenter: [15, 0], axis: "x", scheduled: true },
  { id: "kitchen_door", roomA: "kitchen", roomB: "music_room", gapCenter: [5, 10], axis: "x", scheduled: true },
  { id: "study_door", roomA: "study", roomB: "vault_antechamber", gapCenter: [25, 10], axis: "x", scheduled: true },
];

export const OPEN_DOORWAYS: readonly DoorwayConnection[] = [
  { id: "servant_to_kitchen", roomA: "servant_entrance", roomB: "kitchen", gapCenter: [0, 5], axis: "z", scheduled: false },
  { id: "kitchen_to_pantry", roomA: "kitchen", roomB: "pantry", gapCenter: [0, 15], axis: "z", scheduled: false },
  { id: "gallery_to_music", roomA: "grand_gallery", roomB: "music_room", gapCenter: [10, 5], axis: "z", scheduled: false },
  { id: "music_to_conservatory", roomA: "music_room", roomB: "conservatory", gapCenter: [10, 15], axis: "z", scheduled: false },
  { id: "library_to_study", roomA: "library", roomB: "study", gapCenter: [20, 5], axis: "z", scheduled: false },
  { id: "study_to_smoking", roomA: "study", roomB: "smoking_room", gapCenter: [20, 15], axis: "z", scheduled: false },
  { id: "vault_to_trophy", roomA: "vault_antechamber", roomB: "trophy_room", gapCenter: [30, 15], axis: "z", scheduled: false },
  { id: "servant_to_gallery", roomA: "servant_entrance", roomB: "grand_gallery", gapCenter: [5, 0], axis: "x", scheduled: false },
  { id: "library_to_ballroom", roomA: "library", roomB: "ballroom", gapCenter: [25, 0], axis: "x", scheduled: false },
  { id: "music_to_study", roomA: "music_room", roomB: "study", gapCenter: [15, 10], axis: "x", scheduled: false },
  { id: "pantry_to_conservatory", roomA: "pantry", roomB: "conservatory", gapCenter: [5, 20], axis: "x", scheduled: false },
  { id: "conservatory_to_smoking", roomA: "conservatory", roomB: "smoking_room", gapCenter: [15, 20], axis: "x", scheduled: false },
  { id: "smoking_to_trophy", roomA: "smoking_room", roomB: "trophy_room", gapCenter: [25, 20], axis: "x", scheduled: false },
];

export const ALL_DOORWAYS: readonly DoorwayConnection[] = [...SCHEDULED_DOORWAYS, ...OPEN_DOORWAYS];

export const SERVANT_DOOR: DoorwayConnection = {
  id: "servant_door",
  roomA: "servant_entrance",
  roomB: "exterior",
  gapCenter: [0, -ROOM_HALF],
  axis: "z",
  scheduled: false,
};

export interface WallLine {
  fixedAxis: "x" | "z";
  fixedCoord: number;
  rangeStart: number;
  rangeEnd: number;
  gapCenter?: number;
  gapHalfWidth?: number;
}

function connectionWallLine(connection: DoorwayConnection): WallLine {
  const a = roomById(connection.roomA);
  const b = connection.roomB === "exterior" ? null : roomById(connection.roomB);
  if (connection.axis === "z") {
    const fixedCoord = b === null ? connection.gapCenter[1] : (a.center[1] + b.center[1]) / 2;
    const roomX = a.center[0];
    return {
      fixedAxis: "z",
      fixedCoord,
      rangeStart: roomX - ROOM_HALF,
      rangeEnd: roomX + ROOM_HALF,
      gapCenter: connection.gapCenter[0],
      gapHalfWidth: DOOR_GAP_HALF_WIDTH,
    };
  }
  const fixedCoord = b === null ? connection.gapCenter[0] : (a.center[0] + b.center[0]) / 2;
  const roomZ = a.center[1];
  return {
    fixedAxis: "x",
    fixedCoord,
    rangeStart: roomZ - ROOM_HALF,
    rangeEnd: roomZ + ROOM_HALF,
    gapCenter: connection.gapCenter[1],
    gapHalfWidth: DOOR_GAP_HALF_WIDTH,
  };
}

function exteriorWallLines(): WallLine[] {
  const lines: WallLine[] = [];
  for (const room of ROOMS) {
    const [cx, cz] = room.center;
    if (!ROOMS.some((other) => other.i === room.i - 1 && other.j === room.j)) {
      lines.push({ fixedAxis: "z", fixedCoord: cx - ROOM_HALF, rangeStart: cz - ROOM_HALF, rangeEnd: cz + ROOM_HALF });
    }
    if (!ROOMS.some((other) => other.i === room.i + 1 && other.j === room.j)) {
      lines.push({ fixedAxis: "z", fixedCoord: cx + ROOM_HALF, rangeStart: cz - ROOM_HALF, rangeEnd: cz + ROOM_HALF });
    }
    if (!ROOMS.some((other) => other.i === room.i && other.j === room.j - 1)) {
      if (room.id === "servant_entrance") {
        lines.push({
          fixedAxis: "x",
          fixedCoord: cz - ROOM_HALF,
          rangeStart: cx - ROOM_HALF,
          rangeEnd: cx + ROOM_HALF,
          gapCenter: cx,
          gapHalfWidth: DOOR_GAP_HALF_WIDTH,
        });
      } else {
        lines.push({ fixedAxis: "x", fixedCoord: cz - ROOM_HALF, rangeStart: cx - ROOM_HALF, rangeEnd: cx + ROOM_HALF });
      }
    }
    if (!ROOMS.some((other) => other.i === room.i && other.j === room.j + 1)) {
      lines.push({ fixedAxis: "x", fixedCoord: cz + ROOM_HALF, rangeStart: cx - ROOM_HALF, rangeEnd: cx + ROOM_HALF });
    }
  }
  return lines;
}

export function allWallLines(): WallLine[] {
  return [...ALL_DOORWAYS.map(connectionWallLine), ...exteriorWallLines()];
}

export interface WallBoxPlacement {
  id: string;
  x: number;
  z: number;
  length: number;
  axis: "x" | "z";
}

const WALL_BOX_SPACING = 0.9;

export function wallBoxesForLine(line: WallLine, idPrefix: string): WallBoxPlacement[] {
  const boxes: WallBoxPlacement[] = [];
  const span = line.rangeEnd - line.rangeStart;
  const count = Math.max(1, Math.round(span / WALL_BOX_SPACING) + 1);
  const step = span / (count - 1 || 1);
  for (let n = 0; n < count; n += 1) {
    const coord = line.rangeStart + step * n;
    if (line.gapCenter !== undefined && line.gapHalfWidth !== undefined) {
      if (coord >= line.gapCenter - line.gapHalfWidth && coord <= line.gapCenter + line.gapHalfWidth) continue;
    }
    const x = line.fixedAxis === "z" ? line.fixedCoord : coord;
    const z = line.fixedAxis === "z" ? coord : line.fixedCoord;
    boxes.push({ id: `${idPrefix}-${n}`, x, z, length: WALL_BOX_SPACING, axis: line.fixedAxis === "z" ? "x" : "z" });
  }
  return boxes;
}

export interface LosSegment {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}

function point(line: WallLine, coord: number): readonly [number, number] {
  return line.fixedAxis === "z" ? [line.fixedCoord, coord] : [coord, line.fixedCoord];
}

export function wallLineToLosSegments(line: WallLine): LosSegment[] {
  if (line.gapCenter === undefined || line.gapHalfWidth === undefined) {
    const [x1, z1] = point(line, line.rangeStart);
    const [x2, z2] = point(line, line.rangeEnd);
    return [{ x1, z1, x2, z2 }];
  }
  const segments: LosSegment[] = [];
  const gapStart = line.gapCenter - line.gapHalfWidth;
  const gapEnd = line.gapCenter + line.gapHalfWidth;
  if (gapStart > line.rangeStart) {
    const [x1, z1] = point(line, line.rangeStart);
    const [x2, z2] = point(line, gapStart);
    segments.push({ x1, z1, x2, z2 });
  }
  if (gapEnd < line.rangeEnd) {
    const [x1, z1] = point(line, gapEnd);
    const [x2, z2] = point(line, line.rangeEnd);
    segments.push({ x1, z1, x2, z2 });
  }
  return segments;
}

export function generateAllWallBoxes(): WallBoxPlacement[] {
  const lines = allWallLines();
  const boxes: WallBoxPlacement[] = [];
  lines.forEach((line, lineIndex) => {
    boxes.push(...wallBoxesForLine(line, `wall-${lineIndex}`));
  });
  return boxes;
}

export function doorwayGapLosSegment(connection: DoorwayConnection): LosSegment {
  const [gx, gz] = connection.gapCenter;
  if (connection.axis === "x") {
    return { x1: gx - DOOR_GAP_HALF_WIDTH, z1: gz, x2: gx + DOOR_GAP_HALF_WIDTH, z2: gz };
  }
  return { x1: gx, z1: gz - DOOR_GAP_HALF_WIDTH, x2: gx, z2: gz + DOOR_GAP_HALF_WIDTH };
}

export function staticLosSegments(): LosSegment[] {
  return allWallLines().flatMap((line) => wallLineToLosSegments(line));
}

export function mansionBounds(): { minX: number; maxX: number; minZ: number; maxZ: number } {
  return { minX: -ROOM_HALF, maxX: 3 * ROOM_PITCH + ROOM_HALF, minZ: -ROOM_HALF, maxZ: 2 * ROOM_PITCH + ROOM_HALF };
}
