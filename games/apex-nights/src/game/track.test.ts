import { describe, expect, test } from "bun:test";
import { createRaceState } from "@jgengine/core/game/race";
import { tickDrivableVehicle } from "@jgengine/core/physics/drivableVehicle";
import { createKinematicVehicle } from "@jgengine/core/physics/kinematicVehicle";

import { editorLayers } from "../editorLayers";
import { BASE, rivalAxis } from "./race";
import { circuitOf, gridSlot, nearestOnLine, trackOf } from "./track";

describe("the authored circuit", () => {
  const circuit = circuitOf(editorLayers);

  test("a rival on the racing line stays on the road and finishes two laps", () => {
    const grid = gridSlot(circuit, 1);
    const car = createKinematicVehicle(BASE, { position: grid.position, heading: grid.heading });
    const race = createRaceState({ track: trackOf(circuit, 2) });
    race.addRacer("rival", 0);
    let worst = 0;
    let time = 0;
    for (let frame = 0; frame < 20 * 150 && race.progressOf("rival")?.finished !== true; frame += 1) {
      time += 0.05;
      const step = tickDrivableVehicle(car, 0.05, rivalAxis(car, true), { modifiers: { topSpeedScale: 0.85, accelScale: 0.85 } });
      if (frame > 60) worst = Math.max(worst, nearestOnLine(circuit, step.pose.position[0], step.pose.position[2]).off);
      race.update(time, new Map([["rival", step.pose.position]]));
    }
    expect(race.progressOf("rival")?.finished).toBe(true);
    expect(worst).toBeLessThan(circuit.width / 2);
  });
});
