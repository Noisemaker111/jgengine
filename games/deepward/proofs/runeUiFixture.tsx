/** @jsxImportSource @jgengine/core/ui/jsx */
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { writeFile } from "node:fs/promises";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { Root } from "@jgengine/core/ui/jsx/reconciler";
import { RuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { RuneNode, nativeSpec, nativeTreeHost, type RuneTreeSink } from "@jgengine/core/ui/rune/nativeTree";
import { GameProvider } from "@jgengine/react/provider";
import { SettingsControllerProvider, type SettingsController } from "@jgengine/core/settings/settings.view";
import { physics, world } from "../src/world";
import { initialize, seatPlayer, stageMidDive, viewStore, whenReady } from "../src/game/controls";
import { GameUI } from "../src/game/ui/GameUI";
import { menuFocus } from "../src/game/ui/menu/DeepwardMenu";

export type NativeFixture = "home" | "dive" | "stash" | "fabricator" | "cache" | "title" | "settings" | "credits" | "paused" | "reprinting" | "saving" | "blocked";

/** Real GameUI and game state, with deterministic viewport/settings inputs for native paint checks. */
export async function runeUiFixture(state: NativeFixture, width = 1280, height = 720) {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => memory.get(key) ?? null,
    removeItem: (key: string) => { memory.delete(key); },
    setItem: (key: string, value: string) => { memory.set(key, value); },
  } });
  try { return await renderFixture(state, width, height); }
  finally {
    if (originalStorage === undefined) Reflect.deleteProperty(globalThis, "localStorage");
    else Object.defineProperty(globalThis, "localStorage", originalStorage);
  }
}

async function renderFixture(state: NativeFixture, width: number, height: number) {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "Deepward native UI proof", world, physics, multiplayer: "off", persist: false, lifecycle: "always-live" }),
    player: { userId: "diver", isNew: true },
    content: { entityById: id => id === "diver" ? { stats: { health: { max: 100 }, oxygen: { max: 110 }, ammo: { max: 6 } } } : id === "fitter" ? { stats: { health: { max: 80 } } } : null },
  });
  initialize(ctx); seatPlayer(ctx); await whenReady(ctx);
  setGamePhase(ctx, "playing");
  if (state === "dive" || state === "cache") await stageMidDive(ctx);
  if (state === "cache") ctx.game.commands.run("deepward.cache", {});
  if (state === "stash") ctx.game.commands.run("deepward.openStash", {});
  if (state === "fabricator") ctx.game.commands.run("deepward.openFabricator", {});
  if (state === "reprinting" || state === "saving" || state === "blocked") viewStore.update(ctx, value => ({ ...value, mode: state, error: state === "blocked" ? "Saved record could not be read" : "" }));
  if (state === "paused") ctx.game.commands.run("deepward.pause", {});
  if (state === "title" || state === "settings" || state === "credits") setGamePhase(ctx, "menu");
  menuFocus.id = state === "settings" || state === "credits" ? state : "new";
  const settings: SettingsController = {
    categories: [{ id: "sound", label: "Sound", keybinds: [], rows: [
      { id: "master", label: "Master volume", kind: "slider", value: .8, min: 0, max: 1, step: .01, set: () => {} },
      { id: "mute", label: "Mute", kind: "toggle", value: false, set: () => {} },
    ] }], actions: [], variant: "panel", surface: false, isOpen: false, open: () => {}, close: () => {}, setOpen: () => {},
  };
  const container = new RuneNode("container");
  const tree = new Root(nativeTreeHost(() => {}), container, "fixture", false);
  tree.render(<GameProvider context={ctx}><SettingsControllerProvider controller={settings}><RuneViewport width={width} height={height}><GameUI /></RuneViewport></SettingsControllerProvider></GameProvider>);
  const surface = container.children[0];
  if (surface?.tag !== "rune-surface") throw new Error("Deepward did not mount a direct native surface");
  const unused = () => { throw new Error("headless sampling must not bind slots"); };
  const sink: RuneTreeSink = { setSpec: unused, bindNumber: unused, writeNumber: unused, bindText: unused };
  const spec = nativeSpec(surface, sink, true);
  tree.unmount();
  menuFocus.id = null;
  return spec;
}

if (import.meta.main) {
  const state = process.argv[2];
  const output = process.argv[3];
  if (state === undefined || output === undefined) throw new Error("usage: bun games/deepward/proofs/runeUiFixture.tsx <state> <out.json> [width height]");
  const states: readonly string[] = ["home","dive","stash","fabricator","cache","title","settings","credits","paused","reprinting","saving","blocked"];
  if (!states.includes(state)) throw new Error(`Unknown Deepward UI state: ${state}`);
  const spec = await runeUiFixture(state as NativeFixture, Number(process.argv[4] ?? 1280), Number(process.argv[5] ?? 720)); // type-escape: state was checked against the fixture vocabulary above
  await writeFile(output, JSON.stringify(spec));
}
