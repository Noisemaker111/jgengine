/**
 * The engine's Rune UI bridge: mounts the jg-ui wasm (Rune compiled to WebAssembly,
 * drawn on a transparent WebGPU canvas over the game's three.js canvas) and speaks
 * its protocol — a declarative widget tree (`setSpec`), one shared f32 value buffer
 * written once per frame (`bind`), and events plus hit regions back through a
 * single per-frame payload.
 *
 * Pointer pass-through: the UI canvas covers the viewport but its `pointer-events`
 * follows the hit regions Rune reports — over empty UI space events land on the
 * game canvas underneath, over a widget they land on Rune.
 */

import { RuneValueSlots, type RuneTextSlots } from "./rune/valueSlots";
import { createRunePassThrough } from "./runePassThrough";

export interface RuneUiNode {
  k: string;
  [key: string]: unknown;
}

export interface RuneUiEvent {
  id: string;
  kind: string;
  value?: number;
  text?: string;
  scroll?: RuneScrollValues;
}

/** Scroll offset, viewport and content size in layout pixels. */
export type RuneScrollValues = readonly [number, number, number, number, number, number];

export interface RuneUiFrame {
  /** Page-side tree revision whose layout this frame describes. */
  revision: number;
  events: RuneUiEvent[];
  /** Interactive regions as `[x1, y1, x2, y2]` in CSS pixels. */
  regions: [number, number, number, number][];
  modal: boolean;
  /** Laid-out CSS boxes as `[id, x, y, w, h]` in CSS pixels; sent whole when any moved. */
  rects?: [number, number, number, number, number][];
  /** Native keyed bounds, independent of the DOM/CSS host. */
  nativeRects?: [string, [number, number, number, number]][];
}

export interface RuneUiOptions {
  /** Canvas element id; the bridge creates `<canvas id>` when absent. */
  canvasId?: string;
  /** Where the wasm bundle is served from. */
  baseUrl?: string;
  /** TrueType/OpenType font URLs (not WOFF), fetched while the GPU starts. */
  fonts?: readonly string[];
  /** CSS family list for sans text (default "Inter"). */
  sans?: string;
  /** CSS family list for mono text. */
  mono?: string;
  /** z-index of the UI canvas; must sit above the game canvas. */
  zIndex?: number;
}

interface JgUiModule {
  default: (input?: string | URL | Request | Response | BufferSource | WebAssembly.Module) => Promise<{ memory: WebAssembly.Memory }>;
  mount: (canvasId: string, optionsJson: string) => void;
  set_spec: (json: string, revision: number) => void;
  patch: (json: string, revision: number) => void;
  patch_text: (id: number, json: string, revision: number) => void;
  scroll_to: (id: number, x: number, y: number, smooth: boolean) => void;
  scroll_native_into_view: (id: string) => void;
  focus_native: (id: string) => void;
  blur_native: () => void;
  canvas_frame: (id: number, source: HTMLCanvasElement | HTMLVideoElement) => void;
  remove_canvas: (id: number) => void;
  values_changed: () => void;
  frames_drawn: () => number;
  patch_native: (json: string) => void;
  unmount: () => void;
  values_ptr: () => number;
  values_len: () => number;
}

type EventHandler = (ev: RuneUiEvent) => void;

interface BoundValue {
  slot: number;
  get: () => number;
}

const DEFAULT_CANVAS_ID = "jg-ui";
const DEFAULT_BASE = "/jg-ui";

/**
 * One mounted Rune UI layer. Create once per page; games describe their trees with
 * {@link RuneUi.setSpec} and bind live values with {@link RuneUi.bind}.
 */
