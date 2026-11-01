import { expect, test } from "bun:test";

import { changeStatPool, createPacedSchedule, createStatPool, pickWeighted, tierAt } from "../parts";
import { seededRng } from "../random/rng";

/**
 * @recipe Spawn director by pressure
 * A pressure Meter, a Ladder of pressure bands, and a Schedule retuned to each band's pace, with a Table per band.
 */
test("spawn director by pressure", () => {
  const rng = seededRng("director");
  let pressure = createStatPool({ max: 100, current: 0 });
  const bands = [{ id: "calm", at: 0, every: 20, mix: ["rat"] }, { id: "tense", at: 40, every: 8, mix: ["rat", "wolf"] }, { id: "frantic", at: 80, every: 3, mix: ["wolf", "ogre"] }];
  const pace = createPacedSchedule({ firstAt: 0, every: 20 }, rng);
  const spawn = (now: number) => {
    const band = tierAt(bands, pressure.current)?.id;
    const chosen = bands.find((b) => b.id === band) ?? bands[0];
    pace.retune({ every: chosen?.every ?? 20 });
    return pace.due(now).map(() => pickWeighted(rng, chosen?.mix ?? [], () => 1));
  };

  expect(spawn(0)).toEqual(["rat"]);
  pressure = changeStatPool(pressure, 85).pool;
  expect(spawn(20)).toHaveLength(1);
  expect(pace.remaining(20)).toBe(3);
  expect(spawn(26).every((id) => id === "wolf" || id === "ogre")).toBe(true);
});
