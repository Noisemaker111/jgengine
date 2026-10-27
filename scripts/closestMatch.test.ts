import { describe, expect, test } from "bun:test";
import { closestHint, closestMatches } from "./closestMatch";
import { probeKeyHint } from "./browserFlow";
import { controlHint } from "./drivePage";
import { compileStep, guardFlowCalls, splitStepFlags } from "./driveStep";

describe("closestMatches", () => {
  test("a guessed button label names the real one first", () => {
    expect(closestMatches("Pause game", ["Resume", "Pause battle", "Settings", "Quit to menu"])[0]).toBe("Pause battle");
  });

  test("a hotkey letter inside the wanted text is not a match", () => {
    expect(closestMatches("Resume battle", ["R", "J", "Pause battle", "Column formation"])).toEqual(["Pause battle"]);
  });

  test("ignores case, repeats and blank names", () => {
    expect(closestMatches("start", ["START", "Start", "", "  "])).toEqual(["START"]);
  });

  test("names nothing when nothing is close", () => {
    expect(closestMatches("inventory", ["Pause battle", "Speed x2"])).toEqual([]);
    expect(closestHint("inventory", ["Pause battle"], "controls")).toBe("");
  });

  test("a misspelt key finds the real key", () => {
    expect(closestMatches("wav", ["gold", "wave", "x", "z"])[0]).toBe("wave");
  });
});

describe("controlHint", () => {
  test("says when the closest control is there but covered, which is why the click found nothing", () => {
    const controls = [
      { name: "Resume battle", covered: true },
      { name: "Resume the mission", covered: false },
      { name: "Speed x2", covered: false },
    ];
    expect(controlHint("Resume battle", controls, "controls")).toBe('; closest controls: "Resume battle" (covered by another element), "Resume the mission"');
    expect(controlHint("Inventory", controls, "controls")).toBe("");
  });
});

describe("probeKeyHint", () => {
  test("names a key the check reads that the probe does not have, and the closest real one", () => {
    // Built from source text, the way an untyped --step check arrives.
    const check: () => unknown = new Function("return (p) => p.wav >= 2 && p.gold > 0")();
    expect(probeKeyHint(check, { wave: 1, gold: 3 })).toBe('; the probe has no "wav"; closest keys: "wave"');
  });

  test("lists the keys when none is close, and says nothing for a check that reads real keys", () => {
    const far: () => unknown = new Function("return (p) => p.inventoryCount > 0")();
    expect(probeKeyHint(far, { wave: 1 })).toBe('; the probe has no "inventoryCount"; its keys: wave');
    const fine: () => unknown = new Function("return (p) => p.wave > 0")();
    expect(probeKeyHint(fine, { wave: 1 })).toBe("");
    expect(probeKeyHint(fine, null)).toBe("");
  });
});

describe("drive --step", () => {
  test("takes repeated --step calls and --fresh out of the command line", () => {
    expect(splitStepFlags(["ember-command", "--step", 'f.click("A")', "--fresh", "--step=f.probe()", "--size", "half"])).toEqual({
      argv: ["ember-command", "--size", "half"],
      steps: ['f.click("A")', "f.probe()"],
      fresh: true,
    });
    expect(() => splitStepFlags(["g", "--step"])).toThrow(/--step takes a flow call/);
    expect(() => splitStepFlags(["g", "--fresh"])).toThrow(/pass --step too/);
  });

  test("runs an expression or statements against f", async () => {
    const f = { double: (n: number) => n * 2 };
    expect(await compileStep("f.double(2)")(f)).toBe(4);
    expect(await compileStep("const n = f.double(3); return n + 1;")(f)).toBe(7);
    expect(() => compileStep("f.double(")).toThrow();
  });

  test("a misspelt flow call names the closest calls", async () => {
    const f = guardFlowCalls({ click: () => 1, clickAt: () => 2, wait: () => 3 });
    expect(await compileStep("f.click()")(f)).toBe(1);
    await expect(compileStep("f.clik('A')")(f)).rejects.toThrow('f.clik is not a flow call; closest calls: "click", "clickAt"');
  });
});
