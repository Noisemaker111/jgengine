import { describe, expect, test } from "bun:test";

import { createUnlockCatalog } from "@jgengine/core/game/unlocks";
import { createGateSet, gateFacts, type GateDef, type GateFacts } from "@jgengine/core/progression/gates";
import { createStanding } from "@jgengine/core/progression/standing";

const CATALOG = createUnlockCatalog([
  { id: "ride_dropzone", category: "ride" },
  { id: "stall_souvenir", category: "stall" },
  { id: "deco_garden", category: "scenery" },
]);

const STANDING = createStanding({
  tracks: [{ id: "park" }],
  outcomes: [{ id: "good_day", impacts: { park: 5 } }],
});

const GATES: readonly GateDef[] = [
  { id: "gate_dropzone", unlock: "ride_dropzone", label: "Drop tower", requires: { standing: { trackId: "park", min: 20 } } },
  { id: "gate_souvenir", unlock: "stall_souvenir", requires: { standing: { trackId: "park", min: 10 } } },
  { id: "gate_garden", unlock: "deco_garden", requires: { balance: { currency: "cash", min: 500 } } },
];

const facts = (standing: number, cash = 0): GateFacts => ({
  standing: () => standing,
  balance: (currency) => (currency === "cash" ? cash : 0),
});

describe("gate set", () => {
  test("a gate opens exactly at its standing threshold, not before", () => {
    const set = createGateSet({ gates: GATES, catalog: CATALOG, standing: STANDING });
    expect(set.isOpen("gate_dropzone", facts(19.99))).toBe(false);
    expect(set.isOpen("gate_dropzone", facts(20))).toBe(true);
    expect(set.status(facts(19))[0]).toMatchObject({ open: false, missing: ["standing"] });
    expect(set.status(facts(20))[0]).toMatchObject({ open: true, missing: [] });
  });

  test("a gate opens exactly at its balance threshold", () => {
    const set = createGateSet({ gates: GATES, catalog: CATALOG });
    expect(set.isOpen("gate_garden", facts(0, 499))).toBe(false);
    expect(set.isOpen("gate_garden", facts(0, 500))).toBe(true);
    expect(set.open(facts(0, 500)).map((gate) => gate.id)).toEqual(["gate_garden"]);
  });

  test("claim hands back only the unmet gates whose unlock is not already granted", () => {
    const set = createGateSet({ gates: GATES, catalog: CATALOG });
    expect(set.claim(facts(25, 500), []).map((gate) => gate.id)).toEqual([
      "gate_dropzone",
      "gate_souvenir",
      "gate_garden",
    ]);
    expect(set.claim(facts(25, 500), ["ride_dropzone"]).map((gate) => gate.unlock)).toEqual([
      "stall_souvenir",
      "deco_garden",
    ]);
    expect(set.claim(facts(5, 0), [])).toEqual([]);
  });

  test("facts can be read straight off a standing ledger", () => {
    const standing = createStanding({ tracks: [{ id: "park" }] });
    standing.adjust("jon", "park", 12);
    const read = gateFacts(standing, "jon", { cash: 700 });
    expect(read.standing("park")).toBe(12);
    expect(read.balance("cash")).toBe(700);
    expect(read.balance("scrip")).toBe(0);
  });

  test("a gate whose reward resolves to nothing fails at load", () => {
    expect(() =>
      createGateSet({ gates: [{ id: "gate_dead", unlock: "tier_janitor" }], catalog: CATALOG }),
    ).toThrow(/gate_dead.*unlocks unknown id "tier_janitor"/);
  });

  test("a gate reading an unauthored standing track fails at load", () => {
    expect(() =>
      createGateSet({
        gates: [{ id: "gate_district", unlock: "deco_garden", requires: { standing: { trackId: "district" } } }],
        catalog: CATALOG,
        standing: STANDING,
      }),
    ).toThrow(/unknown standing track "district"/);
  });

  test("duplicate ids and unusable numbers fail at load", () => {
    expect(() =>
      createGateSet({ gates: [{ id: "a", unlock: "deco_garden" }, { id: "a", unlock: "deco_garden" }], catalog: CATALOG }),
    ).toThrow(/declared twice/);
    expect(() =>
      createGateSet({
        gates: [{ id: "a", unlock: "deco_garden", requires: { balance: { currency: "cash", min: Number.NaN } } }],
        catalog: CATALOG,
      }),
    ).toThrow(/balance min must be finite/);
    expect(() =>
      createGateSet({
        gates: [{ id: "a", unlock: "deco_garden", requires: { standing: { trackId: "park", min: 5, max: 1 } } }],
        catalog: CATALOG,
        standing: STANDING,
      }),
    ).toThrow(/min <= max/);
  });

  test("a gate with no requirements is open from the start", () => {
    const set = createGateSet({ gates: [{ id: "gate_start", unlock: "deco_garden" }], catalog: CATALOG });
    expect(set.isOpen("gate_start", facts(-100))).toBe(true);
    expect(set.isOpen("gate_missing", facts(100))).toBe(false);
  });
});
