/** @jsxImportSource @jgengine/core/ui/jsx */
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { writeFile } from "node:fs/promises";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { Root } from "@jgengine/core/ui/jsx/reconciler";
import { RuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { RuneNode, nativeEnabled, nativeLabel, nativeSpec, nativeTreeHost, visibleNativeNodes, type RuneTreeSink } from "@jgengine/core/ui/rune/nativeTree";
import { GameProvider } from "@jgengine/ui/provider";
import { SettingsControllerProvider, type SettingsController } from "@jgengine/core/settings/settings.view";

import { content } from "../src/game/content";
import { hudStore } from "../src/game/hudStore";
import { HERO_PICKS } from "../src/game/heroPicks";
import { resetSession } from "../src/game/session";
import { setupSkirmish } from "../src/game/world/scene";
import { GameUI } from "../src/game/ui/GameUI";
import { menuFocus } from "../src/game/ui/CommandMenu";

export const NATIVE_FIXTURES = ["hud", "levelup", "build", "paused", "paused-settings", "title", "new", "skirmish", "records", "settings", "credits", "report"] as const;
export type NativeFixture = (typeof NATIVE_FIXTURES)[number];

/** Real GameUI over the real skirmish wiring, with deterministic viewport/settings inputs for native paint checks. */
export async function runeUiFixture(state: NativeFixture, width = 1280, height = 720) {
  const ui = await mountEmberUi(state, width, height);
  try { return ui.spec(); }
  finally { ui.unmount(); }
}

/** Settings rows that record what the UI set, for checks that drive the settings sheet. */
export function fixtureSettings(): { controller: SettingsController; volume: number[]; mute: boolean[] } {
  const volume: number[] = [], mute: boolean[] = [];
  const controller: SettingsController = {
    categories: [{ id: "sound", label: "Sound", keybinds: [], rows: [
      { id: "master", label: "Master volume", kind: "slider", value: 0.8, min: 0, max: 1, step: 0.01, set: (v) => { volume.push(Number(v)); } },
      { id: "mute", label: "Mute", kind: "toggle", value: false, set: (v) => { mute.push(Boolean(v)); } },
    ] }], actions: [], variant: "panel", surface: false, isOpen: false, open: () => {}, close: () => {}, setOpen: () => {},
  };
  return { controller, volume, mute };
}

/**
 * Mount the real GameUI over the real skirmish wiring in a headless native tree. `press`, `key` and
 * `adjust` call the same native handlers a pointer, a key or a pad step reaches; `text` reads the
 * visible native labels, as `window.__jgNativeUi.text()` does in the page.
 */
export async function mountEmberUi(state: NativeFixture, width = 1280, height = 720, settings = fixtureSettings().controller) {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => memory.get(key) ?? null,
    removeItem: (key: string) => { memory.delete(key); },
    setItem: (key: string, value: string) => { memory.set(key, value); },
    key: () => null, length: 0,
  } });
  // A live tree runs effects: the window listeners they add go to an inert stand-in, as no page is here.
  const hadWindow = "window" in globalThis;
  if (!hadWindow) Object.defineProperty(globalThis, "window", { configurable: true, value: { addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true } });
  resetSession();
  hudStore.reset();
  const ctx = createGameContext({ definition: defineGameDefinition({ name: "Ember Command native UI proof", multiplayer: "off" }), content, player: { userId: "commander", isNew: true } });
  setupSkirmish(ctx);
  ctx.game.commands.run("match.start", {});
  hudStore.set({ gold: 340, lumber: 120, foodUsed: 7, foodCap: 10, nextWaveIn: 24, wavesSent: 2 });
  if (state === "levelup") {
    const [a, b] = HERO_PICKS.map((pick) => ({ id: pick.id, label: pick.label, blurb: pick.blurb, icon: pick.icon, kind: pick.kind, taken: false, allocatable: true }));
    hudStore.set({ heroOffer: { level: 2, options: [a!, b!] } });
  }
  if (state === "build") hudStore.set({ buildArmed: "barracks" });
  if (state === "paused" || state === "paused-settings") ctx.game.commands.run("match.pause", {});
  if (state === "report") hudStore.set({ phase: "won", elapsed: 412, playerUnits: 9 });
  const menu = ["title", "new", "skirmish", "records", "settings", "credits"].includes(state);
  if (menu) hudStore.set({ phase: "ready" });
  menuFocus.id = state === "title" ? "continue" : state === "records" ? "missions" : state === "paused-settings" ? "settings" : menu ? state : null;
  const container = new RuneNode("container");
  const tree = new Root(nativeTreeHost(() => {}), container, "fixture", true);
  tree.render(<GameProvider context={ctx}><SettingsControllerProvider controller={settings}><RuneViewport width={width} height={height}><GameUI /></RuneViewport></SettingsControllerProvider></GameProvider>);
  const surface = () => {
    const root = container.children[0];
    if (root?.tag !== "rune-surface") throw new Error("Ember Command did not mount a direct native surface");
    return root;
  };
  const visible = () => visibleNativeNodes(surface());
  const control = (label: string) => {
    const node = visible().find((n) => n.props.label === label && nativeEnabled(n) && (n.props.onPress !== undefined || n.props.onAdjust !== undefined));
    if (node === undefined) throw new Error(`No enabled native control "${label}"; controls: ${visible().filter((n) => n.props.onPress !== undefined).map((n) => n.props.label ?? nativeLabel(n)).join(", ")}`);
    return node;
  };
  const settle = async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
    for (let round = 0; round < 50 && tree.pending; round += 1) await new Promise<void>((resolve) => setTimeout(resolve, 5));
  };
  await settle();
  return {
    ctx,
    spec() {
      const unused = () => { throw new Error("headless sampling must not bind slots"); };
      const sink: RuneTreeSink = { setSpec: unused, bindNumber: unused, writeNumber: unused, bindText: unused };
      return nativeSpec(surface(), sink, true);
    },
    text: () => visible().filter((n) => n.tag === "rune-text").map(nativeLabel).join("\n"),
    has: (label: string) => visible().some((n) => n.props.label === label && n.props.onPress !== undefined),
    async press(label: string) { control(label).props.onPress?.(); await settle(); },
    async adjust(label: string, delta: -1 | 1) { control(label).props.onAdjust?.(delta); await settle(); },
    async key(code: string) {
      const capture = [...visible()].reverse().find((n) => nativeEnabled(n) && n.props.onKey !== undefined);
      if (capture === undefined) throw new Error("No native key capture is armed");
      capture.props.onKey?.(code);
      await settle();
    },
    settle,
    unmount() {
      tree.unmount();
      if (!hadWindow) Reflect.deleteProperty(globalThis, "window");
      menuFocus.id = null;
      hudStore.reset();
      if (originalStorage === undefined) Reflect.deleteProperty(globalThis, "localStorage");
      else Object.defineProperty(globalThis, "localStorage", originalStorage);
    },
  };
}

if (import.meta.main) {
  const state = process.argv[2];
  const output = process.argv[3];
  if (state === undefined || output === undefined) throw new Error("usage: bun games/ember-command/proofs/runeUiFixture.tsx <state> <out.json> [width height]");
  const known: readonly string[] = NATIVE_FIXTURES;
  if (!known.includes(state)) throw new Error(`Unknown Ember Command UI state: ${state}`);
  const spec = await runeUiFixture(state as NativeFixture, Number(process.argv[4] ?? 1280), Number(process.argv[5] ?? 720)); // type-escape: state was checked against the fixture vocabulary above
  await writeFile(output, JSON.stringify(spec));
}
