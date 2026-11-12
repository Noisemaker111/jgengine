import { describe, expect, test } from "bun:test";

import { runGenerator } from "@jgengine/core/generator/generator";
import { createRaceState, everyoneFinishes, raceTrack } from "@jgengine/core/game/race";
import { CIRCUIT_CORNER_TAG, courseFromCircuit } from "@jgengine/core/roads/circuitCourse";
import { RACE_CIRCUIT_GENERATOR, RACE_CIRCUIT_SCHEMA, type RaceCircuit } from "@jgengine/core/roads/raceCircuit";
import { MAIN_ROUTE } from "@jgengine/core/roads/routeCourse";

function lap(preset: string, seed: string) {
  const values = RACE_CIRCUIT_SCHEMA.presets!.find((entry) => entry.id === preset)!.values;
  const circuit = runGenerator(RACE_CIRCUIT_GENERATOR, { ...values, seed }) as RaceCircuit;
  if (circuit.route === null) throw new Error(`no lap for ${preset}/${seed}`);
  return circuit.route;
}

describe("courseFromCircuit", () => {
  for (const [preset, seed] of [["circuit", "a"], ["street-circuit", "a"], ["high-speed", "a"], ["technical", "a"], ["figure-8", "a"], ["street-race", "b"]] as const) {
    test(`a ${preset} lap becomes a closed course that starts on its start line`, () => {
      const route = lap(preset, seed);
      const { course, gates, laps } = courseFromCircuit(route);
      expect(course.closed).toBe(true);
      expect(Math.abs(course.length - route.length) / route.length).toBeLessThan(0.02);
      const start = course.pointAt(MAIN_ROUTE, 0);
      expect(Math.hypot(start.x - route.start.x, start.z - route.start.z)).toBeLessThan(1);
      expect(Math.abs(Math.atan2(Math.sin(start.heading - route.start.heading), Math.cos(start.heading - route.start.heading)))).toBeLessThan(0.3);
      expect(laps).toBe(route.laps);
      expect(gates).toHaveLength(route.checkpoints.length);
      expect(gates[gates.length - 1]).toBe(0);
      expect(course.spans.filter((span) => span.tag === CIRCUIT_CORNER_TAG)).toHaveLength(route.corners.length);

      // Clamp a kart round the racing line twice, nudged toward the walls: it never leaves the road
      // and its progress wraps exactly once a lap.
      const line = course.line({ step: 1.5, offset: (progress) => Math.sin(progress / 20) * 3 });
      let fix = course.locate(line[1]![0], line[1]![1]);
      let last = fix.progress;
      let wraps = 0;
      for (const [x, z] of [...line.slice(2), ...line, ...line.slice(0, 2)]) {
        const moved = course.clamp(x + 0.5, z, fix);
        fix = moved.fix;
        expect(fix.inside).toBe(true);
        if (fix.progress < last - course.length / 2) wraps += 1;
        else expect(fix.progress).toBeGreaterThan(last - 3);
        last = fix.progress;
      }
      expect(wraps).toBe(2);

      // The gates make a ring the shared race state laps.
      const ring = course.checkpoints({ at: gates.slice(0, -1), finish: 0 });
      expect(ring.checkpoints[ring.checkpoints.length - 1]!.id).toBe("finish");
      const race = createRaceState({ track: raceTrack({ ...ring, laps: 2 }), win: everyoneFinishes() });
      race.addRacer("kart");
      const drive = course.line({ step: 2 });
      const path = [...drive.slice(3), ...drive, ...drive, ...drive.slice(0, 3)];
      path.forEach(([x, z], index) => race.update(index, { kart: [x, start.elevation, z] }));
      expect(race.finished).toBe(true);
    });
  }
});
