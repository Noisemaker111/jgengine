import { describe, expect, test } from "bun:test";

import { ARMOR_SAVE_BUMP } from "../run/constants";
import { resolveCrusherContact } from "./contact";

describe("wreckway crusher contact resolution", () => {
  test("clear when the compactor has not reached the kart", () => {
    expect(resolveCrusherContact(100, 50, false)).toEqual({ outcome: "clear" });
    expect(resolveCrusherContact(100, 50, true)).toEqual({ outcome: "clear" });
  });

  test("crushed when caught with no armor charge", () => {
    expect(resolveCrusherContact(100, 99, false)).toEqual({ outcome: "crushed" });
  });

  test("saved when caught with an armed armor charge, rebounding ahead of the compactor", () => {
    const result = resolveCrusherContact(100, 99, true);
    expect(result.outcome).toBe("saved");
    if (result.outcome === "saved") expect(result.reboundZ).toBe(99 + ARMOR_SAVE_BUMP);
  });
});
