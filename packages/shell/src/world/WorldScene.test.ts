import { describe, expect, test } from "bun:test";

import { drawsScaledModel } from "./WorldScene";

describe("WorldScene scaled models", () => {
  test("only a placement with its own visual scale draws through a scale group", () => {
    expect(drawsScaledModel({ visual: { scale: [12, 30, 18] } })).toBe(true);
    expect(drawsScaledModel({ visual: { color: "#fff" } })).toBe(false);
    expect(drawsScaledModel({ visual: undefined })).toBe(false);
  });
});
