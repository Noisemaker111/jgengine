import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getRecipe } from "../index";

describe("click-target snippet", () => {
  test("points the target's HUD at the kit meter and matches the printed recipe", () => {
    const code = readFileSync(join(import.meta.dir, "click-target.ts"), "utf8");
    expect(code).toContain("KitMeter");
    expect(code).not.toContain("StatBar");
    expect(getRecipe("click-target")?.code).toBe(code);
  });
});
