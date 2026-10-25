import { expect, test } from "bun:test";
import { readDamageTable } from "@jgengine/core/combat/damageTable";
import { UnknownTargetProfileError } from "@jgengine/core/combat/damageRuntime";
import { createDeepwardDamage, DAMAGE_TABLE, FITTER_HEALTH, rifleDefinition, sidearmDefinition, weaponReadout } from "./combat";
import { rollItem, weaponStats } from "./items";
import { newDive } from "./state";
import { PRINT_ID } from "../world";

/** Three hands the game actually fields: the issue sidearm and two rolled rifles. */
function pairs() {
  const plain = rollItem("service-rifle", 1, "deepward:damage:plain", "1:fitter");
  const deep = rollItem("service-rifle", 8, "deepward:damage:deep", "4:fitter");
  return [
    { name: "issue sidearm", item: null, damage: 20, interval: 0.32 },
    { name: `rifle L1 (${plain.name})`, item: plain, damage: weaponStats(plain).damage, interval: weaponStats(plain).interval },
    { name: `rifle L8 (${deep.name})`, item: deep, damage: weaponStats(deep).damage, interval: weaponStats(deep).interval },
  ];
}

test("every hand lands the same numbers the local hit path did, and the same time to kill", () => {
  const damage = createDeepwardDamage(() => 0.5);
  for (const pair of pairs()) {
    const definition = pair.item === null ? sidearmDefinition(18) : rifleDefinition(pair.item, 18);
    // The old path subtracted `weapon.damage` per hit; the shared table must produce that number.
    expect(definition.damage.base).toBe(pair.damage);
    const resolution = damage.hit({ target: PRINT_ID, type: "kinetic", base: pair.damage });
    expect(resolution.damage).toBe(pair.damage);
    expect(resolution.multiplier).toBe(1);
    expect(resolution.mitigation).toBe(0);

    // Hits to drop an 80-health Fitter: ceil(80 / damage) before and after.
    const hits = Math.ceil(FITTER_HEALTH / pair.damage);
    const quote = damage.timeToKill({ target: PRINT_ID, type: "kinetic", base: pair.damage, hp: FITTER_HEALTH, intervalSeconds: pair.interval, crit: false });
    expect(quote.damagePerShot).toBe(pair.damage);
    expect(quote.shots).toBe(hits);
    expect(quote.seconds).toBeCloseTo((hits - 1) * pair.interval, 6);
    // A HUD line and the shot read the same definition.
    const readout = weaponReadout({ ...newDive(1), hand: pair.item === null ? "sidearm" : "service-rifle" });
    if (pair.item === null) expect(readout.damage).toBe(pair.damage);
  }
});

test("the damage table is readable data, so a balance change is visible without firing", () => {
  const rows = readDamageTable(DAMAGE_TABLE, { base: 20, armor: { flesh: 0, armor: 0, shield: 0 } });
  const kinetic = rows.filter(row => row.type === "kinetic");
  expect(kinetic.map(row => row.resistance)).toEqual(["flesh"]);
  expect(kinetic[0]).toMatchObject({ multiplier: 1, armor: 0, mitigation: 0, net: 1, damage: 20 });
});

test("a hit on a target with no registered profile is refused, not dealt as zero", () => {
  const damage = createDeepwardDamage(() => 0.5);
  expect(() => damage.hit({ target: "raider", type: "kinetic", base: 20 })).toThrow(UnknownTargetProfileError);
  expect(damage.target(PRINT_ID)).toEqual({ resistance: "flesh", armor: 0 });
});
