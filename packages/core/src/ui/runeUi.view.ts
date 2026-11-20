/**
 * The engine's Rune UI bridge: mounts ONE shared jg-ui wasm instance on ONE transparent
 * full-viewport GPU canvas over the game's three.js canvas, compositing multiple z-ordered
 * `<RuneRoot>` layers inside Rune itself.
 *
 * Protocol: each layer submits its own native Rune node tree (`set_layer_spec`), shares one
 * f32 value buffer in wasm linear memory (`bind`/`write`), and receives events plus hit regions
 * back through one per-frame payload.
 *
 * Pointer pass-through: the UI canvas covers the viewport but its `pointer-events`
 * follows the hit regions Rune reports — over empty UI space events land on the
 * game canvas underneath, over a widget they land on Rune.
 */

import { resolveAssetBaseUrl } from "../assets/assetBase";
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
  /** Each layer's page-side tree revision whose layout this frame describes, as `[layerId, revision]`. */
  revisions: [number, number][];
  events: RuneUiEvent[];
  /** Interactive regions as `[x1, y1, x2, y2]` in CSS pixels. */
  regions: [number, number, number, number][];
  modal: boolean;
  /** Native keyed bounds in CSS pixels. */
  nativeRects?: [string, [number, number, number, number]][];
}

const DEFAULT_BASE = "/jg-ui";
const DEFAULT_CANVAS_ID = "jg-ui";
const DEFAULT_Z_INDEX = 40;

/**
 * The jg-ui module URL, under the app base installed with `setAssetBase`: a runner served from
 * `/play/` loads `/play/jg-ui/jg_ui.js`, not the site root's `/jg-ui/` (which jgengine.com does not serve).
 */
export function runeBundleUrl(baseUrl: string = DEFAULT_BASE): string {
  return resolveAssetBaseUrl(`${baseUrl}/jg_ui.js`);
}

export interface RuneUiOptions {
  /** Canvas element id; the bridge creates `<canvas id>` when absent. */
  canvasId?: string;
  /** Where the wasm bundle is served from (default `/jg-ui`, under the installed app base). */
  baseUrl?: string;
  /** TrueType/OpenType/WOFF/WOFF2 font URLs, fetched without blocking the first frame. */
  fonts?: readonly string[];
  /** CSS family list for sans text (default "Inter"). */
  sans?: string;
  /** CSS family list for mono text. */
  mono?: string;
  /** Layer stacking order inside Rune and minimum CSS z-index above the game canvas. */
  zIndex?: number;
  /** Optional abort signal so a caller torn down mid-load detaches its layer synchronously. */
  signal?: AbortSignal;
}

/** @internal */
export interface JgUiModule {
  default: (input?: string | URL | Request | Response | BufferSource | WebAssembly.Module) => Promise<{ memory: WebAssembly.Memory }>;
  mount: (canvasId: string, optionsJson: string, onFrame: (payload: string) => void) => void;
  set_layer_spec: (layerId: number, z: number, json: string, revision: number) => void;
  remove_layer: (layerId: number) => void;
  add_fonts: (urlsJson: string) => void;
  scroll_native_into_view: (id: string) => void;
  focus_native: (id: string) => void;
  blur_native: () => void;
  values_changed: () => void;
  frames_drawn: () => number;
  patch_layer_native: (layerId: number, json: string) => void;
  unmount: () => void;
  values_ptr: () => number;
  values_len: () => number;
}

type EventHandler = (ev: RuneUiEvent) => void;

interface BoundValue {
  slot: number;
  get: () => number;
}

const loadedModules = new Map<string, Promise<{ mod: JgUiModule; memory: WebAssembly.Memory }>>();
let gpuWarmed = false;

/** Kick off browser WebGPU adapter init in parallel with JS/WASM download and compile. */
function warmWebGpu(): void {
  if (gpuWarmed || typeof navigator === "undefined") return;
  gpuWarmed = true;
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter?: (opts?: { powerPreference?: string }) => Promise<unknown> } }).gpu;
  void gpu?.requestAdapter?.({ powerPreference: "low-power" })?.catch(() => {});
}

