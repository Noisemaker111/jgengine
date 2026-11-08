import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "bun:test";
import { createVerifyReceipt, passingReceipt, type ReuseKey } from "./verify-receipt";
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

test("a passing run of the same tree stands for a new run that would prove no more; anything else does not", () => {
  const fixture = mkdtempSync(join(tmpdir(), "verify-reuse-"));
  try {
    const key: ReuseKey = { tree: "t1", mergeBase: "b1", runtime: "bun 1", scope: "fast", skillApi: false };
    const write = (name: string, receipt: Record<string, unknown>): void => {
      mkdirSync(join(fixture, ".scratch", "verify-fast", "runs", name), { recursive: true });
      writeFileSync(join(fixture, ".scratch", "verify-fast", "runs", name, "receipt.json"), JSON.stringify(receipt));
    };
    expect(passingReceipt(fixture, key)).toBeNull();
    write("failed", { ...key, status: "failed", endedAt: "x" });
    write("moved", { ...key, tree: null, status: "passed", endedAt: "x" });
    write("cheap", { ...key, scope: "cheap", status: "passed", endedAt: "x" });
    write("other-base", { ...key, mergeBase: "b2", status: "passed", endedAt: "x" });
    expect(passingReceipt(fixture, key)).toBeNull();
    write("good", { ...key, status: "passed", endedAt: "2026-11-08T00:00:00Z" });
    expect(passingReceipt(fixture, key)?.path).toContain("good");
    expect(passingReceipt(fixture, { ...key, scope: "cheap" })?.path).toBeDefined();
    expect(passingReceipt(fixture, { ...key, scope: "full" })).toBeNull();
    expect(passingReceipt(fixture, { ...key, skillApi: true })).toBeNull();
    expect(passingReceipt(fixture, { ...key, tree: "t2" })).toBeNull();
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
