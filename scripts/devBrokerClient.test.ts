import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";

import { BROKER_PROTOCOL } from "./devBroker";
import { brokerStatusOrNull, captureQueueLine, captureWaitMs, ensureBroker, stopBroker, treeFingerprint } from "./devBrokerClient";

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const port = (probe.address() as { port: number }).port;
      probe.close(() => resolve(port));
    });
  });
}

describe("broker client", () => {
  test("JG_BROKER=0 means no broker is asked or started", async () => {
    const before = process.env["JG_BROKER"];
    process.env["JG_BROKER"] = "0";
    try {
      expect(await ensureBroker({ log: () => {} })).toBeNull();
    } finally {
      if (before === undefined) delete process.env["JG_BROKER"];
      else process.env["JG_BROKER"] = before;
    }
  });

  test("the capture wait defaults to 5 minutes, under the shoot guard", () => {
    expect(captureWaitMs({})).toBe(300_000);
    expect(captureWaitMs({ JG_CAPTURE_WAIT_MINUTES: "2" })).toBe(120_000);
  });

  test("the fingerprint moves when the game list changes", () => {

    const root = join(import.meta.dir, "..", ".scratch", `broker-fingerprint-${process.pid}`);
    try {
      mkdirSync(join(root, "games", "harbor-heat"), { recursive: true });
      const before = treeFingerprint(root, null);
      mkdirSync(join(root, "games", "zombie-yard"));
      const after = treeFingerprint(root, null);
      expect(after).not.toBe(before);
      expect(treeFingerprint(root, "C:/lane/harbor-heat")).toContain("C:/lane/harbor-heat");
      writeFileSync(join(root, "note.txt"), "x");
      expect(treeFingerprint(root, null)).toBe(after);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a real broker process answers, refuses a second copy, and stops on request", async () => {
    const port = await freePort();
    const env = { ...process.env, JG_BROKER_PORT: String(port), JG_BROKER: "1" };
    const before = process.env["JG_BROKER_PORT"];
    process.env["JG_BROKER_PORT"] = String(port);
    const first = spawn(process.execPath, [join(import.meta.dir, "devBroker.ts"), "serve"], { env, stdio: "ignore", windowsHide: true });
    const firstExit = new Promise<number | null>((resolve) => first.once("exit", resolve));
    try {
      let status = null;
      for (let attempt = 0; attempt < 50 && status === null; attempt += 1) {
        await Bun.sleep(100);
        status = await brokerStatusOrNull(500);
      }
      expect(status).toMatchObject({ protocol: BROKER_PROTOCOL, pid: first.pid, servers: [], chrome: null });
      const second = spawn(process.execPath, [join(import.meta.dir, "devBroker.ts"), "serve"], { env, stdio: "ignore", windowsHide: true });
      const secondCode = await new Promise<number | null>((resolve) => second.once("exit", resolve));
      expect(secondCode).toBe(0);
      expect((await brokerStatusOrNull())?.pid).toBe(first.pid);
      expect(await stopBroker()).toBe(true);
      expect(await firstExit).toBe(0);
    } finally {
      first.kill();
      if (before === undefined) delete process.env["JG_BROKER_PORT"];
      else process.env["JG_BROKER_PORT"] = before;
    }
  }, 30_000);
});

test("a busy broker from a checkout before brokers left their starter's job is passed by, never leaned on", async () => {
  // Protocol 1 brokers ran inside the Windows job of the run that started them and died with it.
  const port = await freePort();
  const old = Bun.serve({
    port,
    hostname: "127.0.0.1",
    fetch: (request) =>
      new URL(request.url).pathname === "/v1/status"
        ? Response.json({ protocol: 1, pid: 1, servers: [], chrome: null, leases: 2 })
        : new Response("not found", { status: 404 }),
  });
  const before = { port: process.env["JG_BROKER_PORT"], on: process.env["JG_BROKER"] };
  process.env["JG_BROKER_PORT"] = String(port);
  process.env["JG_BROKER"] = "1";
  const lines: string[] = [];
  try {
    expect(await ensureBroker({ log: (line) => lines.push(line) })).toBeNull();
    expect(lines.join("\n")).toContain(`speaks protocol 1, this checkout ${BROKER_PROTOCOL}, and it is busy`);
  } finally {
    void old.stop(true);
    for (const [key, value] of [["JG_BROKER_PORT", before.port], ["JG_BROKER", before.on]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("a run queued for the shared browser names who holds it, so a wait never reads as a hang", () => {
  expect(captureQueueLine({ capture: { holders: ["shoot-dev.ts in C:/w/a (pid 7)"], queued: ["perf-play.ts in C:/w/b (pid 8)"] } })).toBe(
    "held by shoot-dev.ts in C:/w/a (pid 7); 1 in the queue",
  );
  expect(captureQueueLine({ capture: { holders: [], queued: [] } })).toContain("nobody holds it yet");
});