function loadModule(baseUrl: string | undefined): Promise<{ mod: JgUiModule; memory: WebAssembly.Memory }> {
  warmWebGpu();
  const url = runeBundleUrl(baseUrl);
  let pending = loadedModules.get(url);
  if (pending === undefined) {
    pending = (async () => {
      const mod = (await import(/* @vite-ignore */ url)) as JgUiModule;
      const { memory } = await mod.default();
      return { mod, memory };
    })();
    pending.catch(() => {
      if (loadedModules.get(url) === pending) loadedModules.delete(url);
    });
    loadedModules.set(url, pending);
  }
  return pending;
}

let nextLayerId = 1;
const activeHosts = new Map<string, RuneHost>();

/** Register additional font URLs on any live Rune host so late-registered game fonts load dynamically. */
export function addRuneFonts(urls: readonly string[]): void {
  if (urls.length === 0) return;
  for (const host of activeHosts.values()) host.addFonts(urls);
}

class RuneHost {
  readonly canvas: HTMLCanvasElement;
  readonly ready: Promise<void>;
  private api: JgUiModule | null = null;
  private memory: WebAssembly.Memory | null = null;
  private valuesView: Float32Array | null = null;
  private readonly valueSlots: RuneValueSlots;
  private readonly prevValues = new Map<number, number>();
  private readonly bound = new Map<string, BoundValue>();
  private readonly layers = new Map<number, RuneUi>();
  private readonly sentFonts = new Set<string>();
  private preMountQueue: (() => void)[] = [];
  private raf = 0;
  private wakeQueued = false;
  private mountCalled = false;
  private destroyed = false;
  private regions: [number, number, number, number][] = [];
  private modalFlag = false;
  private zIndexCss: string;
  private readonly pointer = createRunePassThrough((x, y) => this.overUi(x, y));
  private readonly cleanups: (() => void)[] = [];

  get isDestroyed(): boolean { return this.destroyed; }
  get hitRegions(): readonly [number, number, number, number][] { return this.regions; }
  get modal(): boolean { return this.modalFlag; }

  constructor(
    readonly canvasId: string,
    private readonly baseUrl: string | undefined,
    initialZ: number,
    options: RuneUiOptions,
    injected?: { canvas: HTMLCanvasElement; api: JgUiModule; memory: WebAssembly.Memory },
  ) {
    this.zIndexCss = String(initialZ);
    this.valueSlots = new RuneValueSlots(() => this.values());
    if (options.fonts !== undefined) {
      for (const url of options.fonts) this.sentFonts.add(url);
    }

    if (injected !== undefined) {
      this.canvas = injected.canvas;
      this.api = injected.api;
      this.memory = injected.memory;
      this.mountCalled = true;
      this.ready = Promise.resolve();
      return;
    }

    let canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (canvas === null) {
      canvas = document.createElement("canvas");
      canvas.id = canvasId;
      canvas.style.cssText = `position:fixed;left:0;top:0;width:100%;height:100%;display:block;pointer-events:none;z-index:${this.zIndexCss}`;
      document.body.appendChild(canvas);
    }
    canvas.dataset["runeLive"] = "1";
    this.canvas = canvas;
    this.wirePassThrough();

    this.ready = loadModule(baseUrl).then(({ mod, memory }) => {
        if (this.destroyed) return;
        this.api = mod;
        this.memory = memory;
        this.mountCalled = true;
        mod.mount(
          this.canvasId,
          JSON.stringify({
            fonts: [...this.sentFonts],
            sans: options.sans,
            mono: options.mono,
          }),
          (payload) => this.onFrame(payload),
        );
        const queued = this.preMountQueue;
        this.preMountQueue = [];
        for (const call of queued) call();
        this.startValueLoop();
    });
  }

  attach(layer: RuneUi): void {
    this.layers.set(layer.layerId, layer);
    this.syncCanvasZIndex();
  }

  detach(layer: RuneUi): void {
    if (!this.layers.delete(layer.layerId)) return;
    if (this.layers.size === 0) {
      this.destroy();
      return;
    }
    this.send(() => this.api?.remove_layer(layer.layerId));
    this.syncCanvasZIndex();
    this.applyPointerEvents();
  }

