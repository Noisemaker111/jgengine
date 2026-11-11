/** @jsxImportSource @jgengine/core/ui/jsx */
import { writeFile } from "node:fs/promises";
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";
import { Root } from "@jgengine/core/ui/jsx/reconciler";
import { RuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { RuneNode, nativeSpec, nativeTreeHost, type RuneTreeSink } from "@jgengine/core/ui/rune/nativeTree";
import { GameProvider } from "@jgengine/react/provider";
import { SettingsControllerProvider, type SettingsController } from "@jgengine/core/settings/settings.view";
import { game } from "../src/game.config";
import { DAY_LENGTH } from "../src/game/catalog";
import { resetPark } from "../src/game/parkReset";
import { park } from "../src/game/park";
import { refreshParkSlot } from "../src/game/parkSlot";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { FIRST_SCENARIO } from "../src/game/scenarios";
import { resetSession, session } from "../src/game/session";
import { GameUI } from "../src/game/ui/GameUI";
import { parkFocus } from "../src/game/ui/menu/ParkMenu";

export const NATIVE_STATES = ["title", "new", "saves", "settings", "credits", "hud", "inspector", "guest", "books", "research", "paused", "pause-settings", "help", "won", "bankrupt", "ribbon"] as const;
export type NativeFixture = (typeof NATIVE_STATES)[number];

/** Real GameUI and game state, with deterministic viewport/settings inputs for native paint checks. */
export async function runeUiFixture(state: NativeFixture, width = 1280, height = 720) {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => memory.get(key) ?? null,
    removeItem: (key: string) => { memory.delete(key); },
    setItem: (key: string, value: string) => { memory.set(key, value); },
  } });
  try { return renderFixture(state, width, height); }
  finally {
    parkFocus.id = null; parkFocus.panel = null;
    resetSession();
    if (originalStorage === undefined) Reflect.deleteProperty(globalThis, "localStorage");
    else Object.defineProperty(globalThis, "localStorage", originalStorage);
  }
}

function renderFixture(state: NativeFixture, width: number, height: number) {
  resetSession();
  const runner = createHeadlessRunner({ game, maxStepSeconds: 1 });
  const ctx = runner.ctx, run = (name: string, input: Record<string, unknown> = {}) => runner.ui.invoke(name, input);
  const w = park.of(ctx);
  parkFocus.id = state === "new" || state === "saves" || state === "settings" || state === "credits" ? state : state === "pause-settings" ? "settings" : state === "help" ? "help" : null;
  parkFocus.panel = state === "books" ? "books" : state === "research" ? "research" : null;
  if (state === "saves") { run("park.start"); run("park.save"); session.started = false; setGamePhase(ctx, "menu"); refreshParkSlot(); }
  if (state === "hud" || state === "research") { run("park.scenario", { id: FIRST_SCENARIO }); run("park.start"); runner.step(0.4); }
  if (state === "paused" || state === "pause-settings" || state === "help" || state === "won" || state === "bankrupt" || state === "ribbon") run("park.start");
  if (state === "inspector" || state === "guest" || state === "books") {
    ctx.time.hydrate({ ...ctx.time.snapshot(), now: DAY_LENGTH * 0.3 });
    // The authored starter park with a small crowd, seeded directly: what `park.stage` reaches without running a day.
    resetPark(ctx, { layout: "starter", guests: 6 });
    run("park.start");
  }
  if (state === "inspector") session.selectedObject = w.instances("ride")[0]?.id ?? null;
  if (state === "guest") { const [guest] = session.guests.keys(); if (guest !== undefined) ctx.scene.entity.selection.replace([guest]); }
  if (state === "paused" || state === "pause-settings" || state === "help") run("pauseToggle");
  if (state === "won") { run("park.scenario", { id: FIRST_SCENARIO }); w.set("scenario.result", "won"); }
  if (state === "bankrupt") w.set("park.game_over", true);
  if (state === "ribbon") w.set("park.won", true);
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
  if (surface?.tag !== "rune-surface") throw new Error("Brightway did not mount a direct native surface");
  const unused = () => { throw new Error("headless sampling must not bind slots"); };
  const sink: RuneTreeSink = { setSpec: unused, bindNumber: unused, writeNumber: unused, bindText: unused };
  const spec = nativeSpec(surface, sink, true);
  tree.unmount();
  return spec;
}

if (import.meta.main) {
  const state = process.argv[2];
  const output = process.argv[3];
  if (state === undefined || output === undefined) throw new Error("usage: bun games/brightway-park/proofs/runeUiFixture.tsx <state> <out.json> [width height]");
  if (!(NATIVE_STATES as readonly string[]).includes(state)) throw new Error(`Unknown Brightway UI state: ${state}`);
  const spec = await runeUiFixture(state as NativeFixture, Number(process.argv[4] ?? 1280), Number(process.argv[5] ?? 720)); // type-escape: state was checked against the fixture vocabulary above
  await writeFile(output, JSON.stringify(spec));
}
