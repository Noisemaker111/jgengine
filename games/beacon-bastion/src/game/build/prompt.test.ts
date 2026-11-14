import { describe, expect, test } from "bun:test";

import { buildPrompt } from "./prompt";

describe("buildPrompt", () => {
  test("asks for a worker before any is selected", () => {
    expect(buildPrompt(false, true)).toBe("Pick a worker to hire");
    expect(buildPrompt(false, false)).toBe("Pick a worker to hire");
  });

  test("points at the open plots once an affordable worker is selected", () => {
    expect(buildPrompt(true, true)).toBe("Click an open plot on the sidewalk");
  });

  test("explains the blocker when the selected worker is unaffordable", () => {
    expect(buildPrompt(true, false)).toBe("Need more cash");
  });
});
