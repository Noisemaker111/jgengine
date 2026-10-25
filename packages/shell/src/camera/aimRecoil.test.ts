import { describe, expect, test } from "bun:test";

import { createAimRecoil } from "./aimRecoil";

function run(recoil: ReturnType<typeof createAimRecoil>, seconds: number) {
  let pitch = 0;
  for (let t = 0; t < seconds; t += 1 / 60) pitch += recoil.step(1 / 60).pitch;
  return pitch;
}

describe("createAimRecoil", () => {
  test("a kick climbs the view fast, then settles back", () => {
    const recoil = createAimRecoil();
    recoil.kick(0.05);
    const peak = run(recoil, 0.08);
    expect(peak).toBeGreaterThan(0.03);
    const after = peak + run(recoil, 0.4);
    expect(Math.abs(after)).toBeLessThan(0.01);
  });

  test("recover 0 keeps the climb", () => {
    const recoil = createAimRecoil();
    recoil.kick(0.05, 0, 0);
    expect(run(recoil, 1)).toBeCloseTo(0.05, 3);
  });

  test("a held trigger stops adding past the climb cap", () => {
    const recoil = createAimRecoil();
    for (let i = 0; i < 50; i++) recoil.kick(0.05, 0, 0);
    expect(recoil.debt().pitch).toBeLessThanOrEqual(0.35 + 1e-9);
  });
});
