import { describe, expect, test } from "bun:test";
import { attackMeta } from "@jgengine/core/combat/attackTags";
import {
  createDefensiveWindow,
  iframeActiveAt,
  resolveDefense,
  windowActiveAt,
  type DefensiveWindowConfig,
} from "@jgengine/core/combat/defensiveWindow";

const parry: DefensiveWindowConfig = { kind: "parry", startupMs: 0, activeMs: 120, recoveryMs: 200 };
const block: DefensiveWindowConfig = { kind: "block", activeMs: 400 };
const roll: DefensiveWindowConfig = {
  kind: "dodge",
  activeMs: 500,
  iframes: { fromMs: 50, toMs: 300 },
};

const normal = attackMeta(["overhead"]);
const fury = attackMeta(["unblockable"]);
const spear = attackMeta(["thrust"]);
const throwGrab = attackMeta(["grab"]);

describe("defensive window", () => {
  test("window/iframe overlap helpers", () => {
    expect(windowActiveAt(parry, 60)).toBe(true);
    expect(windowActiveAt(parry, 130)).toBe(false);
    expect(iframeActiveAt(roll, 100)).toBe(true);
    expect(iframeActiveAt(roll, 400)).toBe(false);
  });

  test("parry succeeds only inside the active window", () => {
    expect(resolveDefense({ config: parry, elapsedMs: 60, attack: spear }).outcome).toBe("parry");
    expect(resolveDefense({ config: parry, elapsedMs: 200, attack: spear }).outcome).toBe("hit");
  });

  test("unblockable still parries but cannot be blocked", () => {
    expect(resolveDefense({ config: parry, elapsedMs: 50, attack: fury }).outcome).toBe("parry");
    expect(resolveDefense({ config: block, elapsedMs: 100, attack: fury }).outcome).toBe("hit");
    expect(resolveDefense({ config: block, elapsedMs: 100, attack: normal }).outcome).toBe("block");
  });

  test("grab beats parry, block and dodge", () => {
    expect(resolveDefense({ config: parry, elapsedMs: 50, attack: throwGrab }).outcome).toBe("hit");
    expect(resolveDefense({ config: roll, elapsedMs: 100, attack: throwGrab }).outcome).toBe("hit");
  });

  test("dodge iframes negate a hit", () => {
    expect(resolveDefense({ config: roll, elapsedMs: 100, attack: normal }).outcome).toBe("iframe");
    expect(resolveDefense({ config: roll, elapsedMs: 400, attack: normal }).outcome).toBe("hit");
  });

  test("controller evaluates against wall-clock open time", () => {
    const win = createDefensiveWindow(parry);
    win.open(1000);
    expect(win.evaluate(1050, spear).outcome).toBe("parry");
    expect(win.evaluate(1300, spear).outcome).toBe("hit");
    win.close();
    expect(win.evaluate(1050, spear).outcome).toBe("hit");
  });

  test("isOpen tracks the live window and auto-expires after recovery", () => {
    const win = createDefensiveWindow(parry);
    expect(win.isOpen(0)).toBe(false);
    win.open(1000);
    expect(win.isOpen(1050)).toBe(true);
    expect(win.isOpen(1319)).toBe(true);
    expect(win.isOpen(1320)).toBe(false);
    expect(win.evaluate(1320, spear).outcome).toBe("hit");
    expect(win.isOpen(1400)).toBe(false);
  });
});
