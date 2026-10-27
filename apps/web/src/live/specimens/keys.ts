/**
 * Live demo: key bindings as data. A little room plays itself by pressing ACTIONS (open the door, fire,
 * open the inventory); which physical key that is comes from the input map. Beside it sits the engine's
 * own `KeybindingMenu` over `createRebindSession`: change a key there and the very next press uses it.
 */
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ActionCodes, ActionCodesMap } from "@jgengine/core/input/actionBindings";
import { applyBindingOverrides } from "@jgengine/core/input/bindingOverrides";
import { createRebindSession, type RebindSession } from "@jgengine/core/input/rebindSession";
import { KeybindingMenu } from "@jgengine/core/settings/keybindingMenu.view";

import { drawKeycaps, drawPill, mountCanvas2d, takeover } from "../canvas2d";
import type { Trace } from "../trace";

export interface KeysDials {
  fireRepeatMs: number;
  lockFire: boolean;
}

export interface KeysSpecimen {
  setDials(dials: KeysDials): void;
  dispose(): void;
}

const LABELS: Record<string, string> = {
  moveForward: "Forward",
  moveBack: "Back",
  moveLeft: "Left",
  moveRight: "Right",
  jump: "Jump",
  sprint: "Sprint",
  interact: "Open door",
  inventory: "Inventory",
  fire: "Fire",
  pause: "Pause",
};

function inputMap(d: KeysDials): ActionCodesMap {
  return {
    moveForward: ["KeyW"],
    moveBack: ["KeyS"],
    moveLeft: ["KeyA"],
    moveRight: ["KeyD"],
    jump: ["Space"],
    sprint: ["ShiftLeft"],
    pause: ["Escape", "KeyP"],
    interact: ["KeyE"],
    inventory: ["KeyI", "Tab"],
    fire: { hold: ["mouse0", "KeyF"], repeatMs: d.fireRepeatMs, ...(d.lockFire ? { locked: true } : {}) },
  };
}

const fold = (code: string) => (code === "ShiftLeft" || code === "ShiftRight" ? "Shift" : code);
const isCodeList = (codes: ActionCodes): codes is readonly string[] => Array.isArray(codes);

function codesOf(codes: ActionCodes): string[] {
  const list = isCodeList(codes) ? codes : [...(codes.hold ?? []), ...(codes.toggle ?? [])];
  return list.map(fold);
}

function keyLabel(code: string): string {
  if (code === "mouse0") return "LMB";
  if (code === "Escape") return "Esc";
  return code.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Arrow/, "");
}

type Step =
  | { kind: "walk"; to: { x: number; y: number }; sprint?: boolean }
  | { kind: "press"; action: string }
  | { kind: "hold"; action: string; ms: number }
  | { kind: "wait"; ms: number };

const DOOR = { x: 0.78, y: 0.12 };
const CHEST = { x: 0.16, y: 0.78 };
const DUMMY = { x: 0.86, y: 0.62 };

/** What the room does on its own, as actions. It never names a key. */
const SCRIPT: readonly Step[] = [
  { kind: "walk", to: { x: DOOR.x, y: DOOR.y + 0.16 } },
  { kind: "press", action: "interact" },
  { kind: "wait", ms: 500 },
  { kind: "walk", to: { x: 0.45, y: 0.62 } },
  { kind: "hold", action: "fire", ms: 1400 },
  { kind: "press", action: "jump" },
  { kind: "wait", ms: 400 },
  { kind: "walk", to: { x: CHEST.x + 0.12, y: CHEST.y - 0.04 }, sprint: true },
  { kind: "press", action: "inventory" },
  { kind: "wait", ms: 1100 },
  { kind: "press", action: "inventory" },
  { kind: "press", action: "pause" },
  { kind: "wait", ms: 900 },
  { kind: "press", action: "pause" },
  { kind: "walk", to: { x: DOOR.x, y: DOOR.y + 0.16 } },
  { kind: "press", action: "interact" },
  { kind: "wait", ms: 600 },
];

