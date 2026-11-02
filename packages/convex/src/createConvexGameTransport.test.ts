import { expect, test } from "bun:test";
import { getFunctionName, type FunctionReference } from "convex/server";
import { createConvexGameTransport, createConvexPresenceSync, defaultConvexGameApi, type ConvexGameClient } from "./createConvexGameTransport";

test("unload leaves each session the transport still holds, and only those", async () => {
  const calls: Record<string, unknown>[] = [];
  const api = defaultConvexGameApi();
  const client = {
    mutation: async (ref: unknown, args: Record<string, unknown>) => {
      calls.push({ ref: ref === api.runtime.joinServer ? "join" : "leave", ...args });
      return { ok: true, serverId: "srv", isNew: false };
    },
  } as unknown as ConvexGameClient;
  const transport = createConvexGameTransport(client, api, { gameId: "demo", userId: "alice" });
  await transport.joinServer({ gameId: "demo", sessionId: "a" });
  await transport.joinServer({ gameId: "demo", sessionId: "b" });
  await transport.leaveServer({ serverId: "srv", sessionId: "a" });
  calls.length = 0;
  globalThis.dispatchEvent(new Event("pagehide"));
  expect(calls).toEqual([{ ref: "leave", serverId: "srv", externalId: "alice", sessionId: "b" }]);
});

test("presence leaves its row when the last subscriber goes and on unload", () => {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const api = defaultConvexGameApi();
  // type-escape: a stub of the two client calls under test
  const client: ConvexGameClient = {
    mutation: async (ref: FunctionReference<"mutation">, args?: Record<string, unknown>) => {
      calls.push({ fn: getFunctionName(ref), args: args ?? {} });
      return null;
    },
    watchQuery: () => ({ onUpdate: () => () => undefined, localQueryResult: () => undefined, journal: () => undefined }),
  } as unknown as ConvexGameClient;
  const presence = createConvexPresenceSync(client, api, { gameId: "demo", userId: "alice" });
  const first = presence.subscribe("srv", () => undefined);
  const second = presence.subscribe("srv", () => undefined);
  first();
  expect(calls).toEqual([]);
  globalThis.dispatchEvent(new Event("pagehide"));
  expect(calls).toEqual([{ fn: "presence:leave", args: { serverId: "srv", externalId: "alice" } }]);
  calls.length = 0;
  second();
  expect(calls).toEqual([{ fn: "presence:leave", args: { serverId: "srv", externalId: "alice" } }]);
  calls.length = 0;
  globalThis.dispatchEvent(new Event("pagehide"));
  expect(calls).toEqual([]);
});
