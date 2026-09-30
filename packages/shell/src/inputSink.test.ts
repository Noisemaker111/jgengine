import { describe, expect, mock, spyOn, test } from "bun:test";
import type { LiveGameBackend } from "@jgengine/core/runtime/transport";
import { createHostedGameRunner, type InputFrame } from "@jgengine/core/runtime/hostedGameRunner";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
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
  test("two clients in one realm never coalesce or replay input under the other actor", async () => {
    const aliceCalls: Array<{ serverId: string; command: string; input: unknown }> = [];
    const bobCalls: typeof aliceCalls = [];
    const alice = controllableBackend(aliceCalls);
    const bob = controllableBackend(bobCalls);
    const a = remoteInputSink(alice.backend, "shared-realm");
    const b = remoteInputSink(bob.backend, "shared-realm");
    a.send(frame(["alice-first"]));
    b.send(frame(["bob-first"]));
    a.send(frame(["alice-last"]));
    b.send(frame(["bob-last"]));
    alice.resolveNext({ ok: true });
    bob.resolveNext({ ok: true });
    await flush();
    expect(aliceCalls.map((call) => (call.input as InputFrame).held)).toEqual([["alice-first"], ["alice-last"]]);
    expect(bobCalls.map((call) => (call.input as InputFrame).held)).toEqual([["bob-first"], ["bob-last"]]);
    alice.resolveNext({ ok: true });
    bob.resolveNext({ ok: true });
    await flush();
  });
  test("urgent release reaches transport before held ACK and old completion cannot release its gate", async () => {
    const calls: Array<{ serverId: string; command: string; input: unknown }> = [];
    const { backend, resolveNext } = controllableBackend(calls);
    const sink = remoteInputSink(backend, "urgent-release");
    sink.send(frame(["moveForward"]));
    sink.send(frame(["moveForward", "sprint"]));
    sink.send(frame([]), { urgent: true });
    expect(calls.map(call => (call.input as InputFrame).held)).toEqual([["moveForward"], []]);
    expect((calls[1]!.input as { seq: number }).seq).toBeGreaterThan((calls[0]!.input as { seq: number }).seq);
    sink.send(frame(["moveBackward"]));
    resolveNext({ ok: true });
    await flush();
    expect(calls.length).toBe(2);
    resolveNext({ ok: true });
    await flush();
    expect(calls.map(call => (call.input as InputFrame).held)).toEqual([["moveForward"], [], ["moveBackward"]]);
    resolveNext({ ok: true });
    await flush();
  });

  test("old rejected flight cannot resurrect held input or erase the replacement pending intent", async () => {
    const calls: Array<{ serverId: string; command: string; input: unknown }> = [];
    const { backend, resolveNext, rejectNext } = controllableBackend(calls);
    const sink = remoteInputSink(backend, "urgent-rejection");
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      sink.send(frame(["moveForward"]));
      sink.send(frame([]), { urgent: true });
      sink.send(frame(["moveBackward"]));
      rejectNext(new Error("old request disconnected"));
      await flush();
      expect(calls.length).toBe(2);
      resolveNext({ ok: true });
      await flush();
      expect((calls[2]!.input as InputFrame).held).toEqual(["moveBackward"]);
      resolveNext({ ok: true });
      await flush();
    } finally { console.warn = originalWarn; }
  });

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

  test("a regressing local clock cannot make a released frame stale", async () => {
    const calls: Array<{ serverId: string; command: string; input: unknown }> = [];
    const { backend, resolveNext } = controllableBackend(calls);
    const sink = remoteInputSink(backend, "seq-clock-regression");
    const clock = spyOn(performance, "now");
    try {
      clock.mockReturnValue(10000);
      sink.send(frame(["moveForward"]));
      resolveNext({ ok: true });
      await flush();
      clock.mockReturnValue(100);
      sink.send(frame([]), { urgent: true });
      const seqs = calls.map((call) => (call.input as { seq: number }).seq);
      expect(seqs.length).toBe(2);
      expect(seqs[1]).toBeGreaterThan(seqs[0]!);
      expect((calls[1]!.input as InputFrame).held).toEqual([]);
      resolveNext({ ok: true });
      await flush();
    } finally { clock.mockRestore(); }
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


test("a fresh browser's input advances the same live actor beyond the previous client's sequence", async () => {
  const host = createHostedGameRunner({
    definition: defineGameDefinition({ name: "Reload input", assets: createAssetCatalog(), multiplayer: "off" }),
    content: { entityById: () => null },
  });
  const previousEpoch = performance.timeOrigin + performance.now();
  host.input("same-actor", { held: [], pointer: null, seq: previousEpoch });
  const backend: Pick<LiveGameBackend, "transport"> = {
    transport: {
      joinServer: async () => ({ serverId: "same-realm", isNew: false }),
      leaveServer: async () => {},
      runCommand: async ({ input }) => {
        host.input("same-actor", input as InputFrame);
        return { ok: true };
      },
    },
  };
  const sink = remoteInputSink(backend, "same-realm");
  sink.send(frame(["moveForward"]));
  await flush();
  expect(host.heldInput("same-actor")?.held).toEqual(["moveForward"]);
  sink.send(frame([]), { urgent: true });
  await flush();
  expect(host.heldInput("same-actor")?.held).toEqual([]);
  host.input("same-actor", { held: ["moveForward"], pointer: null, seq: previousEpoch });
  expect(host.heldInput("same-actor")?.held).toEqual([]);
});


test("reloaded tick-zero live input applies on the joined host clock and release supersedes held intent", async () => {
  const applied: string[][] = [];
  const host = createHostedGameRunner({
    definition: defineGameDefinition({
      name: "Joined input clock", assets: createAssetCatalog(), multiplayer: "off", features: { players: true },
      loop: { onTick(ctx) { applied.push([...(ctx.game.players?.input("same-actor")?.held ?? [])]); } },
    }),
    content: { entityById: () => null },
  });
  host.join("same-actor", false);
  for (let i = 0; i < 120; i++) host.tick(1 / 60);
  const previousEpoch = performance.timeOrigin + performance.now();
  host.input("same-actor", { held: [], pointer: null, seq: previousEpoch });
  host.tick(1 / 60);
  const sent: InputFrame[] = [];
  const backend: Pick<LiveGameBackend, "transport"> = {
    transport: {
      joinServer: async () => ({ serverId: "joined-clock", isNew: false }),
      leaveServer: async () => {},
      runCommand: async ({ input }) => { sent.push(input as InputFrame); host.input("same-actor", input as InputFrame); return { ok: true }; },
    },
  };
  const sink = remoteInputSink(backend, "joined-clock");
  sink.send({ ...frame(["moveForward"]), tick: 0 });
  await flush();
  host.tick(1 / 60);
  expect(host.context().sim.tick()).toBeGreaterThan(120);
  expect(applied.at(-1)).toEqual(["moveForward"]);
  expect(sent[0]?.tick).toBeUndefined();
  sink.send({ ...frame([]), tick: 0 }, { urgent: true });
  await flush();
  host.input("same-actor", sent[0]!);
  host.tick(1 / 60);
  expect(applied.at(-1)).toEqual([]);
  expect(host.heldInput("same-actor")?.held).toEqual([]);
});
