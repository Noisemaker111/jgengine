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
import { content } from "../src/game/content";
import { GameUI } from "../src/game/ui/GameUI";
import { focusHarborVerb } from "../src/game/ui/menuFocus";

export const HARBOR_FIXTURES = ["title", "new", "bays", "settings", "credits", "hud", "drive", "phone", "pause", "pause-settings", "shop", "garage", "dialogue", "result", "result-missed"] as const;
export type HarborFixture = (typeof HARBOR_FIXTURES)[number];

const TICK = 1 / 60;

/** Real GameUI and game state, with deterministic viewport and settings rows, sampled as a native spec. */
export async function runeUiFixture(state: HarborFixture, width = 1280, height = 720) {
  const memory = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => memory.get(key) ?? null,
    removeItem: (key: string) => { memory.delete(key); },
    setItem: (key: string, value: string) => { memory.set(key, value); },
  } });
  try { return await renderFixture(state, width, height); }
  finally {
    if (original === undefined) Reflect.deleteProperty(globalThis, "localStorage");
    else Object.defineProperty(globalThis, "localStorage", original);
  }
}

async function renderFixture(state: HarborFixture, width: number, height: number) {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "courier", isNew: true } });
  loop.onInit(ctx);
  loop.onNewPlayer(ctx);
  const run = (name: string, input: unknown = {}) => ctx.game.commands.run(name, input);
  const tick = (n = 30) => { for (let i = 0; i < n; i += 1) loop.onTick(ctx, TICK); };
  const title = state === "title" || state === "new" || state === "bays" || state === "settings" || state === "credits";
  if (title) {
    run("menu.title");
    // menu.title clears the focus request, so ask for the title object after it.
    focusHarborVerb(state === "new" ? "new" : state === "bays" ? "keeps" : state === "settings" ? "settings" : "credits");
  } else {
    focusHarborVerb(null);
    run("game.start");
    ctx.camera.setCinematic(null);
    ctx.game.economy.grant(ctx.player.userId, "cash", 1420);
    ctx.scene.entity.stats.set(ctx.player.userId, "health", { current: 72 });
    ctx.scene.entity.stats.set(ctx.player.userId, "armor", { current: 40 });
    // Staging commands register only in a dev build: run the fixture with DEV=1.
    if (state === "hud") run("chase.stage", { mode: "chase" });
    if (state === "drive") { run("drive.stage", { vehicle: "car_sport" }); run("radio"); }
    tick();
    if (state === "phone") run("phone");
    if (state === "pause" || state === "pause-settings") run("session.pause", { paused: true });
    if (state === "shop") run("shop.open");
    if (state === "garage") run("garage.open");
    if (state === "dialogue") run("dialogue.open", { id: "person:marco" });
    if (state === "result" || state === "result-missed") run("result.stage", { won: state === "result" });
  }
  const settings: SettingsController = {
    categories: [
      { id: "sound", label: "Sound", keybinds: [], rows: [
        { id: "master", label: "Master volume", kind: "slider", value: 80, min: 0, max: 100, step: 1, set: () => {} },
        { id: "radio", label: "Car radio", kind: "toggle", value: true, set: () => {} },
        { id: "quality", label: "Graphics", kind: "select", value: "high", options: [{ value: "low", label: "Low" }, { value: "high", label: "High" }], set: () => {} },
      ] },
      { id: "keys", label: "Controls", rows: [], keybinds: [
        { action: "interact", label: "Interact", bindingLabel: "E", isDefault: true, rebind: () => {}, reset: () => {} },
        { action: "phone", label: "Phone", bindingLabel: "T", isDefault: false, rebind: () => {}, reset: () => {} },
      ] },
    ],
    actions: [], variant: "panel", surface: false, isOpen: false, open: () => {}, close: () => {}, setOpen: () => {},
  } as unknown as SettingsController; // type-escape: a deterministic stand-in for the shell's controller, covering the row kinds the phone draws
  const container = new RuneNode("container");
  const tree = new Root(nativeTreeHost(() => {}), container, "fixture", false);
  tree.render(<GameProvider context={ctx}><SettingsControllerProvider controller={settings}><RuneViewport width={width} height={height}><GameUI /></RuneViewport></SettingsControllerProvider></GameProvider>);
  if (state === "pause-settings") {
    // The pause phone's third line opens its Settings app, as a press would.
    const press = (node: RuneNode): boolean => {
      if (node.props.label === "Settings & controls" && node.props.onPress !== undefined) { node.props.onPress(); return true; }
      return node.children.some(press);
    };
    if (!press(container)) throw new Error("pause phone has no Settings line");
    tree.render(<GameProvider context={ctx}><SettingsControllerProvider controller={settings}><RuneViewport width={width} height={height}><GameUI /></RuneViewport></SettingsControllerProvider></GameProvider>);
  }
  const surface = container.children[0];
  if (surface?.tag !== "rune-surface") throw new Error("Harbor Heat did not mount a direct native surface");
  const unused = () => { throw new Error("headless sampling must not bind slots"); };
  const sink: RuneTreeSink = { setSpec: unused, bindNumber: unused, writeNumber: unused, bindText: unused };
  const spec = nativeSpec(surface, sink, true);
  tree.unmount();
  focusHarborVerb(null);
  return spec;
}

if (import.meta.main) {
  const state = process.argv[2];
  const output = process.argv[3];
  if (state === undefined || output === undefined) throw new Error("usage: bun games/harbor-heat/proofs/runeUiFixture.tsx <state> <out.json> [width height]");
  const known: readonly string[] = HARBOR_FIXTURES;
  if (!known.includes(state)) throw new Error(`Unknown Harbor Heat UI state: ${state}`);
  const spec = await runeUiFixture(state as HarborFixture, Number(process.argv[4] ?? 1280), Number(process.argv[5] ?? 720)); // type-escape: state was checked against the fixture vocabulary above
  await writeFile(output, JSON.stringify(spec));
  // A pressed menu leaves its click generator and game timers armed; the spec is written, so stop here.
  process.exit(0);
}
