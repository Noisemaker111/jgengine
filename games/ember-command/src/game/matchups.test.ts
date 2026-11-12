import { describe, expect, test } from "bun:test";
import { readDamageTable } from "@jgengine/core/combat/damage/damageTable";

import { COMBATANTS } from "./catalog";
import { createMatchups, matchupDamage, MATCHUPS } from "./matchups";

const BASE = 10;
const NEAR = 2.99;
const FAR = 3;

/**
 * Every pairing the old hand-rolled resolver (`tactics.ts`, removed when range and armor moved onto
 * the shared damage runtime) did not land at face value, recorded from it at base 10: the same
 * products, in the same order, so the runtime has to match them exactly. Every pairing not listed
 * landed at base.
 */
const RECORDED: Readonly<Record<string, number>> = {
  "footman>reaver@near": BASE * 1.5,
  "footman>reaver@far": BASE * 1.5,
  ...Object.fromEntries(["barracks", "farm", "guard_tower", "keep_enemy", "keep_player", "warcamp"].flatMap((building) => [
    [`reaver>${building}@near`, BASE * 2],
    [`reaver>${building}@far`, BASE * 2],
  ])),
  ...Object.fromEntries(["barracks", "farm", "footman", "grunt", "guard_tower", "hero", "peasant", "rifleman", "warcamp"].map((target) => [`rifleman>${target}@near`, BASE * 0.45 * 1])),
  "rifleman>reaver@near": BASE * 0.45 * 0.55,
  "rifleman>reaver@far": BASE * 1 * 0.55,
  "rifleman>keep_player@near": BASE * 0.45 * 1.35,
  "rifleman>keep_player@far": BASE * 1 * 1.35,
  "rifleman>keep_enemy@near": BASE * 0.45 * 1.35,
  "rifleman>keep_enemy@far": BASE * 1 * 1.35,
};

describe("the roster's matchups resolve through the shared damage runtime", () => {
  test("every attacker against every target, near and far, lands exactly what the old resolver landed", () => {
    const runtime = createMatchups();
    const ids = Object.keys(COMBATANTS);
    for (const attacker of ids) {
      for (const target of ids) {
        for (const [band, distance] of [["near", NEAR], ["far", FAR]] as const) {
          const key = `${attacker}>${target}@${band}`;
          const dealt = matchupDamage(runtime, BASE, { id: "a", catalogId: attacker }, { id: "t", catalogId: target }, distance);
          expect({ key, dealt }).toEqual({ key, dealt: RECORDED[key] ?? BASE });
        }
      }
    }
  });

  test("the matchups read as a table a designer can check", () => {
    const rows = readDamageTable(MATCHUPS, { base: BASE }).filter((row) => row.multiplier !== 1);
    expect(rows.map((row) => `${row.type} vs ${row.resistance}: ${row.damage}`)).toEqual([
      "blade vs heavy: 15",
      "siege vs building: 20",
      "siege vs keep: 20",
      "rifle vs heavy: 5.5",
      "rifle vs keep: 13.5",
    ]);
  });
});
