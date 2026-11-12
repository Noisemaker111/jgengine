import { describe, expect, test } from "bun:test";
import { getGenerator, runGenerator } from "@jgengine/core/generator/generator";
import { ALIEN_NAMES, alienNames } from "./names";

describe("alien names", () => {
  test("a colony seed names the same aliens it named before the generator (fixed-seed fingerprint)", () => {
    expect(alienNames("a", 4)).toEqual(["NixorrDruaeshAeloorr", "NixaephSsooth", "ThraaeshZyiikThraax", "KyaphNixael"]);
  });

  test("names come from the registered generator, and different colonies get different names", () => {
    expect(getGenerator("odd-orbit.alien-names")?.output).toBe(ALIEN_NAMES.output);
    expect(runGenerator(ALIEN_NAMES, { seed: "a", count: 4 })).toEqual(alienNames("a", 4));
    expect(alienNames("b", 4)).not.toEqual(alienNames("a", 4));
    for (const name of alienNames("bounds", 40)) expect(name).toMatch(/^[A-Z][A-Za-z]+$/);
  });
});
