import { describe, expect, test } from "bun:test";

import { buildPrompt } from "./prompt";

describe("buildPrompt", () => {
  test("asks for a tower before any is selected", () => {
    expect(buildPrompt(false, true)).toBe("Pick a tower to build");
    expect(buildPrompt(false, false)).toBe("Pick a tower to build");
  });

  test("points at the foundation rings once an affordable tower is selected", () => {
    expect(buildPrompt(true, true)).toBe("Click a foundation ring");
  });

  test("explains the blocker when the selected tower is unaffordable", () => {
    expect(buildPrompt(true, false)).toBe("Need more gold");
  });
});
