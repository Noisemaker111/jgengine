import { expect, test } from "bun:test";
import { driveMjs } from "./gameFiles";

test("emitted driver focuses the play surface and holds through a starved frame", async () => {
  const fragment = driveMjs.slice(driveMjs.indexOf("const focusGameSurface ="), driveMjs.indexOf("async function rpc("));
  let clock = 0;
  let focused = false;
  let reads = 0;
  const events: string[] = [];
  const surface = { focus: () => { focused = true; } };
  const document = { querySelector: () => ({ closest: () => surface }), get activeElement() { return focused ? surface : null; } };
  const holdKey = new Function("sleep", "Date", fragment + "; return holdKey;")(
    async () => { clock += 100; }, { now: () => clock },
  );
  await holdKey({
    send: async (_method: string, args?: { type: string }) => {
      if (args?.type === "keyDown") expect(focused).toBe(true);
      if (args) events.push(args.type);
    },
    evaluate: async (expression: string) => {
      if (expression.endsWith("(document)")) return new Function("document", "return " + expression)(document);
      if (expression === "globalThis.__jgFrames ?? 0") return reads++ < 2 ? 0 : 1;
      return undefined;
    },
  }, "KeyA", 0);
  expect(clock).toBe(200);
  expect(events).toEqual(["keyDown", "keyUp"]);
});

test("emitted driver releases held keys if frame sampling fails", async () => {
  const fragment = driveMjs.slice(driveMjs.indexOf("const focusGameSurface ="), driveMjs.indexOf("async function rpc("));
  const holdKey = new Function("sleep", fragment + "; return holdKey;")(async () => {});
  let reads = 0;
  const events: string[] = [];
  await expect(holdKey({
    send: async (_method: string, args?: { type: string }) => { if (args) events.push(args.type); },
    evaluate: async (expression: string) => {
      if (expression === "globalThis.__jgFrames ?? 0" && reads++ > 0) throw new Error("closed page");
      return 0;
    },
  }, "KeyA", 0)).rejects.toThrow("closed page");
  expect(events).toEqual(["keyDown", "keyUp"]);
});
