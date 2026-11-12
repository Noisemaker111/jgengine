/** @jsxImportSource @jgengine/core/ui/jsx */
import { writeFile } from "node:fs/promises";
import { showMenuPane, togglePause } from "@jgengine/core/game/gameFlow";
import { createPlaySession } from "@jgengine/core/play/playSession.draw";
import { flushSync, Root } from "@jgengine/core/ui/jsx/reconciler";
import { RuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { RuneNode, nativeEnabled, nativeLabel, nativeSpec, nativeTreeHost, visibleNativeNodes, type RuneTreeSink } from "@jgengine/core/ui/rune/nativeTree";
import { GameProvider } from "@jgengine/ui/provider";
import { ActionBindingsProvider } from "@jgengine/core/input/actionBindings.view";
import { SettingsControllerProvider, type SettingsController } from "@jgengine/core/settings/settings.view";

import { game } from "../src/game.config";
import { GameUI } from "../src/game/rune/GameUI";
import { titleRoute } from "../src/game/rune/Menu";

export const FIXTURES = ["title", "controls", "settings", "credits", "creator", "hud", "detail", "inventory", "engrams", "dossier", "creature", "storage", "obelisk", "paused"] as const;
export type NativeFixture = (typeof FIXTURES)[number];

/** A headless Fernwild run staged at `state`, as a player would reach it. */
function stageFixture(state: NativeFixture) {
  const session = createPlaySession(game, { seed: 1 });
  const { ctx } = session;
  const tick = (seconds: number, held: readonly string[] = []) => {
    for (let t = 0; t < seconds; t += session.dt) session.tick(held);
  };
  tick(0.2);
  const onTitle = state === "title" || state === "controls" || state === "settings" || state === "credits" || state === "creator";
  if (!onTitle) {
    session.command("start", {});
    tick(0.5);
    session.command("cheat", {
      give: { stone_pick: 1, stone_hatchet: 1, spear: 1, thatch: 40, wood: 20, stone: 30, flint: 12, fiber: 50, mejoberry: 15, cooked_meat: 3, cloth_shirt: 1, narcotic: 4 },
      toHotbar: ["stone_pick", "stone_hatchet", "spear", "mejoberry"],
      xp: 400,
    });
    tick(0.2);
  }
  if (state === "controls" || state === "settings" || state === "credits") showMenuPane(ctx, state);
  titleRoute.first = state === "creator" ? "creator" : null;
  if (state === "detail") session.command("hudDetail", {});
  if (state === "inventory" || state === "engrams" || state === "dossier" || state === "obelisk") session.command("screen", { screen: state });
  if (state === "creature") {
    session.command("cheat", { summon: { species: "dodo", level: 5, distance: 2.5, tamed: true } });
    tick(0.4);
    session.command("creatureUse", {});
    tick(0.1);
  }
  if (state === "storage") {
    // Place the box from the hotbar in front, as a player clicks it down, then open it with E.
    session.command("cheat", { give: { storage_box: 1 }, toHotbar: ["storage_box"] });
    const boxSlot = ctx.player.inventory.state("hotbar").slots.findIndex((slot) => slot?.itemId === "storage_box");
    tick(0.05, [`slot${boxSlot + 1}`]);
    tick(0.1);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      tick(0.1, ["fire"]);
      tick(0.1);
    }
    tick(0.05, ["interact"]);
    tick(0.2);
    session.command("storePut", { inventoryId: "inventory", slot: ctx.player.inventory.state("inventory").slots.findIndex((slot) => slot?.itemId === "stone") });
  }
  if (state === "paused") togglePause(ctx);
  return { session, ctx, tick };
}

/** Deterministic settings: two categories, a slider and a toggle; every `set` is recorded. */
function settingsFixture(sets: [string, unknown][] = []): SettingsController {
  const row = (id: string, label: string, kind: "slider" | "toggle", value: number | boolean) => ({ id, label, kind, value, min: 0, max: 1, step: 0.01, set: (next: unknown) => { sets.push([id, next]); } });
  return {
    categories: [
      { id: "audio", label: "Sound", keybinds: [], rows: [row("master", "Master volume", "slider", 0.8), row("mute", "Mute", "toggle", false)] },
      { id: "graphics", label: "Graphics", keybinds: [], rows: [row("shadows", "Shadows", "toggle", true)] },
    ],
    actions: [], variant: "panel", surface: false, isOpen: false, open: () => {}, close: () => {}, setOpen: () => {},
  };
}

