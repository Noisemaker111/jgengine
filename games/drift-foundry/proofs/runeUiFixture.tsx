/** @jsxImportSource @jgengine/core/ui/jsx */
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { writeFile } from "node:fs/promises";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { Root } from "@jgengine/core/ui/jsx/reconciler";
import { RuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { RuneNode, nativeSpec, nativeTreeHost, type RuneTreeSink } from "@jgengine/core/ui/rune/nativeTree";
import { GameProvider } from "@jgengine/ui/provider";
import { SettingsControllerProvider, type SettingsController } from "@jgengine/core/settings/settings.view";
import { physics, world } from "../src/world";
import { content } from "../src/game/content";
import { stageRun } from "../src/game/capture";
import { createRunSession, runSessionStore } from "../src/game/run/session";
import { foundrySaveOf } from "../src/game/foundrySave";
import { driveInputStore } from "../src/game/run/store";
import { createDriveInput } from "../src/game/vehicle/input";
import { GameUI } from "../src/game/ui/GameUI";
import { menuFocus } from "../src/game/ui/PitMenu";

export const FIXTURE_STATES = ["title", "continue", "calendar", "garage", "records", "settings", "credits", "hud", "pause", "pause-garage", "pause-settings", "settings-sheet", "result"] as const;
export type NativeFixture = (typeof FIXTURE_STATES)[number];

/** Real GameUI and run session, with deterministic viewport/settings inputs for native paint checks. */
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
    if (originalStorage === undefined) Reflect.deleteProperty(globalThis, "localStorage");
    else Object.defineProperty(globalThis, "localStorage", originalStorage);
  }
}

function renderFixture(state: NativeFixture, width: number, height: number) {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "Drift Foundry native UI proof", world, physics, multiplayer: "off", persist: false, lifecycle: "always-live" }),
    player: { userId: "driver", isNew: true },
    content,
  });
  // The yard save reads the stubbed localStorage, so each state starts from a blank career.
  const session = createRunSession(ctx.world.groundHeightAt, foundrySaveOf(ctx), ctx.game.notices);
  runSessionStore.write(ctx, session);
  driveInputStore.write(ctx, createDriveInput());
  setGamePhase(ctx, "menu");
  if (state === "continue") {
    // A real parked run: drive into the corridor, brake to a stop on the ground, park, go back to the pit.
    stageRun(ctx, "midrun");
    for (let i = 0; i < 600 && session.snapshot().pose.speedKmh > 0.5; i++) session.tick(1 / 60, { throttle: 0, brake: 1, steer: 0 }, { jumpPressed: false, plowBracing: false });
    session.park();
    session.returnToTitle();
  }
  if (state === "hud" || state === "pause" || state === "pause-garage" || state === "pause-settings") { stageRun(ctx, "midrun"); setGamePhase(ctx, "playing"); }
  if (state === "pause" || state === "pause-garage" || state === "pause-settings") { session.togglePause(); setGamePhase(ctx, "paused"); }
  if (state === "result") { stageRun(ctx, "result"); setGamePhase(ctx, "ended"); }
  if (state === "settings-sheet") { stageRun(ctx, "midrun"); session.suspend(true); }
  runSessionStore.write(ctx, session);
  menuFocus.id = state === "calendar" || state === "garage" || state === "records" || state === "settings" || state === "credits" || state === "continue" ? state
    : state === "pause-garage" ? "garage" : state === "pause-settings" ? "settings" : null;
  const settings: SettingsController = {
    categories: [{ id: "sound", label: "Sound", keybinds: [], rows: [
      { id: "master", label: "Master volume", kind: "slider", value: .8, min: 0, max: 1, step: .01, set: () => {} },
      { id: "mute", label: "Mute", kind: "toggle", value: false, set: () => {} },
    ] }, { id: "controls", label: "Controls", keybinds: [], rows: [] }],
    actions: [{ id: "restart", label: "Restart run", kind: "danger", run: () => {} }],
    variant: "sheet", surface: false, isOpen: state === "settings-sheet", open: () => {}, close: () => {}, setOpen: () => {},
  };
  const container = new RuneNode("container");
  const tree = new Root(nativeTreeHost(() => {}), container, "fixture", false);
  tree.render(<GameProvider context={ctx}><SettingsControllerProvider controller={settings}><RuneViewport width={width} height={height}><GameUI /></RuneViewport></SettingsControllerProvider></GameProvider>);
  const surface = container.children[0];
  if (surface?.tag !== "rune-surface") throw new Error("Drift Foundry did not mount a direct native surface");
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
  if (state === undefined || output === undefined) throw new Error("usage: bun games/drift-foundry/proofs/runeUiFixture.tsx <state> <out.json> [width height]");
  const known: readonly string[] = FIXTURE_STATES;
  if (!known.includes(state)) throw new Error(`Unknown Drift Foundry UI state: ${state}`);
  const spec = await runeUiFixture(state as NativeFixture, Number(process.argv[4] ?? 1280), Number(process.argv[5] ?? 720)); // type-escape: state was checked against the fixture vocabulary above
  await writeFile(output, JSON.stringify(spec));
}
