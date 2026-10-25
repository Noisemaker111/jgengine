import { describe, expect, test } from "bun:test";
import { feelOf } from "@jgengine/core/physics/vehicleParts";

import { BASE_HANDLING, claimedChange, swapPart, tuningFrom } from "./build";
import { partById, PARTS } from "./catalog";

describe("drift-foundry modular kart handling", () => {
  test("bare chassis is the authored base handling and has no route capabilities", () => {
    const tuning = tuningFrom([]);
    expect(tuning.topSpeed).toBeCloseTo(BASE_HANDLING.topSpeed, 5);
    expect(tuning.engineAccel).toBeCloseTo(BASE_HANDLING.engineAccel, 5);
    expect(tuning.turnRate).toBeCloseTo(BASE_HANDLING.turnRate, 5);
    expect(tuning.hasPlow).toBe(false);
    expect(tuning.jumpPower).toBe(0);
    expect(tuning.armorCharges).toBe(0);
    // The bare kart is a real setup: curve numbers come back through `feelOf`, not invented locally.
    expect(tuning.feel).toEqual(feelOf(tuning.handling));
    expect(tuning.feel.peakGrip).toBeGreaterThan(0);
  });

  test("installing the truck engine raises top speed and hurts handling", () => {
    const truckEngine = partById("truck_engine")!;
    const { installed } = swapPart([], truckEngine);
    const tuning = tuningFrom(installed);
    const bare = tuningFrom([]);
    expect(tuning.topSpeed).toBeGreaterThan(bare.topSpeed);
    expect(tuning.turnRate).toBeLessThan(bare.turnRate);
  });

  test("plow blade grants plow capability", () => {
    const plow = partById("plow_blade")!;
    const { installed } = swapPart([], plow);
    expect(tuningFrom(installed).hasPlow).toBe(true);
  });

  test("coil springs grant jump power", () => {
    const springs = partById("coil_springs")!;
    const { installed } = swapPart([], springs);
    expect(tuningFrom(installed).jumpPower).toBeGreaterThan(0);
  });

  test("armor-capable frame parts grant one armor charge", () => {
    const armor = partById("armor_plating")!;
    const { installed } = swapPart([], armor);
    expect(tuningFrom(installed).armorCharges).toBe(1);
  });

  test("swapping a second part into an occupied slot ejects the old part and keeps one per slot", () => {
    const hoodPlate = partById("hood_plate")!;
    const fanVanes = partById("fan_blade_vanes")!;
    const first = swapPart([], hoodPlate);
    expect(first.ejected).toBeNull();

    const second = swapPart(first.installed, fanVanes);
    expect(second.ejected?.id).toBe("hood_plate");
    expect(second.installed.filter((entry) => entry.slot === "front")).toHaveLength(1);
    expect(second.installed.find((entry) => entry.slot === "front")?.id).toBe("fan_blade_vanes");
  });

  test("swapping into a different slot never ejects an unrelated part", () => {
    const engine = partById("salvage_v6")!;
    const wheels = partById("steel_rims")!;
    const withEngine = swapPart([], engine);
    const withWheels = swapPart(withEngine.installed, wheels);
    expect(withWheels.ejected).toBeNull();
    expect(withWheels.installed).toHaveLength(2);
  });

  test("every one of the twelve parts claims a handling number or a route capability, and the swap moves it", () => {
    expect(PARTS.length).toBeGreaterThanOrEqual(12);
    const bare = tuningFrom([]);
    for (const part of PARTS) {
      const installed = swapPart([], part).installed;
      const tuning = tuningFrom(installed);
      const claimsHandling = part.effects !== undefined && Object.values(part.effects).some((effect) => effect !== undefined && ((effect.add ?? 0) !== 0 || (effect.scale ?? 1) !== 1));
      const claimsCapability = tuning.hasPlow || tuning.jumpPower > 0 || tuning.armorCharges > 0;
      // A part either moves a handling number, changes the tire compound, or grants a route capability.
      expect(claimsHandling || claimsCapability || part.gripCurve !== undefined).toBe(true);
      if (claimsHandling) {
        const movedNumber = tuning.feel.topSpeed !== bare.feel.topSpeed || tuning.feel.turnRate !== bare.feel.turnRate;
        const movedGrip = tuning.feel.peakGrip !== bare.feel.peakGrip || tuning.feel.slideGrip !== bare.feel.slideGrip;
        expect(movedNumber || movedGrip).toBe(true);
      }
    }
  });

  test("monster treads actually grip harder: wider plateau and more slide grip than the base tire", () => {
    const treads = tuningFrom(swapPart([], partById("monster_treads")!).installed);
    const bare = tuningFrom([]);
    expect(treads.feel.slideGrip).toBeGreaterThan(bare.feel.slideGrip);
    expect(treads.feel.peakSlip).toBeGreaterThanOrEqual(bare.feel.peakSlip);
    // And it costs top speed, exactly as the blurb claims.
    expect(treads.topSpeed).toBeLessThan(bare.topSpeed);
  });

  test("brakes and reverse follow the composed engine rather than the bare chassis", () => {
    const truck = tuningFrom(swapPart([], partById("truck_engine")!).installed);
    expect(truck.handling.brakeAccel).toBeCloseTo(truck.engineAccel * 1.3, 5);
    expect(truck.handling.reverseSpeed).toBeCloseTo(truck.topSpeed * 0.35, 5);
  });

  test("composed numbers are additive across installed parts and match their flat claims", () => {
    const engine = partById("truck_engine")!;
    const armor = partById("armor_plating")!;
    const installed = swapPart(swapPart([], engine).installed, armor).installed;
    const tuning = tuningFrom(installed);
    expect(tuning.topSpeed).toBeCloseTo(BASE_HANDLING.topSpeed + claimedChange(engine, "topSpeed") + claimedChange(armor, "topSpeed"), 5);
    expect(tuning.armorCharges).toBe(1);
  });

  test("a damaged nose bakes into the same composed tuning and lowers what the kart can do", () => {
    const clean = tuningFrom([]);
    const bent = tuningFrom([], { gripScale: 1, engineScale: 1, brakeScale: 1, topSpeedScale: 0.95, steerPull: 0.035, drag: 0 });
    expect(bent.topSpeed).toBeLessThan(clean.topSpeed);
    expect(bent.handling.brakeAccel).toBeCloseTo(bent.engineAccel * 1.3, 5);
  });

  test("every part id resolves through the catalog", () => {
    for (const part of PARTS) {
      expect(partById(part.id)).not.toBeNull();
    }
    expect(partById("does_not_exist")).toBeNull();
  });
});
