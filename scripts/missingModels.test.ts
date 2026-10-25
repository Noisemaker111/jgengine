import { describe, expect, test } from "bun:test";

import { missingModelsProblem } from "./browser-lib";

describe("captures fail on placeholder models", () => {
  test("no missing model is no problem", () => {
    expect(missingModelsProblem([])).toBeNull();
  });

  test("names each missing model and how to fix it", () => {
    const line = missingModelsProblem([{ name: "pack/Crate", url: "/models/pack/Crate.glb", message: "404" }]);
    expect(line).toContain("MISSING MODELS: 1");
    expect(line).toContain("pack/Crate");
    expect(line).toContain("games:provision");
  });
});