export function createKeysSpecimen(container: HTMLElement, trace: Trace): KeysSpecimen {
  let dials: KeysDials = { fireRepeatMs: 120, lockFire: true };
  let session: RebindSession = createRebindSession({ input: inputMap(dials), labels: LABELS });
  let map = applyBindingOverrides(inputMap(dials), session.overrides());

  /** Keys down right now, from the visitor or the autopilot. */
  const pressed = new Set<string>();
  const pilot = takeover(5000);
  const player = { x: 0.3, y: 0.55, hop: 0, faceX: 1, faceY: 0 };
  const bullets: { x: number; y: number; vx: number; vy: number }[] = [];
  let doorOpen = false, inventoryOpen = false, paused = false, lastFire = -Infinity;
  let log = "";
  let logAt = 0;
  let stepAt = 0, stepStarted = performance.now(), stepPressed: string | null = null;

  const held = (action: string) => {
    const codes = map[action];
    return codes !== undefined && codesOf(codes).some((c) => pressed.has(c));
  };
  const actionFor = (code: string) => Object.keys(map).find((a) => codesOf(map[a]!).includes(fold(code))) ?? null;
  /** The key the input map says triggers an action right now. */
  const keyFor = (action: string) => {
    const codes = map[action];
    return codes === undefined ? null : (codesOf(codes)[0] ?? null);
  };

  function onPress(code: string) {
    const action = actionFor(code);
    log = action === null ? `${keyLabel(code)}: not bound to anything` : `${keyLabel(code)} → ${LABELS[action] ?? action}`;
    logAt = performance.now();
    if (action !== null) trace.hit(action);
    if (action === "pause") { paused = !paused; return; }
    if (paused) return;
    if (action === "interact" && Math.hypot(player.x - DOOR.x, player.y - DOOR.y) < 0.3) doorOpen = !doorOpen;
    if (action === "inventory") inventoryOpen = !inventoryOpen;
    if (action === "jump" && player.hop <= 0) player.hop = 0.35;
  }

  function botDown(action: string) {
    const code = keyFor(action);
    if (code === null) return;
    pressed.add(code);
    stepPressed = code;
    onPress(code);
  }
  function botUp() {
    if (stepPressed !== null) pressed.delete(stepPressed);
    stepPressed = null;
  }
  function nextStep() {
    botUp();
    stepAt = (stepAt + 1) % SCRIPT.length;
    stepStarted = performance.now();
  }

  /** Runs the script: walking presses the move keys, the rest press one action's key. */
  function autopilot(now: number) {
    const step = SCRIPT[stepAt]!;
    const age = now - stepStarted;
    for (const a of ["moveForward", "moveBack", "moveLeft", "moveRight", "sprint"]) {
      const code = keyFor(a);
      if (code !== null) pressed.delete(code);
    }
    if (step.kind === "walk") {
      const dx = step.to.x - player.x, dy = step.to.y - player.y;
      if (Math.hypot(dx, dy) < 0.02 || age > 6000) return nextStep();
      const press = (a: string) => { const c = keyFor(a); if (c !== null) pressed.add(c); };
      if (dx > 0.01) press("moveRight");
      if (dx < -0.01) press("moveLeft");
      if (dy > 0.01) press("moveBack");
      if (dy < -0.01) press("moveForward");
      if (step.sprint === true) press("sprint");
      return;
    }
    if (step.kind === "press") {
      if (stepPressed === null && age < 50) botDown(step.action);
      if (age > 220) nextStep();
      return;
    }
    if (step.kind === "hold") {
      if (stepPressed === null && age < 50) {
        // Aim at the dummy before firing.
        const dx = DUMMY.x - player.x, dy = DUMMY.y - player.y, d = Math.hypot(dx, dy) || 1;
        player.faceX = dx / d; player.faceY = dy / d;
        botDown(step.action);
      }
      if (age > step.ms) nextStep();
      return;
    }
    if (age > step.ms) nextStep();
  }

  const root = document.createElement("div");
  root.style.cssText = "position:absolute;inset:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(200px,40%);";
  const stage = document.createElement("div");
  stage.style.cssText = "position:relative;min-width:0;";
  const panel = document.createElement("div");
  panel.style.cssText = "overflow:auto;border-left:1px solid rgba(255,255,255,0.08);background:#0b1016;";
  root.append(stage, panel);
  container.appendChild(root);

  const view = mountCanvas2d(stage, ({ ctx, width, height, dt }) => {
    const now = performance.now();
    if (!pilot.byVisitor()) autopilot(now);
    if (!paused) {
      let mx = (held("moveRight") ? 1 : 0) - (held("moveLeft") ? 1 : 0);
      let my = (held("moveBack") ? 1 : 0) - (held("moveForward") ? 1 : 0);
      const len = Math.hypot(mx, my);
      if (len > 0) {
        mx /= len; my /= len;
        player.faceX = mx; player.faceY = my;
        trace.hit(my < 0 ? "moveForward" : my > 0 ? "moveBack" : mx < 0 ? "moveLeft" : "moveRight");
      }
      const sprint = held("sprint");
      if (sprint && len > 0) trace.hit("sprint");
      const speed = 0.32 * (sprint ? 1.8 : 1) * dt;
      // The wall has a gap only where the door is, and only while it is open.
      const nx = Math.min(0.97, Math.max(0.03, player.x + mx * speed * (height / width)));
      let ny = Math.min(0.95, Math.max(0.05, player.y + my * speed));
      if (ny < 0.16 && !(doorOpen && Math.abs(nx - DOOR.x) < 0.06)) ny = Math.max(ny, 0.16);
      player.x = nx; player.y = ny;
      player.hop = Math.max(0, player.hop - dt);
      if (held("fire") && now - lastFire >= dials.fireRepeatMs) {
        bullets.push({ x: player.x, y: player.y, vx: player.faceX * 1.3 * (height / width), vy: player.faceY * 1.3 });
        lastFire = now;
        trace.hit("fire");
      }
      for (const b of bullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
      while (bullets.length > 0 && (bullets[0]!.x < 0 || bullets[0]!.x > 1 || bullets[0]!.y < 0 || bullets[0]!.y > 1)) bullets.shift();
      if (bullets.length > 80) bullets.splice(0, bullets.length - 80);
    }
    if (paused) trace.hit("pause");

    ctx.fillStyle = "#141b24";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    for (let gx = 0; gx < width; gx += 24) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, height); ctx.stroke(); }
    for (let gy = 0; gy < height; gy += 24) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(width, gy); ctx.stroke(); }
    // Top wall with the door.
    ctx.fillStyle = "#2a3542";
    ctx.fillRect(0, 0.14 * height - 5, width, 10);
    ctx.fillStyle = doorOpen ? "#141b24" : "#8a5a30";
    ctx.fillRect(DOOR.x * width - 0.06 * width, 0.14 * height - 5, 0.12 * width, 10);
    if (doorOpen) {
      ctx.fillStyle = "#8a5a30";
      ctx.save(); ctx.translate(DOOR.x * width - 0.06 * width, 0.14 * height); ctx.rotate(-1.2); ctx.fillRect(0, -3, 0.12 * width, 6); ctx.restore();
    }
    ctx.fillStyle = "#6b4a2b";
    ctx.fillRect(CHEST.x * width - 14, CHEST.y * height - 9, 28, 18);
    ctx.fillStyle = "#d8b45a";
    ctx.fillRect(CHEST.x * width - 3, CHEST.y * height - 3, 6, 6);
    ctx.fillStyle = "#d8c49a";
    ctx.beginPath(); ctx.arc(DUMMY.x * width, DUMMY.y * height, 11, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#7a2e1a"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(DUMMY.x * width, DUMMY.y * height, 6, 0, Math.PI * 2); ctx.stroke();

    ctx.fillStyle = "#ffd166";
    for (const b of bullets) { ctx.beginPath(); ctx.arc(b.x * width, b.y * height, 2.5, 0, Math.PI * 2); ctx.fill(); }
    const lift = Math.sin((player.hop / 0.35) * Math.PI) * 14;
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath(); ctx.ellipse(player.x * width, player.y * height + 9, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = held("sprint") ? "#ff7a1a" : "#f2f4f7";
    ctx.beginPath(); ctx.arc(player.x * width, player.y * height - lift, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ff7a1a"; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(player.x * width, player.y * height - lift);
    ctx.lineTo(player.x * width + player.faceX * 15, player.y * height - lift + player.faceY * 15);
    ctx.stroke();

    if (inventoryOpen) {
      ctx.fillStyle = "rgba(14,20,28,0.94)";
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.beginPath(); ctx.roundRect(width / 2 - 80, height / 2 - 40, 160, 80, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#e6eaf0";
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.fillText("Inventory", width / 2 - 68, height / 2 - 18);
      ctx.font = "11px ui-monospace, monospace";
      ctx.fillStyle = "#b4bfcc";
      ctx.fillText("3 arrows · 1 key · 2 coins", width / 2 - 68, height / 2 + 4);
    }
    if (paused) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#fff";
      ctx.font = "600 15px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Paused", width / 2, height / 2);
      ctx.textAlign = "start";
    }

    drawPill(ctx, pilot.byVisitor() ? "You're playing" : "Autopilot · it presses actions, not keys", 10, height - 30, pilot.byVisitor() ? "live" : "accent");
    const down = [...pressed].map((c) => ({ label: keyLabel(c), on: true }));
    if (down.length > 0) drawKeycaps(ctx, down, 10, 0.14 * height + 12);
    if (now - logAt < 1600 && log !== "") {
      ctx.font = "600 12px ui-monospace, monospace";
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillText(log, 10, 0.14 * height + 56);
    }
  }, { label: "A room that plays itself through actions. Click it and use the keys in the controls menu." });

  let menu: Root | null = createRoot(panel);
  function renderMenu() {
    menu?.render(
      createElement(KeybindingMenu, {
        session,
        title: "Controls",
        resetAllLabel: "Reset all",
        theme: { bg: "transparent", border: "none", radius: "0", accent: "#ff7a1a", fontFamily: "ui-sans-serif, system-ui, sans-serif" },
        style: { width: "100%", padding: "10px 10px", boxShadow: "none", fontSize: 12, boxSizing: "border-box" },
      }),
    );
  }
  let unsubscribe = () => {};
  function watch() {
    unsubscribe();
    unsubscribe = session.subscribe(() => {
      map = applyBindingOverrides(inputMap(dials), session.overrides());
    });
    renderMenu();
  }
  watch();

  const onKeyDown = (e: KeyboardEvent) => {
    if (session.capturingActionId() !== null || e.target !== view.canvas) return;
    e.preventDefault();
    pilot.touch();
    botUp();
    if (!e.repeat) onPress(e.code);
    pressed.add(fold(e.code));
  };
  const onKeyUp = (e: KeyboardEvent) => pressed.delete(fold(e.code));
  const onBlur = () => pressed.clear();
  const onPointerDown = (e: PointerEvent) => {
    view.canvas.focus();
    if (e.button !== 0) return;
    pilot.touch();
    pressed.add("mouse0");
    onPress("mouse0");
  };
  const onPointerUp = () => pressed.delete("mouse0");
  root.addEventListener("keydown", onKeyDown);
  root.addEventListener("keyup", onKeyUp);
  view.canvas.addEventListener("blur", onBlur);
  view.canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);

  return {
    setDials(next) {
      const changed = next.fireRepeatMs !== dials.fireRepeatMs || next.lockFire !== dials.lockFire;
      dials = next;
      if (!changed) return;
      session = createRebindSession({ input: inputMap(dials), labels: LABELS, overrides: session.overrides() });
      map = applyBindingOverrides(inputMap(dials), session.overrides());
      watch();
    },
    dispose() {
      unsubscribe();
      root.removeEventListener("keydown", onKeyDown);
      root.removeEventListener("keyup", onKeyUp);
      view.canvas.removeEventListener("blur", onBlur);
      view.canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      const m = menu;
      menu = null;
      // Unmount after React finishes the current render.
      queueMicrotask(() => m?.unmount());
      view.dispose();
      root.remove();
    },
  };
}
