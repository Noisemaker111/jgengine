import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkStreetRuleParity,
  netRulesKeys,
  ruleKeyList,
  streetRuleMembers,
} from "./check-street-rule-parity";

/**
 * The gate that keeps one slider set one slider set. Fixture source text stands in for the real
 * files so a dropped dial can be proven detectable without touching them.
 */

const GENERATOR = `
export interface StreetNetworkRules {
  seed: string;
  /** Organic boundary clipping. */
  outline?: number;
  gridness: number;
  width: number;
  /** Road-surface relief. */
  elevation?: number;
}
`;

const CITY_KIND = `
export function resolveCityObject(object: SceneKindObject) {
  const netRules: StreetNetworkRules = {
    seed: object.id,
    outline: rules.outline,
    gridness: rules.gridness,
    width: rules.streetWidth,
    elevation: rules.elevation,
  };
  return generateStreets(netRules, 1, 1);
}
`;

const STREETS_HANDLER = `
const RULE_KEYS: readonly (keyof Omit<StreetNetworkRules, "seed">)[] = [
  "outline",
  "gridness",
  "width",
  "elevation",
];
`;

describe("check-street-rule-parity", () => {
  test("reads the dial set off the interface, seed excluded", () => {
    expect(streetRuleMembers(GENERATOR)).toEqual(["seed", "outline", "gridness", "width", "elevation"]);
    expect(checkStreetRuleParity({ generator: GENERATOR, cityKind: CITY_KIND, streetsHandler: STREETS_HANDLER }).dials).toEqual([
      "outline",
      "gridness",
      "width",
      "elevation",
    ]);
  });

  test("passes when both consumers forward every dial", () => {
    const result = checkStreetRuleParity({ generator: GENERATOR, cityKind: CITY_KIND, streetsHandler: STREETS_HANDLER });
    expect(result.ok).toBe(true);
    expect(result.gaps).toEqual([]);
  });

  test("names the dial the city volume kind drops", () => {
    const drifted = CITY_KIND.replace("    elevation: rules.elevation,\n", "");
    const result = checkStreetRuleParity({ generator: GENERATOR, cityKind: drifted, streetsHandler: STREETS_HANDLER });
    expect(result.ok).toBe(false);
    expect(result.gaps).toEqual([
      { file: "packages/core/src/world/cityKind.ts", site: "netRules", missing: ["elevation"] },
    ]);
  });

  test("names the dial the generate_streets verb drops", () => {
    const drifted = STREETS_HANDLER.replace(`  "outline",\n`, "");
    const result = checkStreetRuleParity({ generator: GENERATOR, cityKind: CITY_KIND, streetsHandler: drifted });
    expect(result.ok).toBe(false);
    expect(result.gaps).toEqual([
      { file: "packages/editor/src/handlers/streets.ts", site: "RULE_KEYS", missing: ["outline"] },
    ]);
  });

  test("a dial added to the interface fails both consumers until they carry it", () => {
    const grown = GENERATOR.replace("}\n", "  maxGrade?: number;\n}\n");
    const result = checkStreetRuleParity({ generator: grown, cityKind: CITY_KIND, streetsHandler: STREETS_HANDLER });
    expect(result.ok).toBe(false);
    expect(result.gaps.map((gap) => gap.missing)).toEqual([["maxGrade"], ["maxGrade"]]);
  });

  test("a renamed or moved interface fails rather than passing on an empty dial set", () => {
    const result = checkStreetRuleParity({ generator: "export interface Other { seed: string }", cityKind: CITY_KIND, streetsHandler: STREETS_HANDLER });
    expect(result.ok).toBe(false);
    expect(result.gaps.some((gap) => gap.site === "StreetNetworkRules")).toBe(true);
  });

  test("the real files parse — the extractors track the shipped source, not a fixture shape", () => {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const read = (rel: string): string => readFileSync(join(root, rel), "utf8");
    expect(streetRuleMembers(read("packages/core/src/world/streetGenerator.ts"))).toContain("compactness");
    expect(netRulesKeys(read("packages/core/src/world/cityKind.ts"))).toContain("compactness");
    expect(ruleKeyList(read("packages/editor/src/handlers/streets.ts"))).toContain("compactness");
  });
});
