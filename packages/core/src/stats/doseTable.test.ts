import { describe, expect, test } from "bun:test";

import { createDoseTable, hasRoomFor } from "./doseTable";
import { createVitals } from "./vitals";

describe("doses", () => {
  test("a dose over time lands evenly and stops when its seconds are up", () => {
    const body = createVitals([{ id: "torpor", max: 200, start: 0 }]);
    body.dose({ vital: "torpor", amount: 40, seconds: 16, source: "narcotic" });
    expect(body.value("torpor")).toBe(0);
    body.tick(8);
    expect(body.value("torpor")).toBeCloseTo(20, 9);
    expect(body.doses()).toEqual([{ vital: "torpor", amount: 20, seconds: 8, source: "narcotic" }]);
    body.tick(10);
    expect(body.value("torpor")).toBeCloseTo(40, 9);
    expect(body.doses()).toEqual([]);
  });

  test("small shield potions fill only to 50; a big one goes to 100 (Fortnite's rule as data)", () => {
    const player = createVitals([{ id: "shield", max: 100, start: 0 }]);
    const small = { vital: "shield", amount: 25, seconds: 1, upTo: 50 };
    player.dose(small);
    player.tick(1);
    player.dose(small);
    player.tick(1);
    player.dose(small);
    player.tick(1);
    expect(player.value("shield")).toBe(50);
    player.dose({ vital: "shield", amount: 50, seconds: 2 });
    player.tick(2);
    expect(player.value("shield")).toBe(100);
  });

  test("a dose still landing survives a save", () => {
    const body = createVitals([{ id: "torpor", max: 200, start: 0, rate: 0 }]);
    body.dose({ vital: "torpor", amount: 30, seconds: 3 });
    body.tick(1);
    const copy = createVitals([{ id: "torpor", max: 200, start: 0 }]);
    copy.restore(JSON.parse(JSON.stringify(body.state())));
    copy.tick(2);
    expect(copy.value("torpor")).toBeCloseTo(30, 9);
  });
});

describe("dose table", () => {
  const foods = createDoseTable({
    raptor: {
      kibble: [{ vital: "affinity", amount: 3.5 }, { vital: "food", amount: 80 }],
      raw_meat: [{ vital: "affinity", amount: 1 }, { vital: "food", amount: 50 }, { vital: "ineffectiveness", amount: 0.03 }],
    },
    dodo: { mejoberry: [{ vital: "affinity", amount: 1 }, { vital: "food", amount: 20 }] },
  });

  test("each receiver has its own foods, in its order of preference", () => {
    expect(foods.sources("raptor")).toEqual(["kibble", "raw_meat"]);
    expect(foods.of("dodo", "raw_meat")).toBeNull();
    const held = new Set(["raw_meat", "kibble"]);
    expect(foods.pick("raptor", (food) => held.has(food))).toBe("kibble");
    held.delete("kibble");
    expect(foods.pick("raptor", (food) => held.has(food))).toBe("raw_meat");
    expect(foods.pick("dodo", (food) => held.has(food))).toBeNull();
  });

  test("a creature eats once its food meter has room for the meal", () => {
    const raptor = createVitals([{ id: "food", max: 100, start: 70 }, { id: "affinity", max: 7, start: 0 }, { id: "ineffectiveness", max: 10, start: 0 }]);
    const fits = (food: string, doses: readonly { vital: string; amount: number }[]) => food === "raw_meat" && hasRoomFor(raptor, doses, "food");
    expect(foods.pick("raptor", fits)).toBeNull();
    raptor.change("food", -20);
    const meal = foods.pick("raptor", fits);
    expect(meal).toBe("raw_meat");
    raptor.dose(...(foods.of("raptor", "raw_meat") ?? []));
    expect([raptor.value("affinity"), raptor.value("food"), raptor.value("ineffectiveness")]).toEqual([1, 100, 0.03]);
  });

  test("a fallback row answers for everyone without one: a sim and its meals", () => {
    const meals = createDoseTable({ "*": { lasagna: [{ vital: "hunger", amount: 60, seconds: 30 }, { vital: "fun", amount: 5 }] } }, { fallback: "*" });
    const sim = createVitals([{ id: "hunger", max: 100, start: 20 }, { id: "fun", max: 100, start: 50 }]);
    sim.dose(...(meals.of("bella", "lasagna") ?? []));
    sim.tick(30);
    expect(sim.value("hunger")).toBeCloseTo(80, 9);
    expect(sim.value("fun")).toBe(55);
  });
});
