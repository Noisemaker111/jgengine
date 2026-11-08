import { expect, test } from "bun:test";

import type { PostProcessingConfig } from "@jgengine/core/render/postProcessing";
import { createSettingsStore } from "@jgengine/core/settings/settingsModel";

import { graphicsSettingRows, keybindSettingRows } from "./settingsController.draw";

test("a locked action's controls row is locked and keeps its authored key over a saved override", () => {
  const rows = keybindSettingRows({
    input: { jump: ["Space"], fire: { hold: ["mouse0"], locked: true } },
    overrides: { jump: ["KeyJ"], fire: ["KeyF"] },
    hideBindings: [],
    rebind: () => undefined,
    resetBinding: () => undefined,
  });
  const fire = rows.find((row) => row.action === "fire");
  const jump = rows.find((row) => row.action === "jump");
  expect(fire?.locked).toBe(true);
  expect(fire?.isDefault).toBe(true);
  expect(fire?.bindingLabel).toBeString();
  expect(fire?.bindingLabel).not.toBe("F");
  expect(jump?.locked).toBe(false);
  expect(jump?.bindingLabel).toBe("J");
});

const rowIds = (postProcessing: PostProcessingConfig | undefined): string[] =>
  graphicsSettingRows(createSettingsStore(null), undefined, postProcessing).map((row) => row.id);

const stageRows = (postProcessing: PostProcessingConfig | undefined): string[] =>
  rowIds(postProcessing).filter((id) => id.startsWith("graphics.post."));

const otherRows = (postProcessing: PostProcessingConfig | undefined): string[] =>
  rowIds(postProcessing).filter((id) => !id.startsWith("graphics.post."));

test("a postfx stage row exists only for a stage the game's chain can build", () => {
  expect(stageRows({ ao: {}, bloom: {}, dof: { focus: 12 } })).toContain("graphics.post.dof");
  expect(stageRows({ ao: {}, bloom: {} })).not.toContain("graphics.post.dof");
});

test("every stage row follows that rule, not just depth of field", () => {
  expect(stageRows({ ao: {}, bloom: {}, dof: {}, aa: "msaa" })).toEqual(["graphics.post.ao", "graphics.post.bloom", "graphics.post.dof"]);
  expect(stageRows({ aa: "smaa", bloom: false, ao: false })).toEqual(["graphics.post.smaa", "graphics.post.fog"]);
  expect(stageRows({ aa: "smaa", bloom: false, ao: false, atmosphere: false, ssr: {}, motionBlur: {} })).toEqual(["graphics.post.smaa", "graphics.post.ssr", "graphics.post.motionBlur"]);
  expect(stageRows({ aa: false, bloom: false, ao: false, atmosphere: false })).toEqual([]);
});

test("a game with no post chain gets no stage rows and keeps every other row", () => {
  expect(stageRows(undefined)).toEqual([]);
  expect(stageRows({ enabled: false, ao: {}, bloom: {}, dof: {} })).toEqual([]);
  expect(otherRows(undefined)).toEqual(otherRows({ ao: {}, bloom: {}, dof: { focus: 12 } }));
});

test("on a desktop build Graphics adds Display mode and an Uncapped frame rate, and saves both to the shell", () => {
  const store = createSettingsStore(null);
  const browserRows = graphicsSettingRows(store, undefined, undefined, false, false, null);
  expect(browserRows.find((row) => row.id === "graphics.frameRateLimit")?.options?.map((option) => option.value)).not.toContain("uncapped");
  expect(browserRows.map((row) => row.id)).not.toContain("graphics.displayMode");
  const saved: unknown[][] = [];
  Reflect.set(globalThis, "__TAURI_INTERNALS__", { invoke: (cmd: string, args: unknown) => { saved.push([cmd, args]); return Promise.resolve(); } });
  try {
    const rows = graphicsSettingRows(store, undefined, undefined, false, false, { frameRate: { running: "vsync", saved: "vsync", forced: false }, fullscreen: true, steamOverlay: false });
    const display = rows[0];
    expect(display).toMatchObject({ id: "graphics.displayMode", label: "Display mode", value: "fullscreen" });
    display?.set("windowed");
    const row = rows.find((entry) => entry.id === "graphics.frameRateLimit");
    expect(row?.options?.at(-1)).toEqual({ value: "uncapped", label: "Uncapped (after restart)" });
    row?.set("uncapped");
    expect(store.get("graphics.frameRateLimit", "display")).toBe("uncapped");
    expect(store.get("graphics.displayMode", "fullscreen")).toBe("windowed");
    expect(saved).toEqual([["set_fullscreen", { fullscreen: false }], ["set_frame_rate", { mode: "uncapped" }]]);
  } finally {
    Reflect.deleteProperty(globalThis, "__TAURI_INTERNALS__");
  }
});
