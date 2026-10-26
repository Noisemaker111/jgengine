import { describe, expect, test } from "bun:test";

import { createRaceState, everyoneFinishes, raceTrack } from "@jgengine/core/game/race";
import { buildRouteCourse, MAIN_ROUTE, type RouteCourseSpec } from "@jgengine/core/roads/routeCourse";

const HALF = Math.PI / 2;

/** 100 m north, a left hairpin, 100 m back south: a switchback whose legs sit 40 m apart. */
const SWITCHBACK: RouteCourseSpec = {
  start: { x: 0, z: 0, heading: 0 },
  halfWidth: 8,
  pieces: [
    { kind: "straight", length: 100 },
    { kind: "turn", angle: Math.PI, radius: 20, tag: "hairpin" },
    { kind: "straight", length: 100, rise: 10 },
  ],
};

describe("route course", () => {
  test("pieces lay out turtle-style: lengths add up and a left hairpin comes back along +x", () => {
    const course = buildRouteCourse(SWITCHBACK);
    expect(course.length).toBeCloseTo(200 + Math.PI * 20, 0);
    const end = course.pointAt(MAIN_ROUTE, course.length);
    expect(end.x).toBeCloseTo(40, 1);
    expect(end.z).toBeCloseTo(0, 1);
    expect(Math.abs(end.heading)).toBeCloseTo(Math.PI, 1);
    expect(end.elevation).toBeCloseTo(10, 5);
    const mid = course.pointAt(MAIN_ROUTE, 50, 3);
    expect(mid.x).toBeCloseTo(3, 5);
    expect(mid.z).toBeCloseTo(50, 5);
  });

  test("locate reads distance, lateral offset and walls; the hint keeps a kart on its own leg", () => {
    const course = buildRouteCourse(SWITCHBACK);
    const out = course.locate(5, 60);
    expect(out).toMatchObject({ route: MAIN_ROUTE, inside: true });
    expect(out.s).toBeCloseTo(60, 5);
    expect(out.offset).toBeCloseTo(5, 5);
    const back = course.locate(38, 60);
    expect(back.s).toBeCloseTo(100 + Math.PI * 20 + 40, 0);
    // Heading south, the left normal points to -x: 2 m short of the centreline at x = 40 is left.
    expect(back.offset).toBeCloseTo(2, 1);
    expect(course.locate(20, 60).inside).toBe(false);
    expect(course.contains(20, 60)).toBe(false);
  });

  test("clamp slides a move along the wall instead of through it, and caps the start", () => {
    const course = buildRouteCourse(SWITCHBACK);
    const hint = course.locate(0, 30);
    const wall = course.clamp(12, 34, hint);
    expect(wall.x).toBeCloseTo(8, 1);
    expect(wall.z).toBeCloseTo(34, 1);
    expect(wall.fix.inside).toBe(true);
    const behind = course.clamp(1, -5, course.locate(1, 2));
    expect(behind.z).toBeGreaterThanOrEqual(0);
    expect(behind.x).toBeCloseTo(1, 5);
  });

  test("a kart driving the switchback reads steadily rising progress and never jumps legs", () => {
    const course = buildRouteCourse(SWITCHBACK);
    let fix = course.locate(6, 0.5);
    let last = 0;
    for (const [x, z] of course.line({ step: 0.5, offset: () => 6 })) {
      fix = course.clamp(x, z, fix).fix;
      expect(fix.progress).toBeGreaterThanOrEqual(last - 1e-6);
      last = fix.progress;
    }
    expect(last).toBeCloseTo(course.length, 0);
    // Shoving sideways from the first leg toward the second stops at the first leg's wall.
    const pinned = course.clamp(16, 60, course.locate(6, 60));
    expect(pinned.x).toBeLessThanOrEqual(8);
    expect(pinned.fix.s).toBeLessThan(100);
  });

  test("a branch opens the walls at both junctions and maps its metres onto main-line progress", () => {
    const course = buildRouteCourse({
      start: { x: 0, z: 0, heading: 0 },
      halfWidth: 6,
      pieces: [{ kind: "straight", length: 300 }],
      branches: [{ id: "cut", from: 80, to: 220, via: [[30, 120], [30, 180]], halfWidth: 4, tag: "shortcut" }],
    });
    const cut = course.routes.find((entry) => entry.id === "cut")!;
    expect(cut.from).toBe(80);
    expect(cut.to).toBe(220);
    const onCut = course.locate(30, 150);
    expect(onCut).toMatchObject({ route: "cut", inside: true });
    expect(onCut.progress).toBeGreaterThan(140);
    expect(onCut.progress).toBeLessThan(160);
    expect(course.spansAt(onCut, 0, "shortcut")).toHaveLength(1);
    // The main line's right wall (+x, offset > 0 is left) has no posts where the branch leaves it.
    const posts = course.edges(2).filter((post) => post.route === MAIN_ROUTE && post.side === "left");
    expect(posts.some((post) => post.s > 82 && post.s < 86)).toBe(false);
    expect(posts.some((post) => post.s > 120 && post.s < 180)).toBe(true);
    // A kart on the main line keeps the main line through the junction until it leaves its walls.
    let fix = course.locate(0, 70);
    for (let z = 70; z < 100; z += 1) fix = course.clamp(0, z, fix).fix;
    expect(fix.route).toBe(MAIN_ROUTE);
  });

  test("checkpoints and forks drive the shared race state through either path", () => {
    const course = buildRouteCourse({
      start: { x: 0, z: 0, heading: 0 },
      halfWidth: 6,
      pieces: [{ kind: "straight", length: 300 }],
      branches: [{ id: "cut", from: 80, to: 220, via: [[30, 120], [30, 180]] }],
    });
    const ring = course.checkpoints({ at: [50, 150, 250], finish: 290 });
    expect(ring.checkpoints.map((cp) => cp.id)).toEqual(["cp-50", "cp-250", "finish"]);
    expect(ring.forks).toHaveLength(1);
    expect(ring.forks[0]!.afterIndex).toBe(0);
    const race = createRaceState({ track: raceTrack({ ...ring, laps: 1 }), win: everyoneFinishes() });
    race.addRacer("main");
    race.addRacer("cut");
    const mainLine = course.line();
    const cutLine = course.line({ take: ["cut"] });
    expect(cutLine.some(([x]) => x > 25)).toBe(true);
    const walk = (line: readonly (readonly [number, number])[], id: string): void => {
      line.forEach(([x, z], index) => race.update(index, { [id]: [x, 0, z] }));
    };
    walk(mainLine, "main");
    walk(cutLine, "cut");
    expect(race.finished).toBe(true);
    expect(race.progressOf("cut")?.routesTaken).toEqual({ cut: "cut" });
    expect(race.progressOf("main")?.routesTaken).toEqual({ cut: MAIN_ROUTE });
  });

  test("timed spans are active only inside their window and lateral band", () => {
    const course = buildRouteCourse({
      start: { x: 0, z: 0, heading: 0 },
      halfWidth: 10,
      pieces: [{ kind: "straight", length: 100 }],
      spans: [{ id: "crossing", tag: "train", from: 40, to: 48, cycle: { period: 10, active: 3, phase: 1 }, data: { speed: 6 } }, { id: "belt", tag: "belt", from: 0, to: 100, offset: [2, 10] }],
    });
    const fix = course.locate(0, 44);
    expect(course.spansAt(fix, 1, "train")).toHaveLength(1);
    expect(course.spansAt(fix, 2.5, "train")).toHaveLength(0);
    expect(course.spansAt(fix, 9.5, "train")).toHaveLength(1);
    expect(course.spansAt(course.locate(0, 20), 0, "belt")).toHaveLength(0);
    expect(course.spansAt(course.locate(5, 20), 0, "belt")[0]?.id).toBe("belt");
  });

  test("ground height rides the course elevation and blends back into the base field", () => {
    const course = buildRouteCourse({
      start: { x: 0, z: 0, heading: 0, elevation: 4 },
      halfWidth: 5,
      pieces: [{ kind: "straight", length: 100, rise: 20 }],
    });
    const ground = course.groundHeight(() => 0, { shoulder: 2, falloff: 10 });
    expect(ground(0, 50)).toBeCloseTo(14, 5);
    expect(ground(6.5, 50)).toBeCloseTo(14, 5);
    expect(ground(30, 50)).toBe(0);
    const between = ground(12, 50);
    expect(between).toBeGreaterThan(0);
    expect(between).toBeLessThan(14);
  });

  test("terrain profiles grade each even-slope run of the course", () => {
    const course = buildRouteCourse({
      start: { x: 0, z: 0, heading: 0, elevation: 2 },
      halfWidth: 5,
      pieces: [
        { kind: "straight", length: 40 },
        { kind: "straight", length: 60, rise: 12 },
        { kind: "turn", angle: HALF, radius: 20 },
      ],
    });
    const profiles = course.terrainProfiles({ retaining: { wallHeight: 2 } });
    expect(profiles.map((profile) => [profile.height, profile.width])).toEqual([
      [{ kind: "grade", start: 2, end: 2 }, 12],
      [{ kind: "grade", start: 2, end: 14 }, 12],
      [{ kind: "grade", start: 14, end: 14 }, 12],
    ]);
    expect(profiles[1]!.points[0]).toEqual(profiles[0]!.points[profiles[0]!.points.length - 1]!);
    expect(profiles[0]!.retaining).toEqual({ wallHeight: 2 });
  });

  test("an impossible layout fails loudly", () => {
    expect(() => buildRouteCourse({ start: { x: 0, z: 0, heading: 0 }, halfWidth: 8, pieces: [{ kind: "turn", angle: HALF, radius: 6 }] })).toThrow(/radius/);
    expect(() =>
      buildRouteCourse({
        start: { x: 0, z: 0, heading: 0 },
        halfWidth: 4,
        pieces: [{ kind: "straight", length: 100 }],
        branches: [
          { id: "a", from: 10, to: 50, via: [[20, 30]] },
          { id: "b", from: 40, to: 80, via: [[-20, 60]] },
        ],
      }),
    ).toThrow(/overlap/);
  });
});
