import { expect, test } from "bun:test";

import { createPhaseSchedule, inheritValues } from "../parts";
import { seededRng } from "../random/rng";

/**
 * @recipe Dog breeding
 * Inheritance gives the pup its values from both parents with a rare mutation, and Phases grow it from puppy to adult.
 */
test("dog breeding", () => {
  const rng = seededRng("pups");
  const mother = { health: 80, speed: 6, bite: 4 };
  const father = { health: 100, speed: 5, bite: 7 };
  const pup = inheritValues(mother, father, rng, { mutation: { rolls: 2, chance: 0.05, amount: 3, fields: ["health", "speed", "bite"] } });
  const growth = createPhaseSchedule({ phases: [{ state: "puppy", durationSeconds: 600 }, { state: "adult" }] });

  expect([80, 100]).toContain(pup.values.health - 3 * pup.mutations.filter((f) => f === "health").length);
  expect(growth.state()).toBe("puppy");
  growth.tick(599);
  expect(growth.state()).toBe("puppy");
  growth.tick(1);
  expect(growth.state()).toBe("adult");
});
