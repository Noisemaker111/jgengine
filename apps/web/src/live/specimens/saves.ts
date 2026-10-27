/**
 * Live demo: the engine's save store. A runner climbs levels on its own; every autosave flies from the
 * game into the storage it is pointed at, this browser's localStorage or a cloud backend, and every
 * Continue flies back. The cloud here is a pretend server inside this page (a `remoteSaveBackend` with a
 * delay), standing in for `createConvexSaveBackend`.
 */
import { createSaveStore, localSaveBackend, remoteSaveBackend, type SaveBackend, type SaveStore } from "@jgengine/core/save/saveStore";

import { drawPill, mountCanvas2d, takeover } from "../canvas2d";
import type { Trace } from "../trace";

export interface SavesDials {
  autosaveSeconds: number;
  cloud: boolean;
}

export interface SavesSpecimen {
  setDials(dials: SavesDials): void;
  dispose(): void;
}

interface RunSave {
  level: number;
  coins: number;
}

interface Packet {
  from: "game" | "store";
  label: string;
  started: number;
  ms: number;
}

const INITIAL: RunSave = { level: 1, coins: 0 };
const KEY = "jgengine-site-runner";
const CLOUD_DELAY_MS = 450;

/** A pretend server that lives in this page, slow like a network. */
const cloudRows = new Map<string, string>();
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const pretendCloud: SaveBackend = remoteSaveBackend({
  async read(key) { await wait(CLOUD_DELAY_MS); return cloudRows.get(key) ?? null; },
  async write(key, value) { await wait(CLOUD_DELAY_MS); cloudRows.set(key, value); },
  async remove(key) { await wait(CLOUD_DELAY_MS); cloudRows.delete(key); },
});

