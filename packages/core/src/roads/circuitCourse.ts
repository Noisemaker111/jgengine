/**
 * One race model: a lap lifted out of a street network ({@link CircuitRoute}) becomes a closed
 * {@link RouteCourse}, so a city street race gets the same locate, wall clamp, racing line, spans and
 * checkpoint ring a piece-laid course has, and a game's runtime (movement clamp, race order, hazards)
 * drives either without knowing which one it got.
 *
 * The course's main line starts at the circuit's start/finish line, so main-line metres read as
 * "metres into the lap". Corners and timing sectors come along as tagged spans.
 *
 * @capability route-course drive a lap lifted from city streets as a closed route course: locate, clamp, racing line, spans, checkpoints
 */
import type { CircuitRoute } from "./raceCircuit";
import { buildRouteCourse, type CourseSpanSpec, type CourseVec2, type RouteCourse } from "./routeCourse";

/** A circuit as a closed course, with where its gates fall on it. */
export interface CircuitCourse {
  course: RouteCourse;
  /** Main-line metres of each of the circuit's checkpoint gates in race order, the finish line (0) last. */
  gates: readonly number[];
  laps: number;
}

/** Span tags {@link courseFromCircuit} hangs on the lap. */
export const CIRCUIT_CORNER_TAG = "corner";
export const CIRCUIT_SECTOR_TAG = "sector";

/** Options for {@link courseFromCircuit}. */
export interface CircuitCourseOptions {
  /** Sample spacing the course keeps for its branches and lines, metres. Default 2. */
  step?: number;
}

/**
 * Turn a lifted lap into a closed {@link RouteCourse} that starts at the circuit's start line.
 * `course.checkpoints({ at: gates.slice(0, -1), finish: 0 })` hands straight to
 * `raceTrack({ checkpoints, laps })`.
 *
 * @capability route-course drive a lap lifted from city streets as a closed route course: locate, clamp, racing line, spans, checkpoints
 */
export function courseFromCircuit(route: CircuitRoute, options: CircuitCourseOptions = {}): CircuitCourse {
  const n = route.centerline.length;
  if (n < 3) throw new Error("circuit course: the lap needs at least three points");
  const along: number[] = [0];
  for (let i = 1; i <= n; i += 1) {
    const a = route.centerline[i - 1]!;
    const b = route.centerline[i % n]!;
    along.push(along[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = along[n]!;
  const startAt = ((route.start.distance % total) + total) % total;
  // The segment the start line falls in; the lap is re-threaded to begin exactly on the line.
  let seg = 0;
  while (seg < n - 1 && along[seg + 1]! <= startAt) seg += 1;
  const segLength = along[seg + 1]! - along[seg]!;
  const f = segLength === 0 ? 0 : (startAt - along[seg]!) / segLength;
  const lerp = (values: readonly number[] | undefined, fallback: number, i: number, j: number): number =>
    (values?.[i] ?? fallback) + ((values?.[j] ?? fallback) - (values?.[i] ?? fallback)) * f;
  const a = route.centerline[seg]!;
  const b = route.centerline[(seg + 1) % n]!;
  const points: CourseVec2[] = [[a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]];
  const widths: number[] = [lerp(route.widths, 9, seg, (seg + 1) % n)];
  const heights: number[] = [lerp(route.heights, 0, seg, (seg + 1) % n)];
  for (let k = 1; k <= n; k += 1) {
    const i = (seg + k) % n;
    points.push(route.centerline[i]!);
    widths.push(route.widths[i] ?? 9);
    heights.push(route.heights?.[i] ?? 0);
  }
  const halfWidths = widths.map((width) => Math.max(0.5, width / 2));
  const lapAt = (distance: number): number => (((distance - startAt) % total) + total) % total;

  const spans: CourseSpanSpec[] = [];
  route.corners.forEach((corner, index) => {
    spans.push({
      id: `corner-${index + 1}`,
      tag: CIRCUIT_CORNER_TAG,
      from: lapAt(along[corner.entry]!),
      to: lapAt(along[corner.exit]!),
      data: { direction: corner.direction, radius: Math.round(corner.radius * 10) / 10, angle: Math.round(corner.angle * 1000) / 1000 },
    });
  });
  route.sectors.forEach((fraction, index) => {
    const next = route.sectors[index + 1] ?? 1;
    spans.push({ id: `sector-${index + 1}`, tag: CIRCUIT_SECTOR_TAG, from: lapAt(fraction * total), to: lapAt(next * total), data: { index: index + 1 } });
  });

  const course = buildRouteCourse({
    halfWidth: halfWidths[0]!,
    centerline: { points, halfWidths, ...(route.heights === undefined ? {} : { elevations: heights }) },
    closed: true,
    spans,
    ...(options.step === undefined ? {} : { step: options.step }),
  });
  const gates = route.checkpoints.map((gate, index) => {
    if (index === route.checkpoints.length - 1) return 0;
    return course.locate(gate.center[0], gate.center[2]).s;
  });
  return { course, gates, laps: route.laps };
}