export class RuneUi {
  private readonly canvas: HTMLCanvasElement;
  private readonly api: JgUiModule;
  /** Where each CSS box was last laid out, by id: `[x, y, w, h]` in CSS pixels. */
  readonly rects = new Map<number, [number, number, number, number]>();
  readonly nativeRects = new Map<string, [number, number, number, number]>();
  /** Called with every box's rect whenever any of them moved. */
  onRects: ((rects: [number, number, number, number, number][]) => void) | null = null;
  private readonly valueSlots: RuneValueSlots;
  private readonly bound = new Map<string, BoundValue>();
  private readonly handlers = new Map<string, Set<EventHandler>>();
  private valuesView: Float32Array | null = null;
  /** Last value written per bound slot; a change is what wakes a Rune frame. */
  private readonly prevValues = new Map<number, number>();
  private raf = 0;
  private destroyed = false;
  private wakeQueued = false;
  private specQueue: (() => void)[] = [];
  private mounted = false;
  private revision = 0;
  private regions: [number, number, number, number][] = [];
  private modalFlag = false;
  private readonly pointer = createRunePassThrough((x, y) => this.overUi(x, y));
  private readonly zIndexCss: string;
  private readonly cleanups: (() => void)[] = [];
  /** Counts committed native frames and spec submissions for idle/performance evidence. */
  private specCount = 0;
  get stats(): { frames: number; specs: number } { return { frames: this.api.frames_drawn(), specs: this.specCount }; }

  /** Change addressed native visual properties without a JSX render or a whole-tree submission.
   * Queued like the spec before Rune's first frame, so a patch never reaches an empty tree. */
  patchNative(patches: readonly { id: string; field: string; value: unknown }[]): void {
    if (patches.length === 0) return;
    const json = JSON.stringify(patches);
    this.send(() => this.api.patch_native(json));
  }

  private constructor(canvas: HTMLCanvasElement, api: JgUiModule, zIndexCss: string, private readonly memory: WebAssembly.Memory) {
    this.canvas = canvas;
    this.api = api;
    this.zIndexCss = zIndexCss;
    this.valueSlots = new RuneValueSlots(() => this.values());
  }

  /** Load the wasm bundle and mount it on a full-viewport canvas above the game. */
  static async create(options: RuneUiOptions = {}): Promise<RuneUi> {
    const canvasId = options.canvasId ?? DEFAULT_CANVAS_ID;
    const base = options.baseUrl ?? DEFAULT_BASE;
    const zIndexCss = String(options.zIndex ?? 40);
    let canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (canvas === null) {
      canvas = document.createElement("canvas");
      canvas.id = canvasId;
      canvas.style.cssText = `position:fixed;left:0;top:0;width:100%;height:100%;display:block;pointer-events:none;z-index:${zIndexCss}`;
      document.body.appendChild(canvas);
    }
    const mod = (await import(/* @vite-ignore */ `${base}/jg_ui.js`)) as JgUiModule;
    const initialized = await mod.default();
    const ui = new RuneUi(canvas, mod, zIndexCss, initialized.memory);
    ui.wirePassThrough();
    window.__jgUiFrame = (payload: string) => ui.onFrame(payload);
    mod.mount(canvasId, JSON.stringify({
      fonts: options.fonts ?? [],
      sans: options.sans,
      mono: options.mono,
    }));
    ui.startValueLoop();
    return ui;
  }

  /** A stable slot index for `name`; allocate once, reuse across spec rebuilds. */
  slot(name: string): number {
    return this.valueSlots.slot(name);
  }

  /** A stable slot fed by `get` every frame — the per-frame binding games write values through. */
  bind(name: string, get: () => number): number {
    const slot = this.slot(name);
    this.bound.set(name, { slot, get });
    this.startValueLoop();
    return slot;
  }

  /** Write `value` into `name`'s slot immediately (outside the per-frame loop). */
  write(name: string, value: number): void {
    const slot = this.slot(name);
    const changed = this.valueSlots.write(name, value);
    this.prevValues.set(slot, Math.fround(value));
    if (changed) this.wake();
  }

  /** Release a removed CSS binding's numeric slot. @internal */
  releaseSlot(name: string): void {
    const released = this.valueSlots.release(name);
    if (released !== undefined) this.prevValues.delete(released);
    this.bound.delete(name);
  }

  /** Write a live label into shared memory; only its first binding or growth needs a text patch. @internal */
  writeText(name: string, text: string): { slots: RuneTextSlots; grew: boolean } {
    const record = this.valueSlots.writeText(name, text);
    if (record.changed) this.wake();
    return record;
  }

  /** Release a removed live label's slots for the next mounted label. @internal */
  releaseText(name: string): void {
    this.valueSlots.releaseText(name);
  }

