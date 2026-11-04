import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "bun:test";
import { createVerifyReceipt } from "./verify-receipt";
import { runSteps } from "./stepScheduler";
import { parseVerifyArgs } from "./verify-fast";

const root = fileURLToPath(new URL("..", import.meta.url));

test("invalid options fail before any run", () => {
  for (const args of [["--unknown"], ["--jobs", "0"], ["--jobs", "2x"], ["--base"], ["--base", "--plan"], ["--full", "--cheap"], ["--plan", "--json"]]) {
    expect(() => parseVerifyArgs(args)).toThrow();
  }
  expect(parseVerifyArgs(["--jobs", "2"]).jobs).toBe(2);
});

test("failure and dependency receipts retain original output across runs", async () => {
  const steps = [{ name: "build" }, { name: "test", needs: ["build"] }];
  const receipt = createVerifyReceipt(root, { head: "fixture" }, steps);
  const other = createVerifyReceipt(root, { head: "retry" }, steps);
  try {
    const results = await runSteps(steps, 2, async (step) => ({ name: step.name, ok: false, ms: 1, output: "original error\n" }), { onStart: receipt.start, onSettle: receipt.settle });
    receipt.finish(false);
    const saved = JSON.parse(readFileSync(receipt.path, "utf8"));
    expect(results[1]?.blockedBy).toEqual(["build"]);
    expect(saved.steps.build.status).toBe("failed");
    expect(saved.steps.test.status).toBe("blocked");
    expect(saved.steps.test.blockedBy).toEqual(["build"]);
    expect(readFileSync(join(receipt.dir, saved.steps.build.outputFile), "utf8")).toBe("original error\n");
    expect(other.path).not.toBe(receipt.path);
  } finally {
    rmSync(receipt.dir, { recursive: true, force: true });
    rmSync(other.dir, { recursive: true, force: true });
  }
});

test("a killed process leaves its active step in the receipt", async () => {
  const dir = join(root, ".scratch", "verify-fast", `kill-fixture-${crypto.randomUUID()}`);
  const source = `import { createVerifyReceipt } from './scripts/verify-receipt'; import { runSteps } from './scripts/stepScheduler'; const steps = [{name:'active'}]; const r = createVerifyReceipt(${JSON.stringify(root)}, {}, steps, ${JSON.stringify(dir)}); await runSteps(steps, 1, async () => { console.log('ready'); await new Promise(() => {}); }, {onStart:r.start, onSettle:r.settle});`;
  const child = Bun.spawn(["bun", "-e", source], { cwd: root, stdout: "pipe", stderr: "pipe" });
  try {
    const reader = child.stdout.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain("ready");
    child.kill(9);
    await child.exited;
    const receipt = JSON.parse(readFileSync(join(dir, "receipt.json"), "utf8"));
    expect(receipt.status).toBe("running");
    expect(receipt.steps.active.status).toBe("running");
    expect(receipt.steps.active.startedAt).toBeDefined();
    expect(receipt.steps.active.endedAt).toBeUndefined();
  } finally {
    child.kill();
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
});
