import type { EditorDocument } from "@jgengine/core/editor/index";
import { raceTrack, type RaceTrack } from "@jgengine/core/game/race";

/**
 * The circuit is one authored path (`editor.scene.json`, kind "track"): its points are the racing
 * line, its `meta.width` the road. The road, the checkpoints and the rivals' line all read it, so
 * reshaping the circuit in the editor (F2+E) reshapes the race.
 */
type Point = readonly [number, number];

export interface Circuit {
  /** Racing line, closed: the last point leads back to the first. */
  line: readonly Point[];
  width: number;
  /** Total length of one lap in metres. */
  length: number;
}

export function circuitOf(doc: EditorDocument): Circuit {
  const path = (doc.paths ?? []).find((entry) => entry.kind === "track");
  if (path === undefined || path.points.length < 3) throw new Error('editor.scene.json needs a path of kind "track" with at least 3 points');
  const line = path.points.map((point) => [point.x, point.z] as const);
  const width = Number((path.meta as Record<string, unknown> | undefined)?.width ?? 14);
  let length = 0;
  line.forEach((point, index) => {
    const next = line[(index + 1) % line.length]!;
    length += Math.hypot(next[0] - point[0], next[1] - point[1]);
  });
  return { line, width, length };
}

/** Checkpoints every few line points; the start line is the last one, so a lap ends where it began. */
export function trackOf(circuit: Circuit, laps: number): RaceTrack {
  const every = Math.max(1, Math.floor(circuit.line.length / 12));
  const picks = circuit.line.map((_, index) => index).filter((index) => index % every === 0 && index !== 0);
  picks.push(0);
  const half = circuit.width * 0.75;
  return raceTrack({
    laps,
    checkpoints: picks.map((index) => {
      const [x, z] = circuit.line[index]!;
      return { id: `cp${index}`, center: [x, 0, z], half: [half, 40, half] };
    }),
  });
}

/** Heading that points from `from` to `to` (the engine's yaw: 0 faces +z). */
export function headingTo(from: Point, to: Point): number {
  return Math.atan2(to[0] - from[0], to[1] - from[1]);
}

/** The line segment a point is beside (its start index), and how far off the line the point is. */
export function nearestOnLine(circuit: Circuit, x: number, z: number): { index: number; off: number } {
  let index = 0;
  let off = Infinity;
  const { line } = circuit;
  line.forEach((from, at) => {
    const to = line[(at + 1) % line.length]!;
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const along = Math.max(0, Math.min(1, ((x - from[0]) * dx + (z - from[1]) * dz) / (dx * dx + dz * dz || 1)));
    const distance = Math.hypot(from[0] + dx * along - x, from[1] + dz * along - z);
    if (distance < off) [index, off] = [at, distance];
  });
  return { index, off };
}

/** Grid slots behind the start line, two abreast. */
export function gridSlot(circuit: Circuit, slot: number): { position: [number, number, number]; heading: number } {
  const start = circuit.line[0]!;
  const back = circuit.line[circuit.line.length - 2]!;
  const heading = headingTo(back, start);
  const row = Math.floor(slot / 2) + 1;
  const side = slot % 2 === 0 ? -1 : 1;
  const behind = row * 7;
  const across = side * circuit.width * 0.22;
  const x = start[0] - Math.sin(heading) * behind + Math.cos(heading) * across;
  const z = start[1] - Math.cos(heading) * behind - Math.sin(heading) * across;
  return { position: [x, 0, z], heading };
}