/** The real GameUI over a real headless Fernwild run, with deterministic viewport and settings, serialized as native elements. */
export async function runeUiFixture(state: NativeFixture, width = 1280, height = 720) {
  const { ctx } = stageFixture(state);
  const settings = settingsFixture();
  const container = new RuneNode("container");
  const tree = new Root(nativeTreeHost(() => {}), container, "fixture", false);
  tree.render(<GameProvider context={ctx}><SettingsControllerProvider controller={settings}><RuneViewport width={width} height={height}><GameUI /></RuneViewport></SettingsControllerProvider></GameProvider>);
  const surface = container.children[0];
  if (surface?.tag !== "rune-surface") throw new Error("Fernwild did not mount a direct native surface");
  const unused = () => { throw new Error("headless sampling must not bind slots"); };
  const sink: RuneTreeSink = { setSpec: unused, bindNumber: unused, writeNumber: unused, bindText: unused };
  const spec = nativeSpec(surface, sink, true);
  tree.unmount();
  titleRoute.first = null;
  return spec;
}

/**
 * The real GameUI mounted live over a headless run: `press` activates a native control by its label as a click
 * does, `key` sends a key to the top key-capturing view, and `text` reads what the native tree shows.
 */
export async function mountRuneUi(state: NativeFixture, width = 1280, height = 720) {
  const memory = new Map<string, string>();
  const storage = { getItem: (key: string) => memory.get(key) ?? null, removeItem: (key: string) => { memory.delete(key); }, setItem: (key: string, value: string) => { memory.set(key, value); }, clear: () => memory.clear(), key: () => null, length: 0 };
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  const staged = stageFixture(state);
  const sets: [string, unknown][] = [];
  const container = new RuneNode("container");
  const tree = new Root(nativeTreeHost(() => {}), container, "live", true);
  tree.render(<GameProvider context={staged.ctx}><ActionBindingsProvider bindings={game.game.input ?? {}}><SettingsControllerProvider controller={settingsFixture(sets)}><RuneViewport width={width} height={height}><GameUI /></RuneViewport></SettingsControllerProvider></ActionBindingsProvider></GameProvider>);
  const surface = () => {
    const root = container.children[0];
    if (root?.tag !== "rune-surface") throw new Error("Fernwild did not mount a direct native surface");
    return root;
  };
  const settle = async () => {
    for (let round = 0; round < 4; round += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      flushSync();
    }
  };
  await settle();
  const controls = () => visibleNativeNodes(surface()).filter((node) => nativeEnabled(node) && node.props.onPress !== undefined);
  return {
    ...staged,
    sets,
    settle,
    labels: () => controls().map(nativeLabel),
    text: () => visibleNativeNodes(surface()).filter((node) => node.tag === "rune-text").map(nativeLabel).join("\n"),
    async press(label: string) {
      const found = controls();
      const node = found.find((candidate) => nativeLabel(candidate) === label) ?? found.filter((candidate) => nativeLabel(candidate).includes(label)).sort((a, b) => nativeLabel(a).length - nativeLabel(b).length)[0];
      if (node === undefined) throw new Error(`no enabled native control "${label}"; have: ${found.map(nativeLabel).join(" | ")}`);
      flushSync(() => node.props.onPress?.());
      await settle();
    },
    async key(code: string) {
      const capture = [...visibleNativeNodes(surface())].reverse().find((node) => nativeEnabled(node) && node.props.onKey !== undefined);
      if (capture === undefined) throw new Error(`no native view takes key ${code}`);
      flushSync(() => capture.props.onKey?.(code));
      await settle();
    },
    unmount() {
      tree.unmount();
      titleRoute.first = null;
      if (originalStorage === undefined) Reflect.deleteProperty(globalThis, "localStorage");
      else Object.defineProperty(globalThis, "localStorage", originalStorage);
    },
  };
}

if (import.meta.main) {
  const state = process.argv[2];
  const output = process.argv[3];
  if (state === undefined || output === undefined) throw new Error("usage: bun games/fernwild/proofs/runeUiFixture.tsx <state> <out.json> [width height]");
  const known: readonly string[] = FIXTURES;
  if (!known.includes(state)) throw new Error(`Unknown Fernwild UI state: ${state}`);
  const spec = await runeUiFixture(state as NativeFixture, Number(process.argv[4] ?? 1280), Number(process.argv[5] ?? 720)); // type-escape: state was checked against the fixture vocabulary above
  await writeFile(output, JSON.stringify(spec));
}
