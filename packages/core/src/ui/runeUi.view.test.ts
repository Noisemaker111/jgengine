import { expect, test } from "bun:test";
import { RuneUi, type JgUiModule } from "./runeUi.view";

function mockHost() {
  const calls: string[] = [];
  let removed = false;
  const style: Record<string, string> = {};
  const canvas = { id: "jg-ui-test", style, remove: () => { removed = true; } } as unknown as HTMLCanvasElement;
  const memory = new WebAssembly.Memory({ initial: 1 });
  const api: JgUiModule = {
    default: async () => ({ memory }),
    mount: () => calls.push("mount"),
    set_layer_spec: (id, z) => calls.push(`set_layer_spec:${id}:${z}`),
    remove_layer: (id) => calls.push(`remove_layer:${id}`),
    add_fonts: (urls) => calls.push(`add_fonts:${urls}`),
    patch_layer_native: (id) => calls.push(`patch_layer_native:${id}`),
    scroll_native_into_view: () => {},
    focus_native: () => {},
    blur_native: () => {},
    values_changed: () => calls.push("values_changed"),
    frames_drawn: () => 1,
    unmount: () => calls.push("unmount"),
    values_ptr: () => 0,
    values_len: () => 256,
  };
  return { calls, canvas, style, memory, api, isRemoved: () => removed };
}

test("multiple concurrent layers share one canvas and host; removing one keeps the host alive until the last layer goes", () => {
  const host = mockHost();
  const under = RuneUi.createForTest(host.canvas, host.api, host.memory, 30);
  const game = RuneUi.createForTest(host.canvas, host.api, host.memory, 40);
  const over = RuneUi.createForTest(host.canvas, host.api, host.memory, 200);

  expect(under.ui.surfaceCanvas).toBe(game.ui.surfaceCanvas);
  expect(game.ui.surfaceCanvas).toBe(over.ui.surfaceCanvas);
  expect(host.style["zIndex"]).toBe("200");

  under.ui.setSpec([]);
  game.ui.setSpec([], true);
  game.ui.patchNative([{ id: "n1", field: "fill", value: "#123456" }]);
  expect(host.calls).toEqual([
    `set_layer_spec:${under.ui.layerId}:30`,
    `set_layer_spec:${game.ui.layerId}:40`,
    `patch_layer_native:${game.ui.layerId}`,
  ]);

  // Removing the top overlay layer lowers the shared canvas z-index and keeps the host alive.
  over.ui.destroy();
  expect(host.calls.at(-1)).toBe(`remove_layer:${over.ui.layerId}`);
  expect(host.style["zIndex"]).toBe("40");
  expect(host.isRemoved()).toBe(false);

  // Removing the game layer leaves the under layer live.
  game.ui.destroy();
  expect(host.calls.at(-1)).toBe(`remove_layer:${game.ui.layerId}`);
  expect(host.style["zIndex"]).toBe("30");
  expect(host.isRemoved()).toBe(false);

  // Removing the last layer unmounts Rune and removes the canvas.
  under.ui.destroy();
  expect(host.calls.at(-1)).toBe("unmount");
  expect(host.isRemoved()).toBe(true);
});

test("per-layer revisions gate nativeRects updates and shared frame modal state propagates", () => {
  const host = mockHost();
  const a = RuneUi.createForTest(host.canvas, host.api, host.memory, 30);
  const b = RuneUi.createForTest(host.canvas, host.api, host.memory, 40);
  try {
    a.ui.setSpec([]);
    b.ui.setSpec([], true);
    a.onFrame(JSON.stringify({
      revisions: [[a.ui.layerId, 1], [b.ui.layerId, 1]],
      events: [],
      regions: [[0, 0, 100, 40]],
      modal: true,
      nativeRects: [["n1", [10, 20, 80, 30]]],
    }));
    expect(a.ui.modal).toBe(true);
    expect(b.ui.modal).toBe(true);
    expect(a.ui.nativeRects.get("n1")).toEqual([10, 20, 80, 30]);
    expect(b.ui.nativeRects.get("n1")).toEqual([10, 20, 80, 30]);
    expect(b.ui.overUi(50, 20)).toBe(true);
    expect(b.ui.overUi(200, 200)).toBe(false);
  } finally {
    a.ui.destroy();
    b.ui.destroy();
  }
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
