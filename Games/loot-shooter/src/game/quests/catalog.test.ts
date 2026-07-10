import { describe, expect, test } from "bun:test";
import { enemyById } from "../entities/enemies/catalog";
import { MANUAL_OBJECTIVE, challenges } from "./catalog";

const MANUAL_KINDS = new Set<string>(Object.values(MANUAL_OBJECTIVE));

describe("challenge catalog", () => {
  test("ships eight challenges with unique ids", () => {
    expect(challenges.length).toBe(8);
    expect(new Set(challenges.map((challenge) => challenge.id)).size).toBe(8);
  });

  test("every kill objective targets a real enemy", () => {
    for (const challenge of challenges) {
      for (const objective of challenge.objectives) {
        if (objective.kind === "kill") {
          expect(objective.target).toBeDefined();
          expect(enemyById(objective.target!)).toBeDefined();
        } else {
          expect(MANUAL_KINDS.has(objective.kind)).toBe(true);
        }
        expect(objective.count).toBeGreaterThan(0);
      }
    }
  });

  test("every challenge pays scrap", () => {
    for (const challenge of challenges) {
      expect(challenge.rewards?.economy?.scrap ?? 0).toBeGreaterThan(0);
    }
  });
});