  /** Replace the widget tree. `children` are spec nodes (`{k: "panel", ...}`); `modal` suspends game input. */
  setSpec(children: RuneUiNode[], modal = false): void {
    this.specCount += 1;
    const json = JSON.stringify({ children, modal });
    const revision = this.revision = (this.revision + 1) >>> 0;
    this.send(() => this.api.set_spec(json, revision));
  }

  /** Replace CSS boxes in place, each by its `id`: a changed subtree without the whole tree. */
  patch(boxes: readonly RuneUiNode[]): void {
    if (boxes.length === 0) return;
    const json = JSON.stringify(boxes);
    const revision = this.revision = (this.revision + 1) >>> 0;
    this.send(() => this.api.patch(json, revision));
  }

  /** Replace one CSS box's text record (`null`: none): a number or label that moved. */
  patchText(id: number, text: unknown): void {
    const json = JSON.stringify(text ?? null);
    const revision = this.revision = (this.revision + 1) >>> 0;
    this.send(() => this.api.patch_text(id, json, revision));
  }

  /** Move a CSS scroll viewport, without rerendering its components. */
  scrollTo(id: number, x: number, y: number, smooth: boolean): void {
    this.send(() => this.api.scroll_to(id, x, y, smooth));
  }

  /** Reveal a native keyed control inside its scroll viewport. */
  scrollNativeIntoView(id: string): void { this.send(() => this.api.scroll_native_into_view(id)); }
  /** Give a native field keyboard focus, or drop it with `null`. */
  focusNative(id: string | null): void { this.send(() => id === null ? this.api.blur_native() : this.api.focus_native(id)); }
  /** The canvas Rune draws on and winit reads keys from. */
  get surfaceCanvas(): HTMLCanvasElement { return this.canvas; }

  /** Present a changed canvas frame in Rune's ordinary image paint order. */
  canvasFrame(id: number, source: HTMLCanvasElement | HTMLVideoElement): void {
    this.send(() => this.api.canvas_frame(id, source));
  }

  /** Release a removed canvas's native image. */
  removeCanvas(id: number): void {
    this.send(() => this.api.remove_canvas(id));
  }

  /** Calls made before Rune's first frame run after it, in order. */
  private send(call: () => void): void {
    if (this.mounted) call();
    else this.specQueue.push(call);
  }

  /** Subscribe to a widget's events by its spec `id`; `"*"` gets every event. */
  on(id: string, handler: EventHandler): () => void {
    let set = this.handlers.get(id);
    if (set === undefined) {
      set = new Set();
      this.handlers.set(id, set);
    }
    set.add(handler);
    return () => set.delete(handler);
  }

  /** The interactive hit regions from the last frame, `[x1, y1, x2, y2]` in CSS pixels. */
  get hitRegions(): readonly [number, number, number, number][] {
    return this.regions;
  }

  /** Whether the last frame's spec marked the UI modal. */
  get modal(): boolean {
    return this.modalFlag;
  }

  /** Whether a viewport point lands on an interactive UI region. */
  overUi(x: number, y: number): boolean {
    for (const [x1, y1, x2, y2] of this.regions) {
      if (x >= x1 && x <= x2 && y >= y1 && y <= y2) return true;
    }
    return false;
  }

  /** Tear down: unmount Rune, remove listeners and the canvas. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    delete window.__jgUiFrame;
    delete (window as { __jgUiLastFrame?: string }).__jgUiLastFrame;
    try {
      this.api.unmount();
    } catch {
      // The wasm may already be gone.
    }
    this.canvas.remove();
  }

  private values(): Float32Array {
    if (this.valuesView === null || this.valuesView.buffer !== this.memory.buffer) {
      // Memory growth detaches the old view; writes always use the current buffer.
      this.valuesView = new Float32Array(this.memory.buffer, this.api.values_ptr(), this.api.values_len());
    }
    return this.valuesView;
  }

  private startValueLoop(): void {
    const tick = () => {
      if (this.destroyed) return;
      let changed = false;
      const view = this.values();
      for (const { slot, get } of this.bound.values()) {
        const value = Math.fround(get());
        const prev = this.prevValues.get(slot);
        if (prev === undefined || !Object.is(prev, value)) {
          view[slot] = value;
          this.prevValues.set(slot, value);
          changed = true;
        }
      }
      // Rune draws and presents only when state moves; an unchanged HUD costs
      // no GPU frame and no browser recomposite.
      if (changed) this.wake();
      this.raf = this.bound.size > 0 ? requestAnimationFrame(tick) : 0;
    };
    if (this.raf === 0 && this.bound.size > 0) this.raf = requestAnimationFrame(tick);
  }

  /** Ask wasm for one committed frame (bound values moved or `write` ran). */
  private wake(): void {
    if (this.wakeQueued || this.destroyed) return;
    this.wakeQueued = true;
    queueMicrotask(() => {
      this.wakeQueued = false;
      if (!this.destroyed) this.send(() => this.api.values_changed());
    });
  }

