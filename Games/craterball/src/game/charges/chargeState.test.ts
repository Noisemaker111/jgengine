import { describe, expect, test } from "bun:test";
import {
  armCharge,
  armedCount,
  createChargeBank,
  detonateAll,
  detonateSlot,
  fuseProgress,
  isFuseComplete,
  readyToAutoDetonate,
} from "./chargeState";

describe("craterball charge bank", () => {
  test("starts with both slots empty", () => {
    expect(armedCount(createChargeBank())).toBe(0);
  });

  test("arming fills the first empty slot", () => {
    const result = armCharge(createChargeBank(), 1, 2, 0, 1.4)!;
    expect(result.slotIndex).toBe(0);
    expect(armedCount(result.bank)).toBe(1);
  });

  test("max two armed charges — a third arm attempt is rejected", () => {
    let bank = createChargeBank();
    bank = armCharge(bank, 0, 0, 0)!.bank;
    bank = armCharge(bank, 1, 1, 0)!.bank;
    expect(armedCount(bank)).toBe(2);
    expect(armCharge(bank, 2, 2, 0)).toBeNull();
  });

  test("fuse progress climbs from 0 to 1 over the fuse window", () => {
    const armed = armCharge(createChargeBank(), 0, 0, 0, 2)!;
    const slot = armed.bank.slots[armed.slotIndex]!;
    expect(fuseProgress(slot, 0)).toBe(0);
    expect(fuseProgress(slot, 1)).toBeCloseTo(0.5, 5);
    expect(isFuseComplete(slot, 2)).toBe(true);
    expect(isFuseComplete(slot, 1.9)).toBe(false);
  });

  test("readyToAutoDetonate only reports slots whose fuse has elapsed", () => {
    let bank = armCharge(createChargeBank(), 0, 0, 0, 1)!.bank;
    bank = armCharge(bank, 1, 1, 5, 1)!.bank;
    const ready = readyToAutoDetonate(bank, 1.5);
    expect(ready).toHaveLength(1);
    expect(ready[0]!.x).toBe(0);
  });

  test("detonateSlot clears only the targeted charge", () => {
    let bank = armCharge(createChargeBank(), 0, 0, 0)!.bank;
    const armedSecond = armCharge(bank, 1, 1, 0)!;
    bank = armedSecond.bank;
    const chargeId = bank.slots.find((slot) => slot !== null && slot.x === 1)!.id;
    const result = detonateSlot(bank, chargeId);
    expect(result.detonated).toHaveLength(1);
    expect(armedCount(result.bank)).toBe(1);
  });

  test("detonateAll clears every armed slot at once", () => {
    let bank = armCharge(createChargeBank(), 0, 0, 0)!.bank;
    bank = armCharge(bank, 1, 1, 0)!.bank;
    const result = detonateAll(bank);
    expect(result.detonated).toHaveLength(2);
    expect(armedCount(result.bank)).toBe(0);
  });

  test("detonateAll on an empty bank is a no-op", () => {
    const result = detonateAll(createChargeBank());
    expect(result.detonated).toHaveLength(0);
  });
});