  addFonts(urls: readonly string[]): void {
    const added: string[] = [];
    for (const url of urls) {
      if (this.sentFonts.has(url)) continue;
      this.sentFonts.add(url);
      added.push(url);
    }
    if (added.length === 0 || !this.mountCalled || this.destroyed) return;
    const json = JSON.stringify(added);
    this.send(() => this.api?.add_fonts(json));
  }

  framesDrawn(): number {
    return this.api?.frames_drawn() ?? 0;
  }

  slot(key: string): number {
    return this.valueSlots.slot(key);
  }

  bind(key: string, get: () => number): number {
    const slot = this.slot(key);
    this.bound.set(key, { slot, get });
    this.startValueLoop();
    return slot;
  }

  write(key: string, value: number): void {
    const slot = this.slot(key);
    const changed = this.valueSlots.write(key, value);
    this.prevValues.set(slot, Math.fround(value));
    if (changed) this.wake();
  }

  releaseSlot(key: string): void {
    const released = this.valueSlots.release(key);
    if (released !== undefined) this.prevValues.delete(released);
    this.bound.delete(key);
  }

  writeText(key: string, text: string): { slots: RuneTextSlots; grew: boolean } {
    const record = this.valueSlots.writeText(key, text);
    if (record.changed) this.wake();
    return record;
  }

  releaseText(key: string): void {
    this.valueSlots.releaseText(key);
  }

  setLayerSpec(layerId: number, z: number, json: string, revision: number): void {
    this.send(() => this.api?.set_layer_spec(layerId, z, json, revision));
  }

  patchLayerNative(layerId: number, json: string): void {
    this.send(() => this.api?.patch_layer_native(layerId, json));
  }

  scrollNativeIntoView(id: string): void {
    this.send(() => this.api?.scroll_native_into_view(id));
  }

  focusNative(id: string | null): void {
    this.send(() => {
      if (this.api === null) return;
      if (id === null) this.api.blur_native();
      else this.api.focus_native(id);
    });
  }

  overUi(x: number, y: number): boolean {
    for (const [x1, y1, x2, y2] of this.regions) {
      if (x >= x1 && x <= x2 && y >= y1 && y <= y2) return true;
    }
    return false;
  }

  /** Run immediately once `mount()` has executed (so frame 1 already draws queued specs); queue before mount. */
  send(call: () => void): void {
    if (this.destroyed) return;
    if (this.mountCalled) call();
    else this.preMountQueue.push(call);
  }

  private syncCanvasZIndex(): void {
    let maxZ = DEFAULT_Z_INDEX;
    let first = true;
    for (const layer of this.layers.values()) {
      if (first || layer.zIndex > maxZ) {
        maxZ = layer.zIndex;
        first = false;
      }
    }
    this.zIndexCss = String(maxZ);
    if (this.canvas.style.zIndex !== this.zIndexCss) {
      this.canvas.style.zIndex = this.zIndexCss;
    }
  }

  private values(): Float32Array {
    if (this.api === null || this.memory === null) {
      throw new Error("Rune UI shared value buffer accessed before WASM loaded");
    }
    if (this.valuesView === null || this.valuesView.buffer !== this.memory.buffer) {
      // Memory growth detaches the old view; writes always use the current buffer.
      this.valuesView = new Float32Array(this.memory.buffer, this.api.values_ptr(), this.api.values_len());
    }
    return this.valuesView;
  }

