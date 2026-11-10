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

export interface RuneUiNode {
  k: string;
  [key: string]: unknown;
}

export interface RuneUiEvent {
  id: string;
  kind: string;
  value?: number;
  text?: string;
}

export interface RuneUiFrame {
  events: RuneUiEvent[];
  /** Interactive regions as `[x1, y1, x2, y2]` in CSS pixels. */
  regions: [number, number, number, number][];
  modal: boolean;
  /** Laid-out CSS boxes as `[id, x, y, w, h]` in CSS pixels; sent whole when any moved. */
  rects?: [number, number, number, number, number][];
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
  default: (input?: string | URL | Request | Response | BufferSource | WebAssembly.Module) => Promise<unknown>;
  mount: (canvasId: string, optionsJson: string) => void;
  set_spec: (json: string) => void;
  patch: (json: string) => void;
  patch_text: (id: number, json: string) => void;
  values_changed: () => void;
  unmount: () => void;
  values_ptr: () => number;
  values_len: () => number;
  memory: WebAssembly.Memory;
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
  /** Called with every box's rect whenever any of them moved. */
  onRects: ((rects: [number, number, number, number, number][]) => void) | null = null;
  private readonly slots = new Map<string, number>();
  private readonly bound = new Map<string, BoundValue>();
  private readonly handlers = new Map<string, Set<EventHandler>>();
  private valuesView: Float32Array | null = null;
  /** Last value written per bound slot; a change is what wakes a Rune frame. */
  private readonly prevValues = new Map<number, number>();
  private raf = 0;
  private destroyed = false;
  private specQueue: (() => void)[] = [];
  private mounted = false;
  private regions: [number, number, number, number][] = [];
  private modalFlag = false;
  private pointer = { x: -1, y: -1, down: 0 };
  private readonly zIndexCss: string;
  private readonly cleanups: (() => void)[] = [];

  private constructor(canvas: HTMLCanvasElement, api: JgUiModule, zIndexCss: string) {
    this.canvas = canvas;
    this.api = api;
    this.zIndexCss = zIndexCss;
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
    await mod.default();
    const ui = new RuneUi(canvas, mod, zIndexCss);
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
    let slot = this.slots.get(name);
    if (slot === undefined) {
      slot = this.slots.size;
      this.slots.set(name, slot);
    }
    return slot;
  }

  /** A stable slot fed by `get` every frame — the per-frame binding games write values through. */
  bind(name: string, get: () => number): number {
    const slot = this.slot(name);
    this.bound.set(name, { slot, get });
    return slot;
  }

  /** Write `value` into `name`'s slot immediately (outside the per-frame loop). */
  write(name: string, value: number): void {
    const slot = this.slot(name);
    this.values()[slot] = value;
    this.prevValues.set(slot, value);
    this.wake();
  }

  /** Replace the widget tree. `children` are spec nodes (`{k: "panel", ...}`); `modal` suspends game input. */
  setSpec(children: RuneUiNode[], modal = false): void {
    const json = JSON.stringify({ children, modal });
    this.send(() => this.api.set_spec(json));
  }

  /** Replace CSS boxes in place, each by its `id`: a changed subtree without the whole tree. */
  patch(boxes: readonly RuneUiNode[]): void {
    if (boxes.length === 0) return;
    const json = JSON.stringify(boxes);
    this.send(() => this.api.patch(json));
  }

  /** Replace one CSS box's text record (`null`: none): a number or label that moved. */
  patchText(id: number, text: unknown): void {
    const json = JSON.stringify(text ?? null);
    this.send(() => this.api.patch_text(id, json));
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
    if (this.valuesView === null) {
      // memory.buffer detaches if wasm memory grows; the rAF loop rebuilds on throw.
      this.valuesView = new Float32Array(this.api.memory.buffer, this.api.values_ptr(), this.api.values_len());
    }
    return this.valuesView;
  }

  private startValueLoop(): void {
    const tick = () => {
      if (this.destroyed) return;
      let changed = false;
      try {
        const view = this.values();
        for (const { slot, get } of this.bound.values()) {
          const value = get();
          view[slot] = value;
          const prev = this.prevValues.get(slot);
          if (prev === undefined || !(prev === value || (Number.isNaN(prev) && Number.isNaN(value)))) {
            this.prevValues.set(slot, value);
            changed = true;
          }
        }
      } catch {
        this.valuesView = null;
      }
      // Rune draws and presents only when state moves; an unchanged HUD costs
      // no GPU frame and no browser recomposite.
      if (changed) this.wake();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Ask wasm for one committed frame (bound values moved or `write` ran). */
  private wake(): void {
    try {
      this.api.values_changed();
    } catch {
      // Before mount resolves there is nothing to wake; the first frame draws anyway.
    }
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
    if (frame.rects !== undefined && frame.rects.length > 0) {
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
    const { x, y, down } = this.pointer;
    const over = this.modalFlag || down > 0 || (x >= 0 && this.overUi(x, y));
    const next = over ? "auto" : "none";
    if (this.canvas.style.pointerEvents !== next) this.canvas.style.pointerEvents = next;
  }

  private wirePassThrough(): void {
    const move = (event: PointerEvent) => {
      this.pointer.x = event.clientX;
      this.pointer.y = event.clientY;
      // A move with no buttons held ends a drag whose pointerup was missed.
      if (event.buttons === 0 && this.pointer.down > 0) this.pointer.down = 0;
      this.applyPointerEvents();
    };
    const down = (event: PointerEvent) => {
      this.pointer.x = event.clientX;
      this.pointer.y = event.clientY;
      this.pointer.down += 1;
      this.applyPointerEvents();
    };
    const up = (event: PointerEvent) => {
      this.pointer.x = event.clientX;
      this.pointer.y = event.clientY;
      this.pointer.down = Math.max(0, this.pointer.down - 1);
      this.applyPointerEvents();
    };
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