  private onFrame(payload: string): void {
    if (this.destroyed) return;
    // Frames are event-driven (wasm ships only on change); keep the last one
    // readable for probes and debugging.
    (window as { __jgUiLastFrame?: string }).__jgUiLastFrame = payload;
    let frame: RuneUiFrame;
    try {
      frame = JSON.parse(payload) as RuneUiFrame;
    } catch {
      return;
    }
    this.regions = frame.regions ?? [];
    if (frame.revision === this.revision && frame.nativeRects !== undefined) {
      this.nativeRects.clear();
      for (const [id, rect] of frame.nativeRects) this.nativeRects.set(id, rect);
    }
    if (frame.revision === this.revision && frame.rects !== undefined && frame.rects.length > 0) {
      this.rects.clear();
      for (const [id, x, y, w, h] of frame.rects) this.rects.set(id, [x, y, w, h]);
      this.onRects?.(frame.rects);
    }
    this.modalFlag = frame.modal === true;
    this.applyPointerEvents();
    if (!this.mounted) {
      this.mounted = true;
      const queued = this.specQueue;
      this.specQueue = [];
      for (const call of queued) call();
    }
    for (const ev of frame.events ?? []) {
      this.handlers.get(ev.id)?.forEach((handler) => handler(ev));
      this.handlers.get("*")?.forEach((handler) => handler(ev));
    }
  }

  /**
   * Pointer pass-through: the canvas only takes pointer events while the pointer
   * is over a hit region (or a drag is in flight, or the UI is modal), so clicks
   * on empty UI space reach the game canvas below. Rune rewrites the canvas's
   * inline style once at mount, so this re-applies on every pointer event and
   * every reported frame.
   */
  private applyPointerEvents(): void {
    // Rune rewrites the canvas's inline style at mount; keep our z-index and
    // pointer-events authoritative from the first reported frame on.
    if (this.canvas.style.zIndex !== this.zIndexCss) this.canvas.style.zIndex = this.zIndexCss;
    const next = this.pointer.takes(this.modalFlag) ? "auto" : "none";
    if (this.canvas.style.pointerEvents !== next) this.canvas.style.pointerEvents = next;
  }

  private wirePassThrough(): void {
    const move = (event: PointerEvent) => { this.pointer.move(event.clientX, event.clientY, event.buttons); this.applyPointerEvents(); };
    const down = (event: PointerEvent) => { this.pointer.down(event.clientX, event.clientY, event.target === this.canvas); this.applyPointerEvents(); };
    const up = (event: PointerEvent) => { this.pointer.up(event.clientX, event.clientY); this.applyPointerEvents(); };
    window.addEventListener("pointermove", move, { capture: true, passive: true });
    window.addEventListener("pointerdown", down, { capture: true, passive: true });
    window.addEventListener("pointerup", up, { capture: true, passive: true });
    window.addEventListener("pointercancel", up, { capture: true, passive: true });
    this.cleanups.push(() => {
      window.removeEventListener("pointermove", move, { capture: true });
      window.removeEventListener("pointerdown", down, { capture: true });
      window.removeEventListener("pointerup", up, { capture: true });
      window.removeEventListener("pointercancel", up, { capture: true });
    });
  }
}

declare global {
  interface Window {
    __jgUiFrame?: (payload: string) => void;
  }
}
