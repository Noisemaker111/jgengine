/** @jsxImportSource @jgengine/core/ui/jsx */
import { writeFile } from "node:fs/promises";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { Root } from "@jgengine/core/ui/jsx/reconciler";
import { RuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { RuneNode, nativeSpec, nativeTreeHost, type RuneTreeSink } from "@jgengine/core/ui/rune/nativeTree";
import { GameProvider } from "@jgengine/ui/provider";
import { SettingsControllerProvider, type SettingsController } from "@jgengine/core/settings/settings.view";
import { stageRun } from "../src/game/capture";
import { session } from "../src/game/session";
import { advanceKeep, beaconRunner } from "../src/game/testing";
import { GameUI } from "../src/game/ui/GameUI";
import { focusMenu } from "../src/game/ui/menu/BeaconMenu";

export const NATIVE_STATES = ["title", "new", "keeps", "settings", "credits", "hud", "midwave", "tower", "breached", "boss", "paused", "result"] as const;
export type NativeFixture = (typeof NATIVE_STATES)[number];

/** The real GameUI over a real headless defense, with deterministic viewport and settings inputs. */
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
    focusMenu(null);
    if (originalStorage === undefined) Reflect.deleteProperty(globalThis, "localStorage");
    else Object.defineProperty(globalThis, "localStorage", originalStorage);
  }
}

function renderFixture(state: NativeFixture, width: number, height: number) {
  const runner = beaconRunner("Beacon native UI proof"), ctx = runner.ctx;
  const run = (name: string, input: unknown = {}) => ctx.game.commands.run(name, input);
  setGamePhase(ctx, "playing");
  if (state === "midwave") stageRun(ctx, "midwave");
  if (state === "breached") stageRun(ctx, "breached");
  if (state === "boss") stageRun(ctx, "boss");
  if (state === "result") stageRun(ctx, "result");
  if (state === "tower") {
    run("buildTower2"); run("tower.build", { point: [0, 0, 4] }); advanceKeep(runner, 12);
    run("buildTower2"); run("tower.build", { point: [0, 0, 4] });
    if (session.inspectedTowerId === null) throw new Error("the fixture's tower is not inspected");
  }
  if (state === "paused") setGamePhase(ctx, "paused");
  if (state === "title" || state === "new" || state === "keeps" || state === "settings" || state === "credits") setGamePhase(ctx, "menu");
  focusMenu(state === "new" || state === "keeps" || state === "settings" || state === "credits" ? state : null);
  const settings: SettingsController = {
    categories: [{ id: "sound", label: "Sound", keybinds: [], rows: [
      { id: "master", label: "Master volume", kind: "slider", value: 0.8, min: 0, max: 1, step: 0.01, set: () => {} },
      { id: "mute", label: "Mute", kind: "toggle", value: false, set: () => {} },
    ] }], actions: [], variant: "panel", surface: false, isOpen: false, open: () => {}, close: () => {}, setOpen: () => {},
  };
  const container = new RuneNode("container");
  const tree = new Root(nativeTreeHost(() => {}), container, "fixture", false);
  tree.render(<GameProvider context={ctx}><SettingsControllerProvider controller={settings}><RuneViewport width={width} height={height}><GameUI /></RuneViewport></SettingsControllerProvider></GameProvider>);
  const surface = container.children[0];
  if (surface?.tag !== "rune-surface") throw new Error("Beacon Bastion did not mount a direct native surface");
  const unused = () => { throw new Error("headless sampling must not bind slots"); };
  const sink: RuneTreeSink = { setSpec: unused, bindNumber: unused, writeNumber: unused, bindText: unused };
  const spec = nativeSpec(surface, sink, true);
  tree.unmount();
  return spec;
}

if (import.meta.main) {
  const state = process.argv[2], output = process.argv[3];
  if (state === undefined || output === undefined) throw new Error("usage: bun games/beacon-bastion/proofs/runeUiFixture.tsx <state> <out.json> [width height]");
  const known = NATIVE_STATES.find((entry) => entry === state);
  if (known === undefined) throw new Error(`Unknown Beacon UI state: ${state}`);
  await writeFile(output, JSON.stringify(await runeUiFixture(known, Number(process.argv[4] ?? 1280), Number(process.argv[5] ?? 720))));
}
