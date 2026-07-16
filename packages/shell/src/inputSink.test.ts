import { describe, expect, mock, test } from "bun:test";
import type { LiveGameBackend } from "@jgengine/core/runtime/transport";
import type { InputFrame } from "@jgengine/core/runtime/hostedGameRunner";
import { inputFramesEqual, noopInputSink, remoteInputSink, resolveInputSink } from "./inputSink";

function controllableBackend(calls: Array<{ serverId: string; command: string; input: unknown }>) {
  const settlers: Array<{ resolve: (r: { ok: true } | { ok: false; reason: string }) => void; reject: (e: unknown) => void }> = [];
  const backend: Pick<LiveGameBackend, "transport"> = {
    transport: {
      joinServer: async () => ({ serverId: "s1", isNew: true }),
      leaveServer: async () => {},
      runCommand: (args) => {
        calls.push(args);
        return new Promise((resolve, reject) => {
          settlers.push({ resolve, reject });
        });
      },
    },
  };
  return {
    backend,
    resolveNext(result: { ok: true } | { ok: false; reason: string }) {
      settlers.shift()?.resolve(result);
    },
    rejectNext(error: unknown) {
      settlers.shift()?.reject(error);
    },
  };
}

const flush = () => Promise.resolve().then().then().then();

const frame = (held: readonly string[]): InputFrame => ({ held, pointer: null });

describe("input sink", () => {
  test("noopInputSink discards frames", () => {
    expect(() => noopInputSink().send(frame(["moveForward"]))).not.toThrow();
  });

  test("resolveInputSink routes to the host only when server-authoritative and connected", () => {
    const calls: unknown[] = [];
    const { backend, resolveNext } = controllableBackend(calls as Array<{ serverId: string; command: string; input: unknown }>);

    resolveInputSink({ serverAuthoritative: true, backend, serverId: "resolve-a" }).send(frame(["a"]));
    resolveInputSink({ serverAuthoritative: false, backend, serverId: "resolve-a" }).send(frame(["b"]));
    resolveInputSink({ serverAuthoritative: true, backend: null, serverId: "resolve-a" }).send(frame(["c"]));
    resolveInputSink({ serverAuthoritative: true, backend, serverId: null }).send(frame(["d"]));

    expect(calls.length).toBe(1);
    resolveNext({ ok: true });
  });

  test("inputFramesEqual compares held actions and pointer state", () => {
    expect(inputFramesEqual(frame(["a"]), frame(["a"]))).toBe(true);
    expect(inputFramesEqual(frame(["a"]), frame(["b"]))).toBe(false);
    expect(
      inputFramesEqual(
        { held: [], pointer: { x: 0.5, y: -0.5, active: true } },
        { held: [], pointer: { x: 0.5, y: -0.5, active: true } },
      ),
    ).toBe(true);
  });

  test("sends are sequenced one-in-flight-at-a-time per server and coalesce intermediate frames", async () => {
    const calls: Array<{ serverId: string; command: string; input: unknown }> = [];
    const { backend, resolveNext } = controllableBackend(calls);
    const sink = remoteInputSink(backend, "coalesce-1");

    sink.send(frame(["moveForward"]));
    sink.send(frame(["moveForward", "sprint"]));
    sink.send(frame([]));
    await flush();

    expect(calls.length).toBe(1);
    expect((calls[0]!.input as InputFrame).held).toEqual(["moveForward"]);

    resolveNext({ ok: true });
    await flush();

    expect(calls.length).toBe(2);
    expect((calls[1]!.input as InputFrame).held).toEqual([]);

    resolveNext({ ok: true });
    await flush();
    expect(calls.length).toBe(2);
  });

  test("each in-flight send carries a strictly increasing seq", async () => {
    const calls: Array<{ serverId: string; command: string; input: unknown }> = [];
    const { backend, resolveNext } = controllableBackend(calls);
    const sink = remoteInputSink(backend, "seq-1");

    sink.send(frame(["a"]));
    await flush();
    resolveNext({ ok: true });
    await flush();

    sink.send(frame(["b"]));
    await flush();

    const seqs = calls.map((c) => (c.input as { seq: number }).seq);
    expect(seqs.length).toBe(2);
    expect(seqs[1]).toBeGreaterThan(seqs[0]!);
  });

  test("an out-of-order (stale) frame does not resurrect a released input via runner replay ordering", async () => {
    const calls: Array<{ serverId: string; command: string; input: unknown }> = [];
    const { backend, resolveNext } = controllableBackend(calls);
    const sink = remoteInputSink(backend, "order-1");

    sink.send(frame(["moveForward"]));
    await flush();
    resolveNext({ ok: true });
    sink.send(frame([]));
    await flush();
    resolveNext({ ok: true });
    await flush();

    const held = calls.map((c) => (c.input as InputFrame).held);
    expect(held).toEqual([["moveForward"], []]);
  });

  test("a rejected or failed send is surfaced (logged), not silently swallowed, and does not stall later frames", async () => {
    const calls: Array<{ serverId: string; command: string; input: unknown }> = [];
    const { backend, resolveNext, rejectNext } = controllableBackend(calls);
    const sink = remoteInputSink(backend, "fail-1");
    const warn = mock(() => {});
    const originalWarn = console.warn;
    console.warn = warn;

    try {
      sink.send(frame(["moveForward"]));
      await flush();
      rejectNext(new Error("network down"));
      await flush();

      expect(warn).toHaveBeenCalled();

      sink.send(frame(["sprint"]));
      await flush();
      expect(calls.length).toBe(2);
      resolveNext({ ok: false, reason: "rejected" });
      await flush();
      expect(warn.mock.calls.length).toBeGreaterThanOrEqual(2);
    } finally {
      console.warn = originalWarn;
    }
  });
});
