import { describe, expect, test } from "bun:test";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { LiveGameBackend } from "@jgengine/core/runtime/transport";
import { localCommandSink, remoteCommandSink, resolveCommandSink } from "./commandSink";

function fakeCtx(calls: [string, unknown][]): GameContext {
  return { game: { commands: { run: (name: string, input: unknown) => calls.push([name, input]) } } } as unknown as GameContext;
}

function fakeBackend(calls: unknown[]): Pick<LiveGameBackend, "transport"> {
  return {
    transport: {
      joinServer: async () => ({ serverId: "s1", isNew: true }),
      leaveServer: async () => {},
      runCommand: async (args) => {
        calls.push(args);
        return { ok: true } as const;
      },
    },
  };
}

describe("command sink", () => {
  test("localCommandSink runs on the local ctx", () => {
    const local: [string, unknown][] = [];
    localCommandSink(fakeCtx(local)).run("cast", { slot: 1 });
    expect(local).toEqual([["cast", { slot: 1 }]]);
  });

  test("remoteCommandSink forwards to the transport", () => {
    const remote: unknown[] = [];
    remoteCommandSink(fakeBackend(remote), "s1").run("cast", { slot: 1 });
    expect(remote).toEqual([{ serverId: "s1", command: "cast", input: { slot: 1 } }]);
  });

  test("resolveCommandSink routes to the host only when server-authoritative and connected", () => {
    const local: [string, unknown][] = [];
    const remote: unknown[] = [];
    const ctx = fakeCtx(local);
    const backend = fakeBackend(remote);

    resolveCommandSink(ctx, { serverAuthoritative: true, backend, serverId: "s1" }).run("a", 1);
    resolveCommandSink(ctx, { serverAuthoritative: false, backend, serverId: "s1" }).run("b", 2);
    resolveCommandSink(ctx, { serverAuthoritative: true, backend: null, serverId: "s1" }).run("c", 3);
    resolveCommandSink(ctx, { serverAuthoritative: true, backend, serverId: null }).run("d", 4);

    expect(remote).toEqual([{ serverId: "s1", command: "a", input: 1 }]);
    expect(local).toEqual([["b", 2], ["c", 3], ["d", 4]]);
  });
});
