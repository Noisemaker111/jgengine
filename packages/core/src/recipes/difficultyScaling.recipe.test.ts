import { expect, test } from "bun:test";

import { createStatGraph, tierAt } from "../parts";

/**
 * @recipe Difficulty scaling
 * A Ladder over a skill score picks the difficulty, and that level's Modifiers source scales enemy health and damage.
 */
test("difficulty scaling", () => {
  const enemy = createStatGraph({ inputs: [{ id: "health", base: 100 }, { id: "damage", base: 10 }] }).create();
  const levels = [{ id: "easy", at: 0, health: 0.75, damage: 0.5 }, { id: "normal", at: 40, health: 1, damage: 1 }, { id: "hard", at: 80, health: 1.5, damage: 1.5 }];
  const rescale = (score: number) => {
    const level = tierAt(levels, score)?.id ?? "easy";
    const set = levels.find((l) => l.id === level) ?? levels[0];
    enemy.addSource("difficulty", { health: { source: level, op: "mul", value: set?.health ?? 1 }, damage: { source: level, op: "mul", value: set?.damage ?? 1 } });
    return level;
  };

  expect(rescale(10)).toBe("easy");
  expect(enemy.get("health")).toBe(75);
  expect(rescale(90)).toBe("hard");
  expect([enemy.get("health"), enemy.get("damage")]).toEqual([150, 15]);
});
