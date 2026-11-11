/** @jsxImportSource @jgengine/core/ui/jsx */
/// <reference types="bun" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { Root } from "@jgengine/core/ui/jsx/reconciler";
import { RuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { RuneNode, nativeEnabled, nativeLabel, nativeTreeHost } from "@jgengine/core/ui/rune/nativeTree";
import { GameProvider } from "@jgengine/ui/provider";
import { SettingsControllerProvider, type SettingsController } from "@jgengine/core/settings/settings.view";
import { game } from "../../game.config";
import { loop } from "../../loop";
import { content } from "../content";
import { phoneStore } from "../cityRuntime";
import { startedStore } from "../commands";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import { sessionStore } from "../session";
import { GameUI } from "./GameUI";
import { focusHarborVerb } from "./menuFocus";

/**
 * The ui-tour as a headless play test: the real GameUI on the native Rune tree, driven by pressing
 * actions found by label, checked against game stores rather than text.
 */

const settings = {
  categories: [
    { id: "sound", label: "Sound", keybinds: [], rows: [
      { id: "master", label: "Master volume", kind: "slider", value: 80, min: 0, max: 100, step: 1, set: () => {} },
      { id: "radio", label: "Car radio", kind: "toggle", value: true, set: () => {} },
    ] },
    { id: "keys", label: "Controls", rows: [], keybinds: [
      { action: "phone", label: "Phone", bindingLabel: "T", isDefault: true, rebind: () => {}, reset: () => {} },
    ] },
  ],
  actions: [], variant: "panel", surface: false, isOpen: false, open: () => {}, close: () => {}, setOpen: () => {},
} as unknown as SettingsController; // type-escape: a deterministic stand-in for the shell's controller, covering the rows the phone draws

const memory = new Map<string, string>();
const restore: (() => void)[] = [];
function stubGlobal(name: string, value: unknown): void {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  if (name === "window" && original !== undefined) return;
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  restore.push(() => { if (original === undefined) Reflect.deleteProperty(globalThis, name); else Object.defineProperty(globalThis, name, original); });
}
beforeEach(() => {
  memory.clear();
  stubGlobal("localStorage", { getItem: (k: string) => memory.get(k) ?? null, removeItem: (k: string) => { memory.delete(k); }, setItem: (k: string, v: string) => { memory.set(k, v); } });
  stubGlobal("window", new EventTarget());
});
afterEach(() => { for (const undo of restore.splice(0).reverse()) undo(); focusHarborVerb(null); });

const settle = async () => { for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setTimeout(resolve, 0)); };

function mount(width: number, height: number) {
  const ctx: GameContext = createGameContext({ definition: game.game, content, player: { userId: "courier", isNew: true } });
  loop.onInit(ctx);
  loop.onNewPlayer(ctx);
  focusHarborVerb(null);
  ctx.game.commands.run("menu.title", {});
  const container = new RuneNode("container");
  const tree = new Root(nativeTreeHost(() => {}), container, "play", true);
  tree.render(<GameProvider context={ctx}><SettingsControllerProvider controller={settings}><RuneViewport width={width} height={height}><GameUI /></RuneViewport></SettingsControllerProvider></GameProvider>);
  const actions = () => {
    const out: RuneNode[] = [];
    const walk = (node: RuneNode) => {
      if (node.props.hidden === true) return;
      if (node.props.onPress !== undefined && nativeEnabled(node)) out.push(node);
      node.children.forEach(walk);
    };
    walk(container);
    return out;
  };
  const find = (label: string) => actions().find((node) => nativeLabel(node).trim() === label);
  const press = async (label: string) => {
    const node = find(label);
    if (node === undefined) throw new Error(`No action "${label}"; have: ${actions().map(nativeLabel).join(" | ")}`);
    node.props.onPress?.();
    await settle();
  };
  const key = async (code: string) => {
    // A key typed on the page, not in a text field.
    class PageKey extends Event {
      readonly code = code;
      readonly repeat = false;
      override get target() { return { closest: () => null } as unknown as EventTarget; } // type-escape: the page element a real key lands on
    }
    window.dispatchEvent(new PageKey("keydown"));
    await settle();
  };
  return { ctx, tree, find, press, key,
    started: () => startedStore.read(ctx) === true,
    phone: () => phoneStore.read(ctx) === true,
    paused: () => sessionStore.read(ctx).paused };
}

async function intoTheRun(play: ReturnType<typeof mount>) {
  await play.press("Hit the street");
  await play.press("Take the run");
  for (let i = 0; i < 20 && !play.started(); i += 1) await settle();
  expect(play.started()).toBe(true);
}

describe("Harbor Heat play test", () => {
  test("desktop 1280x720 walks the title, the run, the phone and the pause phone", async () => {
    const play = mount(1280, 720);
    expect(play.started()).toBe(false);
    // Title: the burner's settings pages, then back; credits, then back.
    await play.press("Settings");
    await play.press("Next page");
    expect(play.find("Rebind Phone")).toBeDefined();
    // On a wide screen Back leaves the sign's focus on Settings; Credits swaps the object beside it.
    await play.press("Back");
    await play.press("Credits");
    expect(play.find("Next page")).toBeUndefined();
    expect(play.find("Hit the street")).toBeDefined();
    await intoTheRun(play);
    // HUD keys are on screen and the title is gone.
    expect(play.find("Phone")).toBeDefined();
    expect(play.find("Pause")).toBeDefined();
    expect(play.find("Hit the street")).toBeUndefined();
    // The city phone opens from its HUD key and Put away closes it.
    await play.press("Phone");
    expect(play.phone()).toBe(true);
    const putAway = play.find("Put away · T") ?? play.find("Put away");
    expect(putAway).toBeDefined();
    putAway?.props.onPress?.();
    await settle();
    expect(play.phone()).toBe(false);
    // Pause from the HUD, into Settings & controls, back, then resume.
    await play.press("Pause");
    expect(play.paused()).toBe(true);
    expect(gamePhase(play.ctx)).toBe("paused");
    await play.press("Settings & controls");
    expect(play.find("Next page")).toBeDefined();
    await play.press("Back");
    await play.press("Save progress");
    expect(play.paused()).toBe(true);
    expect(memory.size).toBeGreaterThan(0);
    await play.press("Back to the coast");
    expect(play.paused()).toBe(false);
    expect(gamePhase(play.ctx)).toBe("playing");
    // P toggles the pause both ways.
    await play.key("KeyP");
    expect(play.paused()).toBe(true);
    await play.press("Resume");
    expect(play.paused()).toBe(false);
    play.tree.unmount();
  }, 60_000);

  test("phone 390x844 reaches the HUD keys and the pause phone", async () => {
    const play = mount(390, 844);
    await intoTheRun(play);
    await play.press("Phone");
    expect(play.phone()).toBe(true);
    (play.find("Put away · T") ?? play.find("Put away"))?.props.onPress?.();
    await settle();
    expect(play.phone()).toBe(false);
    await play.press("Pause");
    expect(play.paused()).toBe(true);
    await play.press("Back to the coast");
    expect(play.paused()).toBe(false);
    play.tree.unmount();
  }, 60_000);
});
