import { describe, expect, test } from "bun:test";
import {
  MUZZLE_FLASH_MS,
  NEVER_MS,
  lastHit,
  lastHurtAtMs,
  lastShot,
  muzzleFlashVisible,
  noteHit,
  noteHurt,
  notePlayerHealth,
  noteShot,
  recoilAt,
  resetFeel,
} from "./feel";

describe("feel signals", () => {
  test("no cue has fired on the first frame of a run", () => {
    resetFeel();
    // Game time starts at zero, so zero cannot double as "never": with a zero timestamp every
    // age-gated cue reads as having just happened, and the first frame of a run drew a full muzzle
    // flash across the viewmodel before the player had touched the trigger.
    expect(muzzleFlashVisible(0)).toBe(false);
    expect(recoilAt(0)).toBe(0);
    expect(lastShot().atMs).toBe(NEVER_MS);
    expect(0 - lastHit().atMs).toBe(Number.POSITIVE_INFINITY);
    expect(0 - lastHurtAtMs()).toBe(Number.POSITIVE_INFINITY);
    resetFeel();
  });

  test("a real shot lights the flash for its window and then stops", () => {
    resetFeel();
    noteShot(4000, "rifle");
    expect(lastShot()).toEqual({ atMs: 4000, family: "rifle" });
    expect(muzzleFlashVisible(4000)).toBe(true);
    expect(muzzleFlashVisible(4000 + MUZZLE_FLASH_MS - 1)).toBe(true);
    expect(muzzleFlashVisible(4000 + MUZZLE_FLASH_MS)).toBe(false);
    expect(recoilAt(4070)).toBeGreaterThan(0);
    expect(recoilAt(4140)).toBe(0);
    resetFeel();
  });

  test("hit and hurt signals survive a reset as 'never', not as 'now'", () => {
    resetFeel();
    noteHit(9000, true, false);
    noteHurt(9100);
    expect(lastHit().atMs).toBe(9000);
    expect(lastHurtAtMs()).toBe(9100);
    resetFeel();
    expect(lastHit().atMs).toBe(NEVER_MS);
    expect(lastHurtAtMs()).toBe(NEVER_MS);
  });

  test("a health drop between ticks marks a hurt; the first reading and heals do not", () => {
    resetFeel();
    notePlayerHealth(1000, 90);
    expect(lastHurtAtMs()).toBe(NEVER_MS);
    notePlayerHealth(1100, 90);
    expect(lastHurtAtMs()).toBe(NEVER_MS);
    notePlayerHealth(1200, 70);
    expect(lastHurtAtMs()).toBe(1200);
    notePlayerHealth(1300, 90);
    expect(lastHurtAtMs()).toBe(1200);
    resetFeel();
    notePlayerHealth(2000, 40);
    expect(lastHurtAtMs()).toBe(NEVER_MS);
  });
});
