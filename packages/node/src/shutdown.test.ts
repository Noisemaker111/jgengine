import { describe, expect, test } from "bun:test";

import { installShutdownHook } from "./shutdown";

function settle(ms = 10): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("installShutdownHook", () => {
  test("a signal flushes then resolves, exiting 0", async () => {
    const order: string[] = [];
    const exits: number[] = [];
    const hook = installShutdownHook(
      async () => {
        await settle(5);
        order.push("flushed");
      },
      { signals: ["SIGUSR2"], exit: (code) => exits.push(code) },
    );
    try {
      process.emit("SIGUSR2");
      await settle();
      expect(order).toEqual(["flushed"]);
      expect(exits).toEqual([0]);
    } finally {
      hook.remove();
    }
  });

  test("a second signal mid-shutdown reuses the in-flight run — no double flush", async () => {
    let calls = 0;
    const exits: number[] = [];
    const hook = installShutdownHook(
      async () => {
        calls += 1;
        await settle(15);
      },
      { signals: ["SIGUSR2"], exit: (code) => exits.push(code) },
    );
    try {
      process.emit("SIGUSR2");
      process.emit("SIGUSR2");
      await settle(25);
      expect(calls).toBe(1);
      expect(exits).toEqual([0]);
    } finally {
      hook.remove();
    }
  });

  test("a shutdown that hangs past timeoutMs exits 1 via onError", async () => {
    const errors: unknown[] = [];
    const exits: number[] = [];
    const hook = installShutdownHook(() => new Promise<void>(() => {}), {
      signals: ["SIGUSR2"],
      timeoutMs: 5,
      exit: (code) => exits.push(code),
      onError: (error) => errors.push(error),
    });
    try {
      process.emit("SIGUSR2");
      await settle(20);
      expect(exits).toEqual([1]);
      expect(errors.length).toBe(1);
    } finally {
      hook.remove();
    }
  });

  test("remove() uninstalls the listener", async () => {
    let calls = 0;
    const hook = installShutdownHook(() => {
      calls += 1;
    }, { signals: ["SIGUSR2"], exit: () => {} });
    hook.remove();
    process.emit("SIGUSR2");
    await settle();
    expect(calls).toBe(0);
  });
});
