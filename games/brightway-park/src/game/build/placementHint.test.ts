import { describe, expect, test } from "bun:test";
import { hoverRefusal } from "./placementHint";

describe("hoverRefusal", () => {
  test("names the world's refusal, cost included", () => {
    expect(hoverRefusal({ ok: false, reason: "Something is already built there", code: "taken" })).toBe("Something is already built there");
    expect(hoverRefusal({ ok: false, reason: "Carousel needs $250 more park cash", code: "cost" })).toContain("$250");
  });
  test("is null for a buildable, affordable spot", () => {
    expect(hoverRefusal({ ok: true, cell: [0, 0] })).toBeNull();
  });
});
