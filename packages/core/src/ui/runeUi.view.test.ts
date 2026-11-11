import { expect, test } from "bun:test";
import { RuneUi } from "./runeUi.view";

test("native property patches wait behind the queued spec until Rune's first frame", () => {
  const calls: string[] = [];
  const api = { set_spec: () => calls.push("spec"), patch_native: () => calls.push("patch"), frames_drawn: () => 0 };
  // type-escape: the constructor is private to `create`, which loads the wasm bundle; this drives the queue with a recording api.
  const ui = new (RuneUi as unknown as new (...args: unknown[]) => RuneUi)({ style: {} }, api, "", {});
  ui.setSpec([]);
  ui.patchNative([{ id: "n1", field: "fill", value: "#123456" }]);
  expect(calls).toEqual([]);
  const hadWindow = "window" in globalThis;
  if (!hadWindow) Object.defineProperty(globalThis, "window", { configurable: true, value: globalThis });
  try { (ui as unknown as { onFrame(payload: string): void }).onFrame(JSON.stringify({ revision: 0 })); }
  finally { if (!hadWindow) Reflect.deleteProperty(globalThis, "window"); }
  expect(calls).toEqual(["spec", "patch"]);
});
