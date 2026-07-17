import { describe, expect, test } from "bun:test";

import {
  activeSetBonuses,
  applySetBonuses,
  candidateViolatesForbid,
  captureProvenance,
  countSetMembers,
  identityOf,
  isIdentityValid,
  matchesQuery,
  validateIdentity,
  type CompatibilityRule,
  type SetBonus,
} from "@jgengine/core/item/itemIdentity";
import type { InstalledPart } from "@jgengine/core/item/modularItem";

const barrel: InstalledPart = { slotId: "barrel", part: { id: "long_barrel", category: "barrel" } };
const scope: InstalledPart = { slotId: "sight", part: { id: "scope_4x", category: "sight" } };
const cryoCore: InstalledPart = { slotId: "core", part: { id: "cryo_core", category: "core" } };

describe("item identity — query matching", () => {
  test("empty query matches any identity", () => {
    expect(matchesQuery(identityOf("gun", [], []), {})).toBe(true);
  });

  test("family, tag, category, and part fields all AND together", () => {
    const identity = identityOf("gun", ["Blackwood", "kinetic"], [barrel, scope]);
    expect(matchesQuery(identity, { family: "gun", allTags: ["Blackwood", "kinetic"] })).toBe(true);
    expect(matchesQuery(identity, { anyTags: ["Voltek", "kinetic"] })).toBe(true);
    expect(matchesQuery(identity, { hasCategory: "sight", hasPart: "long_barrel" })).toBe(true);
    expect(matchesQuery(identity, { family: "potion" })).toBe(false);
    expect(matchesQuery(identity, { allTags: ["Blackwood", "elemental"] })).toBe(false);
    expect(matchesQuery(identity, { hasPart: "short_barrel" })).toBe(false);
  });
});

describe("item identity — compatibility rules", () => {
  const rules: readonly CompatibilityRule[] = [
    {
      id: "scope-needs-barrel",
      kind: "require",
      when: { hasCategory: "sight" },
      then: { hasCategory: "barrel" },
      message: "a sight requires a barrel",
    },
    {
      id: "no-cryo-incendiary",
      kind: "forbid",
      when: { allTags: ["incendiary"] },
      forbid: { hasPart: "cryo_core" },
      message: "incendiary cannot mount a cryo core",
    },
  ];

  test("a require rule fails only when its trigger matches but its condition does not", () => {
    const scopeNoBarrel = identityOf("gun", [], [scope]);
    const violations = validateIdentity(scopeNoBarrel, rules);
    expect(violations).toEqual([{ ruleId: "scope-needs-barrel", kind: "require", message: "a sight requires a barrel" }]);
    expect(isIdentityValid(identityOf("gun", [], [scope, barrel]), rules)).toBe(true);
  });

  test("a forbid rule fires on a forbidden combination", () => {
    const bad = identityOf("gun", ["incendiary"], [cryoCore]);
    expect(validateIdentity(bad, rules)).toEqual([
      { ruleId: "no-cryo-incendiary", kind: "forbid", message: "incendiary cannot mount a cryo core" },
    ]);
  });

  test("rules with no matching trigger are inert", () => {
    expect(isIdentityValid(identityOf("gun", [], [barrel]), rules)).toBe(true);
  });

  test("backtracking contract: candidate blocked by a forbid rule, allowed otherwise", () => {
    const partial = identityOf("gun", ["incendiary"], [barrel]);
    const blocked = candidateViolatesForbid(partial, { slotId: "core", part: { id: "cryo_core", category: "core" } }, rules);
    expect(blocked?.id).toBe("no-cryo-incendiary");
    const ok = candidateViolatesForbid(partial, { slotId: "core", part: { id: "kinetic_core", category: "core" } }, rules);
    expect(ok).toBeNull();
  });

  test("backtracking ignores require rules — they may be satisfied by a later placement", () => {
    const partial = identityOf("gun", [], []);
    expect(candidateViolatesForbid(partial, { slotId: "sight", part: { id: "scope_4x", category: "sight" } }, rules)).toBeNull();
  });
});