  private startValueLoop(): void {
    if (!this.mountCalled || this.destroyed) return;
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

  private wake(): void {
    if (this.wakeQueued || this.destroyed) return;
    this.wakeQueued = true;
    queueMicrotask(() => {
      this.wakeQueued = false;
      if (!this.destroyed) this.send(() => this.api?.values_changed());
    });
  }

  onFrame(payload: string): void {
    if (this.destroyed) return;
    let frame: RuneUiFrame;
    try {
      frame = JSON.parse(payload) as RuneUiFrame;
    } catch {
      return;
    }
    this.regions = frame.regions ?? [];
    this.modalFlag = frame.modal === true;
    this.applyPointerEvents();
    const revByLayer = new Map<number, number>(frame.revisions ?? []);
    const liveLayers = [...this.layers.values()];
    for (const layer of liveLayers) {
      layer.applyFrameRects(revByLayer.get(layer.layerId) ?? -1, frame.nativeRects);
    }
    const events = frame.events ?? [];
    if (events.length === 0) return;
    const topLayer = liveLayers.reduce<RuneUi | undefined>(
      (best, cur) => (best === undefined || cur.zIndex >= best.zIndex ? cur : best),
      undefined,
    );
    for (const ev of events) {
      if (ev.kind === "error") {
        topLayer?.dispatchEvent(ev);
        continue;
      }
      for (const layer of liveLayers) layer.dispatchEvent(ev);
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

  private destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (activeHosts.get(this.canvasId) === this) activeHosts.delete(this.canvasId);
    if (this.raf !== 0) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.preMountQueue = [];
    this.bound.clear();
    this.prevValues.clear();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    if (this.mountCalled && this.api !== null) {
      try {
        this.api.unmount();
      } catch {
        // The wasm may have trapped; evict it so a later open reloads cleanly.
        loadedModules.delete(runeBundleUrl(this.baseUrl));
      }
    }
    this.api = null;
    this.memory = null;
    this.valuesView = null;
    this.canvas.remove();
  }
}

/**
 * One z-ordered Rune UI layer hosted on the shared single-canvas Rune runtime.
 * Games describe their trees with {@link RuneUi.setSpec} and bind live values with {@link RuneUi.bind}.
 */
export class RuneUi {
  readonly layerId: number;
  readonly zIndex: number;
  readonly nativeRects = new Map<string, [number, number, number, number]>();
  private readonly host: RuneHost;
  private readonly handlers = new Map<string, Set<EventHandler>>();
  private readonly ownSlots = new Set<string>();
  private readonly ownTexts = new Set<string>();
  private readonly destroyHooks: (() => void)[] = [];
  private destroyed = false;
  private revision = 0;
  private specCount = 0;

  get stats(): { frames: number; specs: number } {
    return { frames: this.host.framesDrawn(), specs: this.specCount };
  }

  /** Change addressed native visual properties without a JSX render or a whole-tree submission. */
  patchNative(patches: readonly { id: string; field: string; value: unknown }[]): void {
    if (this.destroyed || patches.length === 0) return;
    this.host.patchLayerNative(this.layerId, JSON.stringify(patches));
  }

  private constructor(host: RuneHost, layerId: number, zIndex: number) {
    this.host = host;
    this.layerId = layerId;
    this.zIndex = zIndex;
    this.host.attach(this);
  }

  /** Acquire a z-ordered layer on the shared Rune canvas and WASM instance. */
  static async create(options: RuneUiOptions = {}): Promise<RuneUi> {
    const canvasId = options.canvasId ?? DEFAULT_CANVAS_ID;
    const zIndex = options.zIndex ?? DEFAULT_Z_INDEX;
    let host = activeHosts.get(canvasId);
    if (host === undefined || host.isDestroyed) {
      host = new RuneHost(canvasId, options.baseUrl, zIndex, options);
      activeHosts.set(canvasId, host);
    } else if (options.fonts !== undefined && options.fonts.length > 0) {
      host.addFonts(options.fonts);
    }
    const layer = new RuneUi(host, nextLayerId++, zIndex);
    const signal = options.signal;
    if (signal !== undefined) {
      if (signal.aborted) {
        layer.destroy();
        return layer;
      }
      const onAbort = () => layer.destroy();
      signal.addEventListener("abort", onAbort, { once: true });
      layer.onDestroy(() => signal.removeEventListener("abort", onAbort));
    }
    try {
      await host.ready;
    } catch (error) {
      layer.destroy();
      throw error;
    }
    return layer;
  }

  /** Test seam: create a layer backed by a caller-provided host mock without loading WASM. @internal */
  static createForTest(canvas: HTMLCanvasElement, api: JgUiModule, memory: WebAssembly.Memory, zIndex = DEFAULT_Z_INDEX): { ui: RuneUi; onFrame: (payload: string) => void } {
    const canvasId = canvas.id || DEFAULT_CANVAS_ID;
    let host = activeHosts.get(canvasId);
    if (host === undefined || host.isDestroyed) {
      host = new RuneHost(canvasId, undefined, zIndex, {}, { canvas, api, memory });
      activeHosts.set(canvasId, host);
    }
    const ui = new RuneUi(host, nextLayerId++, zIndex);
    return { ui, onFrame: (payload: string) => host.onFrame(payload) };
  }

  private slotKey(name: string): string {
    return `${this.layerId}:${name}`;
  }

  /** A stable slot index for `name`; allocate once, reuse across spec rebuilds. */
  slot(name: string): number {
    this.ownSlots.add(name);
    return this.host.slot(this.slotKey(name));
  }

  /** A stable slot fed by `get` every frame — the per-frame binding games write values through. */
  bind(name: string, get: () => number): number {
    this.ownSlots.add(name);
    return this.host.bind(this.slotKey(name), get);
  }

  /** Write `value` into `name`'s slot immediately (outside the per-frame loop). */
  write(name: string, value: number): void {
    this.ownSlots.add(name);
    this.host.write(this.slotKey(name), value);
  }

  /** Release a removed binding's numeric slot. @internal */
  releaseSlot(name: string): void {
    this.ownSlots.delete(name);
    this.host.releaseSlot(this.slotKey(name));
  }

  /** Write a live label into shared memory; only its first binding or growth needs a text patch. @internal */
  writeText(name: string, text: string): { slots: RuneTextSlots; grew: boolean } {
    this.ownTexts.add(name);
    return this.host.writeText(this.slotKey(name), text);
  }

  /** Release a removed live label's slots for the next mounted label. @internal */
  releaseText(name: string): void {
    this.ownTexts.delete(name);
    this.host.releaseText(this.slotKey(name));
  }

  /** Replace this layer's tree. `children` are native nodes (`{k: "native", ...}`); `modal` suspends game input. */
  setSpec(children: RuneUiNode[], modal = false): void {
    if (this.destroyed) return;
    this.specCount += 1;
    const json = JSON.stringify({ children, modal });
    const revision = this.revision = (this.revision + 1) >>> 0;
    this.host.setLayerSpec(this.layerId, this.zIndex, json, revision);
  }

  /** Reveal a native keyed control inside its scroll viewport. */
  scrollNativeIntoView(id: string): void {
    if (!this.destroyed) this.host.scrollNativeIntoView(id);
  }

  /** Give a native field keyboard focus, or drop it with `null`. */
  focusNative(id: string | null): void {
    if (!this.destroyed) this.host.focusNative(id);
  }

  /** The shared canvas Rune draws on and winit reads keys from. */
  get surfaceCanvas(): HTMLCanvasElement {
    return this.host.canvas;
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
    return this.host.hitRegions;
  }

  /** Whether any active layer marked the UI modal. */
  get modal(): boolean {
    return this.host.modal;
  }

  /** Whether a viewport point lands on an interactive UI region. */
  overUi(x: number, y: number): boolean {
    return this.host.overUi(x, y);
  }

  private onDestroy(fn: () => void): void {
    this.destroyHooks.push(fn);
  }

  /** Tear down this layer; if it was the last layer on the host, unmount Rune and remove the canvas. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const hook of this.destroyHooks.splice(0)) hook();
    for (const name of this.ownSlots) this.host.releaseSlot(this.slotKey(name));
    this.ownSlots.clear();
    for (const name of this.ownTexts) this.host.releaseText(this.slotKey(name));
    this.ownTexts.clear();
    this.handlers.clear();
    this.nativeRects.clear();
    this.host.detach(this);
  }

  /** @internal */
  applyFrameRects(layerRevision: number, nativeRects: [string, [number, number, number, number]][] | undefined): void {
    if (this.destroyed || layerRevision !== this.revision || nativeRects === undefined) return;
    this.nativeRects.clear();
    for (const [id, rect] of nativeRects) this.nativeRects.set(id, rect);
  }

  /** @internal */
  dispatchEvent(ev: RuneUiEvent): void {
    if (this.destroyed) return;
    this.handlers.get(ev.id)?.forEach((handler) => handler(ev));
    this.handlers.get("*")?.forEach((handler) => handler(ev));
  }
}
