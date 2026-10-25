import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

import { currentStep, describeHang, markStep, readStepFile, StepTimeoutError, STEP_FILE_ENV, withStepDeadline } from "./hangReport";

describe("hang reports", () => {
  test("a marked step lands in the guard's file and reads back", () => {
    const dir = mkdtempSync(join(import.meta.dir, ".hang-"));
    try {
      const path = join(dir, "step.json");
      markStep("open /?game=harbor-heat", { [STEP_FILE_ENV]: path }, 1_000);
      expect(readStepFile(path)).toEqual({ label: "open /?game=harbor-heat", since: 1_000, pid: process.pid });
      expect(currentStep()?.label).toBe("open /?game=harbor-heat");
      expect(describeHang(readStepFile(path), 313_000)).toBe("hung in: open /?game=harbor-heat (312s in that step)");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("no mark still gives a line", () => {
    expect(describeHang(null)).toBe("hung before it reported a step");
    expect(readStepFile(join(import.meta.dir, "no-such-step-file.json"))).toBeNull();
  });

  test("a step that never settles fails at its deadline, naming the step", async () => {
    const hung = withStepDeadline("start or reuse the dev server", 20, () => new Promise(() => {}));
    await expect(hung).rejects.toBeInstanceOf(StepTimeoutError);
    await expect(withStepDeadline("x", 20, () => new Promise(() => {}))).rejects.toThrow("x hung: no result after 0s");
    expect(await withStepDeadline("quick", 1_000, async () => 7)).toBe(7);
    expect(await withStepDeadline("no budget", 0, async () => 8)).toBe(8);
  });
});
