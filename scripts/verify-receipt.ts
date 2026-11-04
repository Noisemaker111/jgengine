import { randomUUID } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { ScheduledStep, StepResult } from "./stepScheduler";

/** A separate receipt and raw failure output for each invocation. */
export function createVerifyReceipt(root: string, data: Record<string, unknown>, steps: readonly ScheduledStep[], runDir?: string) {
  const dir = runDir ?? join(root, ".scratch", "verify-fast", "runs", `${Date.now()}-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "receipt.json");
  const started = new Date().toISOString();
  const entries: Record<string, Record<string, unknown>> = {};
  for (const step of steps) entries[step.name] = { status: "pending", needs: step.needs ?? [], queuedAt: started };
  const receipt: Record<string, unknown> = { version: 1, ...data, startedAt: started, status: "running", steps: entries, timing: "Intervals can overlap; do not sum them to obtain elapsed time. Unmeasured time is unknown." };
  const save = (): void => {
    const temp = join(dir, "receipt.tmp");
    writeFileSync(temp, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    renameSync(temp, path);
  };
  save();
  return {
    dir, path,
    plan(data: Record<string, unknown>, selected: readonly ScheduledStep[]): void {
      Object.assign(receipt, data);
      const queuedAt = new Date().toISOString();
      for (const step of selected) entries[step.name] = { status: "pending", needs: step.needs ?? [], queuedAt };
      save();
    },
    start(step: ScheduledStep): void {
      entries[step.name] = { ...entries[step.name], status: "running", startedAt: new Date().toISOString() };
      save();
    },
    settle(result: StepResult): void {
      let outputFile: string | undefined;
      if (!result.ok && result.blockedBy === undefined) {
        outputFile = `${Object.keys(entries).indexOf(result.name)}-failure.log`;
        writeFileSync(join(dir, outputFile), result.output, "utf8");
      }
      entries[result.name] = { ...entries[result.name], status: result.blockedBy !== undefined ? "blocked" : result.ok ? "passed" : "failed", endedAt: new Date().toISOString(), ms: result.ms, ...(result.blockedBy === undefined ? {} : { blockedBy: result.blockedBy }), ...(outputFile === undefined ? {} : { outputFile }) };
      save();
    },
    finish(ok: boolean): void {
      receipt["status"] = ok ? "passed" : "failed";
      receipt["endedAt"] = new Date().toISOString();
      save();
    },
    abort(error: unknown): void {
      receipt["error"] = error instanceof Error ? error.stack ?? error.message : String(error);
      receipt["status"] = "failed";
      receipt["endedAt"] = new Date().toISOString();
      save();
    },
  };
}