export function createSavesSpecimen(container: HTMLElement, trace: Trace): SavesSpecimen {
  let dials: SavesDials = { autosaveSeconds: 5, cloud: false };
  let mode: "playing" | "title" = "playing";
  let modeSince = performance.now();
  const packets: Packet[] = [];
  const pilot = takeover(8000);
  let savedPreview: { value: RunSave; at: number } | null = null;
  let runX = 0;
  let progress = 0;

  const makeStore = (): SaveStore<RunSave> =>
    createSaveStore<RunSave>({
      backend: dials.cloud ? pretendCloud : localSaveBackend(),
      key: KEY,
      initial: INITIAL,
      version: 1,
      autosave: { debounceMs: 300, maxWaitMs: dials.autosaveSeconds * 1000 },
    });
  let store = makeStore();
  let unsubscribe = () => {};
  let lastStatus = store.status();
  const watch = () => {
    unsubscribe();
    unsubscribe = store.subscribe(() => {
      const status = store.status();
      if (status === "saving" && lastStatus !== "saving") {
        trace.hit("save");
        const v = store.value();
        packets.push({ from: "game", label: `level ${v.level}`, started: performance.now(), ms: dials.cloud ? CLOUD_DELAY_MS : 320 });
      }
      if (status === "saved" && lastStatus === "saving") savedPreview = { value: store.value(), at: performance.now() };
      lastStatus = status;
    });
  };
  watch();
  void store.peek().then((saved) => {
    if (saved !== null) savedPreview = { value: saved.value, at: performance.now() - (Date.now() - saved.savedAt) };
  });

  function quit() {
    void store.save();
    mode = "title";
    modeSince = performance.now();
    renderButtons();
  }
  function continueGame() {
    trace.hit("load");
    packets.push({ from: "store", label: "load", started: performance.now(), ms: dials.cloud ? CLOUD_DELAY_MS : 320 });
    void store.load().then(() => {
      trace.hit("load");
      mode = "playing";
      modeSince = performance.now();
      renderButtons();
    });
  }
  function newGame() {
    void store.clear().then(() => {
      savedPreview = null;
      mode = "playing";
      modeSince = performance.now();
      renderButtons();
    });
  }

  const root = document.createElement("div");
  root.style.cssText = "position:absolute;inset:0;";
  container.appendChild(root);

  const view = mountCanvas2d(root, ({ ctx, width, height, dt }) => {
    const now = performance.now();
    const gameW = width * 0.62;
    // The autopilot quits after a while, then presses Continue, so a load is seen too.
    if (!pilot.byVisitor()) {
      if (mode === "playing" && now - modeSince > 13000) quit();
      else if (mode === "title" && now - modeSince > 2200) continueGame();
    }
    if (mode === "playing") {
      runX += dt * 120;
      progress += dt / 2.2;
      if (progress >= 1) {
        progress = 0;
        store.patch((v) => ({ level: v.level + 1, coins: v.coins + 7 }));
        trace.hit("play");
      }
    }

    ctx.fillStyle = "#101722";
    ctx.fillRect(0, 0, width, height);

    // Game side: a runner on a scrolling strip.
    const floor = height * 0.68;
    ctx.fillStyle = "#18222f";
    ctx.fillRect(0, 0, gameW, height);
    ctx.fillStyle = "#24364a";
    ctx.fillRect(0, floor, gameW, height - floor);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    for (let i = -1; i < 12; i++) {
      const x = ((i * 70 - runX) % (gameW + 70) + gameW + 70) % (gameW + 70) - 35;
      ctx.fillRect(x, floor + 10, 34, 4);
    }
    const v = store.value();
    if (mode === "playing") {
      ctx.fillStyle = "#ffd166";
      for (let i = 0; i < 4; i++) {
        const x = gameW - ((runX * 1.3 + i * 90) % (gameW * 0.7));
        ctx.beginPath(); ctx.arc(x, floor - 30 - (i % 2) * 18, 5, 0, Math.PI * 2); ctx.fill();
      }
    }
    const bob = mode === "playing" ? Math.abs(Math.sin(now / 160)) * 10 : 0;
    ctx.fillStyle = "#f2f4f7";
    ctx.beginPath(); ctx.arc(gameW * 0.28, floor - 12 - bob, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ff7a1a";
    ctx.fillRect(gameW * 0.28 - 12, floor - 26 - bob, 24, 5);

    ctx.font = "600 22px system-ui, sans-serif";
    ctx.fillStyle = "#fff";
    ctx.fillText(`Level ${v.level}`, 14, 60);
    ctx.font = "12px ui-monospace, monospace";
    ctx.fillStyle = "#b4bfcc";
    ctx.fillText(`${v.coins} coins`, 14, 80);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(14, 90, gameW - 28, 4);
    ctx.fillStyle = "#4ade80";
    ctx.fillRect(14, 90, (gameW - 28) * progress, 4);
    drawPill(ctx, pilot.byVisitor() ? "Your turn: quit and continue below" : "Autopilot · it quits and continues on its own", 12, 12, pilot.byVisitor() ? "live" : "accent");

    if (mode === "title") {
      ctx.fillStyle = "rgba(6,10,16,0.82)";
      ctx.fillRect(0, 0, gameW, height);
      ctx.fillStyle = "#fff";
      ctx.font = "600 18px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Title screen", gameW / 2, height * 0.38);
      ctx.textAlign = "start";
    }

    // Storage side: where the save lives.
    const sx = gameW + 14, sw = width - gameW - 28;
    const box = (y: number, h: number, title: string, sub: string, active: boolean, icon: "folder" | "cloud") => {
      ctx.globalAlpha = active ? 1 : 0.35;
      ctx.strokeStyle = active ? "#ff7a1a" : "rgba(255,255,255,0.2)";
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      ctx.lineWidth = active ? 2 : 1;
      ctx.beginPath(); ctx.roundRect(sx, y, sw, h, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = active ? "#ffb27a" : "#8b95a3";
      if (icon === "folder") {
        ctx.fillRect(sx + 12, y + 14, 12, 4);
        ctx.fillRect(sx + 12, y + 17, 24, 15);
      } else {
        ctx.beginPath();
        ctx.arc(sx + 20, y + 26, 7, 0, Math.PI * 2); ctx.arc(sx + 29, y + 22, 9, 0, Math.PI * 2); ctx.arc(sx + 37, y + 27, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#e6eaf0";
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.fillText(title, sx + 46, y + 22);
      ctx.font = "10.5px ui-monospace, monospace";
      ctx.fillStyle = "#8b95a3";
      ctx.fillText(sub, sx + 46, y + 37);
      if (active && savedPreview !== null) {
        const ago = (now - savedPreview.at) / 1000;
        ctx.fillStyle = "#c9d1db";
        ctx.fillText(`level ${savedPreview.value.level} · ${savedPreview.value.coins} coins`, sx + 12, y + h - 26);
        ctx.fillStyle = "#86efac";
        ctx.fillText(store.status() === "saving" ? "saving…" : `saved ${ago.toFixed(1)} s ago`, sx + 12, y + h - 11);
      }
      ctx.globalAlpha = 1;
    };
    const boxH = (height - 42) / 2;
    const localY = 14, cloudY = 28 + boxH;
    box(localY, boxH, "This browser", "localStorage", !dials.cloud, "folder");
    box(cloudY, boxH, "Cloud", "a server you run", dials.cloud, "cloud");

    // Save files in flight.
    const target = { x: sx + sw / 2, y: (dials.cloud ? cloudY : localY) + boxH / 2 };
    const game = { x: gameW * 0.28, y: floor - 30 };
    for (let i = packets.length - 1; i >= 0; i--) {
      const p = packets[i];
      if (p === undefined) continue;
      const t = (now - p.started) / p.ms;
      if (t >= 1) { packets.splice(i, 1); continue; }
      const a = p.from === "game" ? game : target, b = p.from === "game" ? target : game;
      const e = t * t * (3 - 2 * t);
      const x = a.x + (b.x - a.x) * e, y = a.y + (b.y - a.y) * e - Math.sin(e * Math.PI) * 40;
      ctx.fillStyle = p.from === "game" ? "#ff7a1a" : "#4ade80";
      ctx.beginPath(); ctx.roundRect(x - 13, y - 9, 26, 18, 3); ctx.fill();
      ctx.fillStyle = "#140a02";
      ctx.font = "600 9px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("SAVE", x, y + 3);
      ctx.textAlign = "start";
    }
  }, { label: "A runner that saves as it goes. Quit and Continue to load the save." });

  const buttons = document.createElement("div");
  buttons.style.cssText = "position:absolute;left:12px;bottom:12px;display:flex;gap:8px;";
  root.appendChild(buttons);
  const button = (label: string, primary: boolean, run: () => void) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText = `font:600 12px system-ui,sans-serif;border-radius:7px;padding:6px 12px;cursor:pointer;border:1px solid ${primary ? "#ff7a1a" : "rgba(255,255,255,0.2)"};background:${primary ? "#ff7a1a" : "rgba(255,255,255,0.06)"};color:#fff;`;
    b.addEventListener("click", () => { pilot.touch(); run(); });
    return b;
  };
  function renderButtons() {
    buttons.replaceChildren();
    if (mode === "playing") buttons.append(button("Quit to title", false, quit));
    else buttons.append(button("Continue", true, continueGame), button("New game", false, newGame));
  }
  renderButtons();

  return {
    setDials(next) {
      const switched = next.cloud !== dials.cloud;
      if (!switched && next.autosaveSeconds === dials.autosaveSeconds) return;
      dials = next;
      const value = store.value();
      store.dispose();
      store = makeStore();
      lastStatus = store.status();
      watch();
      if (switched) savedPreview = null;
      if (mode === "playing") {
        store.set(value);
        if (switched) void store.save();
      }
    },
    dispose() {
      unsubscribe();
      store.dispose();
      view.dispose();
      root.remove();
    },
  };
}
