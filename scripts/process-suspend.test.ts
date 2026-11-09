import { expect, test } from "bun:test";
import { spawn } from "node:child_process";

import { resumeProcesses, suspendProcesses } from "./process-suspend";

test("a suspended process does no work until it is resumed", async () => {
  // A child that prints a tick every 50 ms: suspended, no tick arrives; resumed, ticks come again.
  const child = spawn(process.execPath, ["-e", "setInterval(() => process.stdout.write('t'), 50)"], { stdio: ["ignore", "pipe", "ignore"] });
  let ticks = 0;
  child.stdout.on("data", (chunk: Buffer) => { ticks += chunk.length; });
  try {
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    for (let tries = 0; ticks === 0 && tries < 100; tries += 1) await wait(100);
    expect(ticks).toBeGreaterThan(0);
    await suspendProcesses([child.pid!]);
    await wait(150);
    const frozenAt = ticks;
    await wait(600);
    expect(ticks).toBe(frozenAt);
    await resumeProcesses([child.pid!]);
    await wait(600);
    expect(ticks).toBeGreaterThan(frozenAt);
  } finally {
    await resumeProcesses([child.pid!]);
    child.kill();
  }
}, 30_000);
