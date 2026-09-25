import { expect, test } from "bun:test";
import { createConvexGameTransport, defaultConvexGameApi, type ConvexGameClient } from "./createConvexGameTransport";

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
