/** @jsxImportSource @jgengine/core/ui/jsx */
import { writeFile } from "node:fs/promises";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { createPlaySession } from "@jgengine/core/play/playSession.draw";
import { flushSync, Root } from "@jgengine/core/ui/jsx/reconciler";
import { RuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { RuneNode, nativeSpec, nativeTreeHost, type RuneTreeSink } from "@jgengine/core/ui/rune/nativeTree";
import { GameProvider } from "@jgengine/ui/provider";
import { SettingsControllerProvider, type SettingsController } from "@jgengine/core/settings/settings.view";
import { game } from "../src/game.config";
import { GameUI } from "../src/game/ui/GameUI";
import { menuFocus } from "../src/game/ui/Menu";
import { blackMarketOpenStore, discoveredStationsStore, lastPickupStore, skillsOpenStore, speechStore, travelOpenStore, vendorOpenStore } from "../src/game/stores";
import { vaultOpenStore } from "../src/game/items/vault";
import { TRAVEL_STATIONS } from "../src/game/world/sites";
import { npcDialogStore } from "../src/game/quests/givers";

export const STATES = ["title", "credits", "hud", "paused", "settings", "talents", "vendor", "npc", "overdrive", "overdrive-run", "dead-air", "downed", "vault", "travel", "market"] as const;
export type NativeFixture = (typeof STATES)[number];

/** The real GameUI over a headless play of the real game, staged by its own capture commands. */
export async function runeUiFixture(state: NativeFixture, width = 1280, height = 720) {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => memory.get(key) ?? null,
    removeItem: (key: string) => { memory.delete(key); },
    setItem: (key: string, value: string) => { memory.set(key, value); },
    key: (index: number) => [...memory.keys()][index] ?? null,
    get length() { return memory.size; },
  } });
  // Dev staging reads the page's `?stage=`; headless there is no page, so it reads an empty query.
  // Another test file in the same worker may have left a partial stand-in, so check for what is read.
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const hadWindow = typeof (globalThis as { window?: { location?: { search?: unknown } } }).window?.location?.search === "string";
  if (!hadWindow) Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { search: "" } } });
  try { return await renderFixture(state, width, height); }
  finally {
    if (!hadWindow) {
      if (originalWindow === undefined) Reflect.deleteProperty(globalThis, "window");
      else Object.defineProperty(globalThis, "window", originalWindow);
    }
    if (originalStorage === undefined) Reflect.deleteProperty(globalThis, "localStorage");
    else Object.defineProperty(globalThis, "localStorage", originalStorage);
  }
}