describe("item identity — set/match bonuses", () => {
  const bonuses: readonly SetBonus[] = [
    { id: "twin-barrel", countBy: "category", value: "barrel", min: 2, stats: { pellets: 1 } },
    { id: "blackwood-loyalty", countBy: "tag", value: "Blackwood", min: 1, stats: { recoil: -0.2 }, namePart: "Frontier" },
  ];

  test("countSetMembers counts by category, part id, or tag", () => {
    const identity = identityOf(
      "gun",
      ["Blackwood"],
      [barrel, { slotId: "barrel2", part: { id: "long_barrel", category: "barrel" } }],
    );
    expect(countSetMembers(identity, bonuses[0]!)).toBe(2);
    expect(countSetMembers(identity, bonuses[1]!)).toBe(1);
    expect(countSetMembers(identity, { id: "x", countBy: "partId", value: "long_barrel", min: 1, stats: {} })).toBe(2);
  });

  test("activeSetBonuses selects only bonuses meeting the threshold", () => {
    const oneBarrel = identityOf("gun", ["Blackwood"], [barrel]);
    expect(activeSetBonuses(oneBarrel, bonuses).map((b) => b.id)).toEqual(["blackwood-loyalty"]);
  });

  test("applySetBonuses folds additive deltas without mutating the input", () => {
    const base = { recoil: 1, pellets: 3 };
    const out = applySetBonuses(base, bonuses);
    expect(out).toEqual({ recoil: 0.8, pellets: 4 });
    expect(base).toEqual({ recoil: 1, pellets: 3 });
  });
});

describe("item identity — the-robots manufacturers migrate as one data catalog", () => {
  // Manufacturer identity that once lived as hardcoded fields in the game's
  // handroll table, re-expressed as caller-owned tags + generic rules. No
  // manufacturer-specific code lives in core.
  const rules: readonly CompatibilityRule[] = [
    { id: "blackwood-never-elemental", kind: "forbid", when: { allTags: ["Blackwood"] }, forbid: { anyTags: ["incendiary", "shock", "corrosive", "flux"] } },
    { id: "detonic-forces-explosive", kind: "require", when: { allTags: ["Detonic"] }, then: { allTags: ["explosive"] } },
  ];

  test("Blackwood kinetic gun is valid; Blackwood incendiary is forbidden", () => {
    expect(isIdentityValid(identityOf("gun", ["Blackwood", "kinetic"], []), rules)).toBe(true);
    expect(isIdentityValid(identityOf("gun", ["Blackwood", "incendiary"], []), rules)).toBe(false);
  });

  test("Detonic requires the explosive element", () => {
    expect(isIdentityValid(identityOf("gun", ["Detonic"], []), rules)).toBe(false);
    expect(isIdentityValid(identityOf("gun", ["Detonic", "explosive"], []), rules)).toBe(true);
  });
});

describe("item identity — proves the seam on a non-weapon family", () => {
  // A modular alchemy potion: same identity/constraint machinery, zero combat nouns.
  const rules: readonly CompatibilityRule[] = [
    { id: "volatile-needs-stabilizer", kind: "require", when: { hasCategory: "reagent" }, then: { hasCategory: "stabilizer" } },
    { id: "no-double-catalyst", kind: "forbid", when: { hasCategory: "catalyst" }, forbid: { hasPart: "unstable_catalyst" } },
  ];
  const reagent: InstalledPart = { slotId: "base", part: { id: "phoenix_ash", category: "reagent" } };
  const stabilizer: InstalledPart = { slotId: "bind", part: { id: "clay", category: "stabilizer" } };

  test("an unstabilized reagent is invalid; adding a stabilizer fixes it", () => {
    expect(isIdentityValid(identityOf("potion", ["fire"], [reagent]), rules)).toBe(false);
    expect(isIdentityValid(identityOf("potion", ["fire"], [reagent, stabilizer]), rules)).toBe(true);
  });
});

describe("item identity — provenance", () => {
  test("captureProvenance produces a JSON round-trippable record for regeneration", () => {
    const identity = identityOf("gun", ["Blackwood", "kinetic"], [barrel, scope]);
    const bonuses: SetBonus[] = [{ id: "twin-barrel", countBy: "category", value: "barrel", min: 1, stats: { pellets: 1 } }];
    const provenance = captureProvenance(identity, activeSetBonuses(identity, bonuses), 42);
    expect(provenance).toEqual({
      family: "gun",
      tags: ["Blackwood", "kinetic"],
      parts: { barrel: "long_barrel", sight: "scope_4x" },
      bonuses: ["twin-barrel"],
      seed: 42,
    });
    expect(JSON.parse(JSON.stringify(provenance))).toEqual(provenance);
  });

  test("seed is omitted for hand-authored items", () => {
    const provenance = captureProvenance(identityOf("gun", [], []), []);
    expect("seed" in provenance).toBe(false);
  });
});
