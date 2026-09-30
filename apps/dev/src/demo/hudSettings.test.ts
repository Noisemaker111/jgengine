import { describe, expect, test } from "bun:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createActionStateTracker, toActionStateBindingMap } from "../../../../packages/core/dist/input/actionBindings.js";
import { defineGameDefinition } from "../../../../packages/core/dist/game/defineGame.js";
import { createAssetCatalog } from "../../../../packages/core/dist/scene/assetCatalog.js";
import { createGameContext } from "../../../../packages/core/dist/runtime/gameContext.js";
import { createSettingsStore, type GameSettingsConfig } from "../../../../packages/core/dist/settings/settingsModel.js";
import { SettingsTrigger, useSettings, useSettingsStore, type SettingsController } from "../../../../packages/react/dist/settings.js";
import { createAudioEngine } from "../../../../packages/shell/dist/audio/audioEngine.js";
import type { PlayableGame } from "../../../../packages/shell/dist/registry.js";

import { ShellHudPresentation } from "../../../../packages/shell/dist/ShellHudPresentation.js";

function renderHud(settings: GameSettingsConfig | false | undefined) {
  const store = createSettingsStore(null);
  store.set("readout.style", "compact");
  const game = defineGameDefinition({ name: "hud-settings", assets: createAssetCatalog(), input: { signal: ["Space"] } });
  const ctx = createGameContext({ definition: game, content: {}, player: { userId: "courier", isNew: true } });
  let controller: SettingsController | undefined;
  let providedStore: ReturnType<typeof useSettingsStore> | undefined;
  const rebindings: string[][] = [];
  const resets: string[] = [];
  const playable: PlayableGame = {
    game, content: {}, presentation: "hud", settings,
    GameUI() {
      controller = useSettings();
      providedStore = useSettingsStore();
      return createElement(SettingsTrigger, { label: "Display settings" });
    },
    loop: { onInit() {}, onNewPlayer() {}, onTick() {}, onReset() {}, onDispose() {} },
  };
  const html = renderToStaticMarkup(createElement(ShellHudPresentation, {
    playable, ctx, multiplayer: null, serverIdRef: { current: null },
    tracker: createActionStateTracker<string>(toActionStateBindingMap(game.input ?? {})), pointerAxisRef: { current: null },
    gateRef: { current: false }, wrapperRef: { current: null }, f2HeldRef: { current: false },
    yawRef: { current: 0 }, pitchRef: { current: 0 }, touchScheme: null,
    touchSink: { onCodeDown() {}, onCodeUp() {} }, orientationGate: false, orientationGateEl: null,
    coarsePointer: false, uiScale: 1, diagnostics: [], devtoolsEnabled: false, devtoolsOpen: false,
    setDevtoolsOpen() {}, reportRuntimeError() {}, trackPointerAxis() {}, deactivatePointerAxis() {},
    onPointerResumeAudio() {}, settingsStore: store, bindingOverrides: { signal: ["KeyF"] },
    rebindAction: (action, code) => rebindings.push([action, code]),
    resetActionBinding: (action) => resets.push(action), audioEngine: createAudioEngine(), poster: false,
  }));
  if (controller === undefined) throw Error("HUD GameUI did not render");
  return { html, controller, store, providedStore, ctx, rebindings, resets };
}

describe("HUD settings ownership", () => {
  test("provides the shell store, configured rows, binding callbacks and live game actions", () => {
    const hud = renderHud({
      categories: [{ id: "gameplay", label: "Display" }], hide: ["sound", "graphics"],
      extra: [{ id: "readout.style", label: "Readout style", category: "gameplay", kind: "select", default: "detailed",
        options: [{ value: "detailed", label: "Detailed" }, { value: "compact", label: "Compact" }] }],
      actions: [{ id: "reset", label: "Reset readout", run: (ctx) => ctx.game.store.set("reset", true) }],
    });
    expect(hud.html).toContain('aria-label="Display settings"');
    expect(hud.providedStore).toBe(hud.store);
    const display = hud.controller.categories.find((category) => category.label === "Display")!;
    expect(display.rows.map((row) => row.id)).toEqual(["readout.style"]);
    expect(display.rows[0]!.value).toBe("compact");
    display.rows[0]!.set("detailed");
    expect(hud.store.get("readout.style", "")).toBe("detailed");
    const binding = hud.controller.categories.find((category) => category.id === "controls")!.keybinds[0]!;
    expect(binding.isDefault).toBe(false);
    expect(binding.bindingLabel).toBe("F");
    binding.rebind("KeyG");
    binding.reset();
    expect(hud.rebindings).toEqual([["signal", "KeyG"]]);
    expect(hud.resets).toEqual(["signal"]);
    hud.controller.actions[0]!.run();
    expect(hud.ctx.game.store.get("reset")).toBe(true);
  });

  test("omits the trigger when settings are disabled", () => {
    const hud = renderHud(false);
    expect(hud.html).not.toContain('aria-label="Display settings"');
    expect(hud.controller.categories).toEqual([]);
    expect(hud.controller.actions).toEqual([]);
    expect(hud.controller.surface).toBe(false);
  });
});
