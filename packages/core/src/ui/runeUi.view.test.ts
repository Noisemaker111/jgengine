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

test("the Rune bundle loads under the app base, so the site's /play/ runner finds /play/jg-ui", async () => {
  const { runeBundleUrl } = await import("./runeUi.view");
  const { setAssetBase } = await import("../assets/assetBase");
  try {
    expect(runeBundleUrl()).toBe("/jg-ui/jg_ui.js");
    setAssetBase("/play/");
    expect(runeBundleUrl()).toBe("/play/jg-ui/jg_ui.js");
    expect(runeBundleUrl("https://cdn.example/jg-ui")).toBe("https://cdn.example/jg-ui/jg_ui.js");
  } finally {
    setAssetBase("/");
  }
});

test("an adapterless navigator.gpu is hidden so Rune's WebGL2 fallback gets a clean canvas", async () => {
  const { hideAdapterlessWebGpu } = await import("./runeUi.view");
  const empty: { gpu?: { requestAdapter(): Promise<unknown> } } = { gpu: { requestAdapter: async () => null } };
  expect(await hideAdapterlessWebGpu(empty)).toBe(true);
  expect(empty.gpu).toBeUndefined();
  const real = { gpu: { requestAdapter: async () => ({ name: "gpu" }) } };
  expect(await hideAdapterlessWebGpu(real)).toBe(false);
  expect(real.gpu).toBeDefined();
  expect(await hideAdapterlessWebGpu({})).toBe(false);
});

test("a frame for an older spec still places the nodes it drew; the current spec's frame replaces the layout", () => {
  const api = { set_spec: () => undefined, patch_native: () => undefined, frames_drawn: () => 0 };
  // type-escape: as above, the private constructor with a recording api.
  const ui = new (RuneUi as unknown as new (...args: unknown[]) => RuneUi)({ style: {} }, api, "", {});
  const frame = (payload: object) => (ui as unknown as { onFrame(payload: string): void }).onFrame(JSON.stringify(payload));
  const hadWindow = "window" in globalThis;
  if (!hadWindow) Object.defineProperty(globalThis, "window", { configurable: true, value: globalThis });
  try {
    ui.setSpec([]);
    frame({ revision: 1, nativeRects: [["old", [0, 0, 10, 10]]] });
    ui.setSpec([]);
    ui.setSpec([]);
    frame({ revision: 2, nativeRects: [["pause", [100, 0, 44, 44]]] });
    expect(ui.nativeRects.get("pause")).toEqual([100, 0, 44, 44]);
    expect(ui.nativeRects.get("old")).toEqual([0, 0, 10, 10]);
    frame({ revision: 3, nativeRects: [["pause", [100, 0, 44, 44]]] });
    expect(ui.nativeRects.has("old")).toBe(false);
  } finally {
    if (!hadWindow) Reflect.deleteProperty(globalThis, "window");
  }
});
