import { describe, expect, test } from "bun:test";
import { advanceBustedHold, BUSTED_HOLD_SEC, bustedFine, clinicFee } from "./failStates";

describe("vice-isle fail states", () => {
  test("clinic fee scales with cash but never exceeds it", () => {
    expect(clinicFee(0)).toBe(0);
    expect(clinicFee(80)).toBe(80);
    expect(clinicFee(1000)).toBe(150);
    expect(clinicFee(10000)).toBe(800);
    expect(clinicFee(50000)).toBe(4000);
  });

  test("busted fine is per-star and capped by cash", () => {
    expect(bustedFine(10000, 0)).toBe(0);
    expect(bustedFine(10000, 2)).toBe(300);
    expect(bustedFine(10000, 5)).toBe(750);
    expect(bustedFine(200, 5)).toBe(200);
    expect(bustedFine(0, 3)).toBe(0);
  });

  test("arrest clock runs in reach, bleeds out twice as fast when contact breaks", () => {
    let hold = 0;
    hold = advanceBustedHold(hold, true, 0.5);
    hold = advanceBustedHold(hold, true, 0.5);
    expect(hold).toBeCloseTo(1);
    expect(hold).toBeLessThan(BUSTED_HOLD_SEC);
    hold = advanceBustedHold(hold, false, 0.3);
    expect(hold).toBeCloseTo(0.4);
    hold = advanceBustedHold(hold, false, 1);
    expect(hold).toBe(0);
    hold = advanceBustedHold(hold, true, 1.3);
    expect(hold).toBeGreaterThan(BUSTED_HOLD_SEC);
  });
});