async function renderFixture(state: NativeFixture, width: number, height: number) {
  const session = createPlaySession(game);
  const { ctx } = session;
  for (let i = 0; i < 30; i++) session.tick([]);
  const run = (name: string, input: unknown = {}) => {
    const result = session.command(name, input);
    if (result.status !== "applied") throw new Error(`fixture: ${name} ${result.status}${name.endsWith(".capture") ? " (capture commands are dev-only: run with DEV=1)" : ""}`);
  };
  if (state === "title" || state === "credits") setGamePhase(ctx, "menu");
  else {
    run("character.pick", { characterId: "gunk" });
    for (let i = 0; i < 30; i++) session.tick([]);
    if (state === "overdrive") run("rift.capture", { tier: 8, mode: "terminal" });
    if (state === "overdrive-run") run("rift.capture", { tier: 8 });
    if (state === "dead-air") run("relay.capture", { mode: "upload" });
    if (state === "downed") run("reserve.capture");
    if (state === "hud" || state === "paused" || state === "settings") {
      run("kit.capture", { family: "rifle" });
      const gun = ctx.player.inventory.state("hotbar").slots[0]?.itemId;
      if (gun !== undefined) lastPickupStore.write(ctx, { gunId: gun, atMs: ctx.time.now() * 1000 });
      speechStore.write(ctx, { speaker: "B0-LT", line: "Copper ring's north of the wreck. Bring the carrier back and we eat tonight.", atMs: ctx.time.now() * 1000 });
    }
    if (state === "talents") skillsOpenStore.write(ctx, true);
    if (state === "vault") { run("kit.capture", { family: "rifle" }); vaultOpenStore.write(ctx, true); }
    if (state === "travel") { discoveredStationsStore.write(ctx, TRAVEL_STATIONS.slice(0, 2).map(s => s.zoneId)); travelOpenStore.write(ctx, true); }
    if (state === "market") { ctx.game.economy.grant(ctx.player.userId, "cores", 6); blackMarketOpenStore.write(ctx, true); }
    if (state === "vendor") vendorOpenStore.write(ctx, "rigg");
    for (let i = 0; i < 20; i++) session.tick([]);
    setGamePhase(ctx, "playing");
    // After the ticks: the givers close a dialog the reclaimer is not standing beside.
    if (state === "npc") { const npc = Object.keys((await import("../src/game/quests/catalog")).NPCS)[0]!; npcDialogStore.write(ctx, { npc, line: "You look like you can hold a rifle.", questId: "q_target_practice" } as never); } // type-escape: the dialog record's npc id union is the catalog's keys
  }
  menuFocus.screen = state === "credits" ? "credits" : "main";
  const settings: SettingsController = {
    categories: [{ id: "sound", label: "Sound", keybinds: [
      { action: "reload", label: "Reload", bindingLabel: "R", isDefault: true, rebind: () => {}, reset: () => {} },
      { action: "grenade", label: "Grenade", bindingLabel: "F", isDefault: false, rebind: () => {}, reset: () => {} },
    ], rows: [
      { id: "master", label: "Master volume", kind: "slider", value: 80, min: 0, max: 100, step: 1, format: v => `${Math.round(v)}%`, set: () => {} },
      { id: "mute", label: "Mute", kind: "toggle", value: false, set: () => {} },
      { id: "quality", label: "Quality", kind: "select", value: "high", options: [{ value: "low", label: "Low" }, { value: "high", label: "High" }], set: () => {} },
    ] }, { id: "controls", label: "Controls", keybinds: [], rows: [] }], actions: [], variant: "panel", surface: false, isOpen: false, open: () => {}, close: () => {}, setOpen: () => {},
  };
  const container = new RuneNode("container");
  const tree = new Root(nativeTreeHost(() => {}), container, "fixture", false);
  tree.render(<GameProvider context={ctx}><SettingsControllerProvider controller={settings}><RuneViewport width={width} height={height}><GameUI /></RuneViewport></SettingsControllerProvider></GameProvider>);
  const press = (label: string) => {
    const find = (node: RuneNode): RuneNode | undefined => node.props.label === label && node.props.onPress !== undefined ? node : node.children.map(find).find(n => n !== undefined);
    const node = find(container);
    if (node === undefined) throw new Error(`fixture: no control labelled ${label}`);
    flushSync(() => node.props.onPress?.());
    tree.flush();
  };
  if (state === "paused" || state === "settings") press("Pause (Esc)");
  if (state === "settings") press("Settings & controls");
  const surface = container.children[0];
  if (surface?.tag !== "rune-surface") throw new Error("Scrap Signal did not mount a direct native surface");
  const unused = () => { throw new Error("headless sampling must not bind slots"); };
  const sink: RuneTreeSink = { setSpec: unused, bindNumber: unused, writeNumber: unused, bindText: unused };
  const spec = nativeSpec(surface, sink, true);
  tree.unmount();
  menuFocus.screen = "main";
  return spec;
}

if (import.meta.main) {
  const state = process.argv[2], output = process.argv[3];
  if (state === undefined || output === undefined) throw new Error("usage: DEV=1 bun games/scrap-signal/proofs/runeUiFixture.tsx <state> <out.json> [width height]");
  if (!(STATES as readonly string[]).includes(state)) throw new Error(`Unknown Scrap Signal UI state: ${state}`);
  const spec = await runeUiFixture(state as NativeFixture, Number(process.argv[4] ?? 1280), Number(process.argv[5] ?? 720)); // type-escape: state was checked against STATES above
  await writeFile(output, JSON.stringify(spec));
  process.exit(0);
}
