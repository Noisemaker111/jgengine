/** @jsxImportSource @jgengine/core/ui/jsx */
import { writeFile } from "node:fs/promises";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { Root } from "@jgengine/core/ui/jsx/reconciler";
import { RuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { RuneNode, nativeSpec, nativeTreeHost, type RuneTreeSink } from "@jgengine/core/ui/rune/nativeTree";
import { GameProvider } from "@jgengine/ui/provider";
import { SettingsControllerProvider, type SettingsController } from "@jgengine/core/settings/settings.view";
import { game } from "../src/game.config";
import { loop } from "../src/loop";
import { stageHousehold } from "../src/game/capture";
import { householdStore } from "../src/game/session/store";
import { GameUI } from "../src/game/ui/GameUI";
import { menuFocus } from "../src/game/ui/menu";
import { drawerFocus } from "../src/game/ui/GameUI";

export const ORBIT_FIXTURES = ["title", "new", "households", "guide", "settings", "credits", "hud", "member", "furnish", "pantry", "transmission", "review", "paused", "pause-save", "pause-settings", "settings-sheet"] as const;
export type OrbitFixture = (typeof ORBIT_FIXTURES)[number];

/** Real GameUI over real Odd Orbit state, with deterministic viewport/settings inputs for native paint checks. */
export async function runeUiFixture(state: OrbitFixture, width = 1280, height = 720) {
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

function renderFixture(state: OrbitFixture, width: number, height: number) {
  const ctx = createGameContext({ definition: game.game, content: game.content, player: { userId: "orbit-fixture", isNew: true } });
  loop.onInit(ctx);
  loop.onNewPlayer(ctx);
  const menu = ["title", "new", "households", "guide", "settings", "credits"].includes(state);
  menuFocus.id = state === "title" ? null : state === "households" ? "careers" : state === "pause-save" ? "save" : state === "pause-settings" ? "settings" : menu ? state : null;
  if (!menu) {
    ctx.game.commands.run("orbit.new", { name: "The Moonwells" });
    stageHousehold(ctx, "shift");
  }
  // The staged week-long runs take seconds each; the slip and the letter only read these fields.
  if (state === "transmission") householdStore.update(ctx, (s) => ({ ...s, incident: { id: "trader", memberId: null, otherId: null, objId: null, objCatalog: null, deadline: ctx.time.now() + 20 } }));
  if (state === "review") householdStore.update(ctx, (s) => ({ ...s, charter: { ...s.charter!, review: { term: 0, met: ["Earn 400 credits", "Keep the pantry stocked"], missed: ["Answer two transmissions"], grant: 120, strike: false, outcome: "active" } } }));
  if (state === "member") householdStore.update(ctx, (s) => ({ ...s, selectedMemberId: s.order[0] ?? null }));
  if (state === "paused" || state === "pause-save" || state === "pause-settings") ctx.game.commands.run("orbit.pause", {});
  drawerFocus.id = state === "furnish" ? "build" : state === "pantry" ? "ledger" : null;
  const settings: SettingsController = {
    categories: [
      { id: "sound", label: "Sound", keybinds: [], rows: [
        { id: "master", label: "Master volume", kind: "slider", value: .8, min: 0, max: 1, step: .01, format: (v) => `${Math.round(v * 100)}%`, set: () => {} },
        { id: "mute", label: "Mute", kind: "toggle", value: false, set: () => {} },
        { id: "quality", label: "Quality", kind: "select", value: "high", options: [{ value: "low", label: "Low" }, { value: "high", label: "High" }], set: () => {} },
      ] },
      { id: "controls", label: "Controls", rows: [], keybinds: [{ action: "pauseToggle", label: "Pause time", bindingLabel: "Space", isDefault: true, rebind: () => {}, reset: () => {} }] },
    ],
    actions: [], variant: "panel", surface: false, isOpen: state === "settings-sheet", open: () => {}, close: () => {}, setOpen: () => {},
  };
  const container = new RuneNode("container");
  const tree = new Root(nativeTreeHost(() => {}), container, "fixture", false);
  tree.render(<GameProvider context={ctx}><SettingsControllerProvider controller={settings}><RuneViewport width={width} height={height}><GameUI /></RuneViewport></SettingsControllerProvider></GameProvider>);
  const surface = container.children[0];
  if (surface?.tag !== "rune-surface") throw new Error("Odd Orbit did not mount a direct native surface");
  const unused = () => { throw new Error("headless sampling must not bind slots"); };
  const sink: RuneTreeSink = { setSpec: unused, bindNumber: unused, writeNumber: unused, bindText: unused };
  const spec = nativeSpec(surface, sink, true);
  tree.unmount();
  menuFocus.id = null;
  drawerFocus.id = null;
  return spec;
}

if (import.meta.main) {
  const state = process.argv[2];
  const output = process.argv[3];
  if (state === undefined || output === undefined) throw new Error("usage: bun games/odd-orbit/proofs/runeUiFixture.tsx <state> <out.json> [width height]");
  const fixture = ORBIT_FIXTURES.find((name) => name === state);
  if (fixture === undefined) throw new Error(`Unknown Odd Orbit UI state: ${state}`);
  const spec = await runeUiFixture(fixture, Number(process.argv[4] ?? 1280), Number(process.argv[5] ?? 720));
  await writeFile(output, JSON.stringify(spec));
}
