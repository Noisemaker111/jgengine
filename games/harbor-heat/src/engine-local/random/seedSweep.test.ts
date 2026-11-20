import { describe, expect, test } from "bun:test";

import { acrossSeeds } from "./seedSweep";

describe("acrossSeeds", () => {
  test("reports the share of seeds a scenario held for and names the ones it failed", () => {
    const sweep = acrossSeeds(10, (seed) => !seed.endsWith(":3") && !seed.endsWith(":7"));
    expect(sweep.rate).toBe(0.8);
    expect(sweep.failed).toEqual(["sweep:3", "sweep:7"]);
  });
});
