/**
 * The page's Rune stage: one Rune canvas over the game, drawing every mounted
 * {@link RuneLayer}. A layer is an undisplayed DOM subtree; the stage watches it
 * for changes, mirrors it to Rune CSS boxes and sends events from Rune back to
 * its elements as ordinary DOM events.
 *
 * Mirroring follows changes. What a change costs follows what changed: text
 * that moved replaces one box's text with no style read; an element whose class
 * or style changed is mirrored again with its subtree; only a resize or a new
 * layer mirrors a whole layer.
 */

import { RuneUi, type RuneUiEvent, type RuneUiNode } from "../runeUi.view";
import { isFrameBoundElement } from "../liveBind.view";
import { MirrorReport, boxOfElement, elementOf, mirrorRoot, onMaskLoaded, ownerOf, remirrorElement, remirrorText, type WireBox } from "./cssMirror.view";
import { compactPatches } from "./patches";
import { twinStateRules } from "./cssStates.view";
import { installRuneMeasure, runeRectOf, setRuneRect, setRuneScroll } from "./domMeasure.view";
import { RuneInput } from "./runeInput.view";
import { boxTransform, composeBoxTransform, transformedBoxRect, type BoxTransform } from "./boxTransform";
import { watchVideoFrames } from "./videoFrames.view";

interface Layer {
  container: HTMLElement;
  observer: MutationObserver;
  root: WireBox | null;
  /** Elements whose own style or children changed. */
  dirty: Set<Element>;
  /** Elements under which only text nodes changed. */
  texts: Set<Element>;
}

const fontUrls = new Set<string>();

/** A font file (TrueType, OpenType, WOFF or WOFF2) Rune should load for text. */
export function registerRuneFont(url: string): void {
  if (fontUrls.has(url)) return;
  fontUrls.add(url);
  stage?.fontsChanged();
}

let stage: RuneStage | null = null;

function specShape(box: WireBox): string {
  return JSON.stringify(box, function (this: Record<string, unknown>, key: string, value: unknown): unknown {
    if ((key === "s" && this["live"] !== undefined) || (key === "tf" && this["tfv"] !== undefined) || (key === "op" && this["opv"] !== undefined)) return undefined;
    return value;
  });
}

export class RuneStage {
  /** The page's stage, made on first use. */
  static get(): RuneStage {
    if (stage === null) stage = new RuneStage();
    return stage;
  }

  readonly report = new MirrorReport();
  private readonly layers: Layer[] = [];
  private readonly liveTexts = new Set<number>();
  private readonly liveStyles = new Map<number, Set<string>>();
  private ui: RuneUi | null = null;
  private creating = false;
  /** Rune could not start: layers are drawn by the page. */
  private failed = false;
  private readonly failedListeners = new Set<() => void>();
  private queued = false;
  private mountedFonts = "";
  /** The whole tree must be sent again (a layer came or went, Rune remounted). */
  private stale = true;
  private readonly canvasFeeds = new Map<HTMLCanvasElement, { stop(): void; received: boolean; streamed: boolean }>();
  private input: RuneInput | null = null;
  private readonly scrollRequests = new Map<Element, { x: number; y: number; smooth: boolean }>();
  /** What the mirror has done and what it cost, for perf probes: passes by kind, boxes built, milliseconds. */
  stats = { full: 0, patches: 0, texts: 0, slots: 0, boxes: 0, ms: 0, lastMs: 0 };
  /** The last updates Rune refused, newest last. */
  readonly errors: string[] = [];

  private constructor() {
    installRuneMeasure({ scroll: (element, x, y, smooth) => this.scrollTo(element, x, y, smooth) });
    onMaskLoaded(() => this.remirror());
    window.addEventListener("resize", () => {
      for (const layer of this.layers) layer.root = null;
      this.invalidate();
    });
    (window as { __jgRuneStage?: RuneStage }).__jgRuneStage = this;
  }

  /** Start mirroring `container`'s children; returns the detach function. */
  /** The Rune-drawn element that takes a press at this point of the window, or null: what `elementFromPoint` is for the page. */
  elementAt(x: number, y: number): Element | null {
    return this.input?.target(x, y) ?? null;
  }

  /** Whether Rune could not start. A layer then renders into the page instead (`RuneLayer`). */
  get unavailable(): boolean {
    return this.failed;
  }

  /** Hear when Rune turns out to be unavailable. Returns the call that stops listening. */
  onUnavailable(listener: () => void): () => void {
    this.failedListeners.add(listener);
    return () => this.failedListeners.delete(listener);
  }

  attach(container: HTMLElement): () => void {
    const layer: Layer = {
      container,
      observer: new MutationObserver((records) => this.onMutations(layer, records)),
      root: null,
      dirty: new Set(),
      texts: new Set(),
    };
    layer.observer.observe(container, { subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true });
    this.layers.push(layer);
    this.stale = true;
    this.invalidate();
    return () => {
      layer.observer.disconnect();
      const at = this.layers.indexOf(layer);
      if (at !== -1) this.layers.splice(at, 1);
      this.stale = true;
      this.invalidate();
    };
  }

  /** Bring Rune up to date before the next frame; many calls in one task make one pass. */
  invalidate(): void {
    if (this.queued) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      this.sync();
    });
  }

  /** A tick box or list changed state, which no attribute shows: read it again. */
  private controlChanged(control: Element): void {
    const layer = this.layers.find((candidate) => candidate.container.contains(control));
    if (layer === undefined) return;
    layer.dirty.add(control);
    this.invalidate();
  }

  /** Read every layer again from the top (a picture an element is drawn from has arrived). */
  remirror(): void {
    for (const layer of this.layers) layer.root = null;
    this.invalidate();
  }

  fontsChanged(): void {
    if (this.ui === null) return;
    this.stopCanvases();
    // Rune fetches fonts while it mounts, so a font registered later needs a fresh mount.
    this.ui.destroy();
    this.ui = null;
    this.stale = true;
    this.invalidate();
  }

  private ensureUi(): void {
    if (this.ui !== null || this.creating) return;
    this.creating = true;
    const fonts = [...fontUrls];
    this.mountedFonts = fonts.join("|");
    void RuneUi.create({ canvasId: "jg-ui", fonts, zIndex: 40 })
      .then((ui) => {
        this.creating = false;
        if (this.mountedFonts !== [...fontUrls].join("|")) {
          ui.destroy();
          this.ensureUi();
          return;
        }
        this.ui = ui;
        if (this.input === null) this.input = new RuneInput(() => this.layers.map((layer) => layer.root).filter((root): root is WireBox => root !== null), (control) => this.controlChanged(control));
        ui.on("*", (event) => this.onEvent(event));
        ui.onRects = () => {
          const place = (box: WireBox, parent: BoxTransform): void => {
            const raw = box.id === 0 ? undefined : ui.rects.get(box.id);
            const matrix = raw === undefined ? parent : composeBoxTransform(parent, boxTransform(raw, box["tf"], box["to"]));
            if (raw !== undefined) {
              const element = elementOf(box.id);
              if (element !== null) setRuneRect(element, transformedBoxRect(raw, matrix), raw);
            }
            for (const child of box.c ?? []) place(child, matrix);
          };
          for (const layer of this.layers) if (layer.root !== null) place(layer.root, [1, 0, 0, 1, 0, 0]);
          const pending = [...this.scrollRequests];
          this.scrollRequests.clear();
          for (const [element, request] of pending) {
            if (!element.isConnected) continue;
            const box = boxOfElement(element);
            if (box !== undefined) ui.scrollTo(box.id, request.x, request.y, request.smooth);
            else this.report.add("scroll request on an element without a Rune box", element);
          }
          this.syncCanvases();
        };
        this.stale = true;
        this.sync();
      })
      .catch((error: unknown) => this.fail(error));
  }

  private fail(error: unknown): void {
    if (this.failed) return;
    this.failed = true;
    this.creating = true;
    this.stopCanvases();
    this.input?.destroy();
    this.input = null;
    this.ui?.destroy();
    this.ui = null;
    this.errors.push(String(error));
    console.error("degraded: the Rune UI layer failed, so the page draws the UI itself", error);
    for (const listener of [...this.failedListeners]) listener();
  }

  private onMutations(layer: Layer, records: MutationRecord[]): void {
    // An attribute counts as changed by what it was before this batch against what it is now:
    // set-then-unset (a state probe, a re-applied inline style) changes nothing.
    let before: Map<Element, Map<string, string | null>> | null = null;
    for (const record of records) {
      const target = record.target;
      if (record.type === "characterData") {
        if (target.parentElement !== null) layer.texts.add(target.parentElement);
        continue;
      }
      if (record.type === "attributes") {
        const name = record.attributeName;
        if (name === null) continue;
        if (before === null) before = new Map();
        let names = before.get(target as Element);
        if (names === undefined) {
          names = new Map();
          before.set(target as Element, names);
        }
        if (!names.has(name)) names.set(name, record.oldValue);
        continue;
      }
      let onlyText = true;
      for (const node of record.addedNodes) if (node.nodeType !== 3) onlyText = false;
      for (const node of record.removedNodes) if (node.nodeType !== 3) onlyText = false;
      if (onlyText) layer.texts.add(target as Element);
      else layer.dirty.add(target as Element);
    }
    if (before !== null) {
      for (const [element, names] of before) {
        for (const [name, old] of names) {
          if (element.getAttribute(name) !== old) {
            layer.dirty.add(element);
            break;
          }
        }
      }
    }
    if (layer.dirty.size > 0 || layer.texts.size > 0) this.invalidate();
  }

  /** The nearest element at or above `element` that has a box of its own; the container when none below it has. */
  private boxed(layer: Layer, element: Element): Element {
    let current: Element | null = element;
    while (current !== null && current !== layer.container) {
      if (boxOfElement(current) !== undefined) return current;
      current = current.parentElement;
    }
    return layer.container;
  }

  private releaseLive(ui: RuneUi, id: number): void {
    if (this.liveTexts.delete(id)) ui.releaseText(`text:${id}`);
    for (const field of this.liveStyles.get(id) ?? []) ui.releaseSlot(`style:${id}:${field}`);
    this.liveStyles.delete(id);
  }

  private prepareLive(ui: RuneUi, box: WireBox, previous: WireBox | undefined, inherited = false): void {
    const element = elementOf(box.id);
    const dynamic = inherited || (element !== null && isFrameBoundElement(element));
    const text = box["t"];
    if (this.liveTexts.has(box.id) && typeof text === "object" && text !== null && "s" in text && typeof text.s === "string") {
      const binding = ui.writeText(`text:${box.id}`, text.s);
      Object.assign(text, { live: binding.slots });
    }
    if (box.id !== 0 && dynamic) {
      let fields = this.liveStyles.get(box.id);
      const bind = (field: string, value: number): number => {
        if (fields === undefined) {
          fields = new Set();
          this.liveStyles.set(box.id, fields);
        }
        fields.add(field);
        const name = `style:${box.id}:${field}`;
        ui.write(name, value);
        return ui.slot(name);
      };
      for (const field of ["w", "h", "mnw", "mnh", "mxw", "mxh", "fb"]) {
        const value = box[field];
        const percent = typeof value === "string" && value.endsWith("%");
        if ((typeof value === "number" || percent) && (fields?.has(field) === true || (previous !== undefined && JSON.stringify(value) !== JSON.stringify(previous[field])))) {
          const number = typeof value === "number" ? value : parseFloat(String(value)) / 100;
          if (Number.isFinite(number)) box[field] = { v: bind(field, number), p: percent };
        }
      }
      const opacity = box["op"];
      if (typeof opacity === "number" && (fields?.has("op") === true || (previous !== undefined && opacity !== previous["op"]))) box["opv"] = bind("op", opacity);
      const transform = box["tf"];
      if (Array.isArray(transform) && transform.every((value): value is number => typeof value === "number" && Number.isFinite(value)) && (fields?.has("tf:0") === true || (previous !== undefined && JSON.stringify(transform) !== JSON.stringify(previous["tf"])))) {
        box["tfv"] = transform.map((value, index) => bind(`tf:${index}`, value));
      }
    }
    const oldChildren = new Map((previous?.c ?? []).filter((child) => child.id !== 0).map((child) => [child.id, child]));
    for (const child of box.c ?? []) this.prepareLive(ui, child, oldChildren.get(child.id), dynamic);
  }

  private sync(): void {
    if (this.layers.length === 0 && this.ui === null) return;
    this.ensureUi();
    const ui = this.ui;
    if (ui === null) return;
    const started = performance.now();
    let full = this.stale;
    const patches: WireBox[] = [];
    for (const layer of this.layers) {
      if (layer.root === null) {
        twinStateRules();
        layer.root = mirrorRoot(layer.container, this.report);
        layer.dirty.clear();
        layer.texts.clear();
        full = true;
        continue;
      }
      if (layer.dirty.size === 0 && layer.texts.size === 0) continue;
      const dirty = new Set<Element>();
      for (const element of layer.dirty) if (layer.container.contains(element)) dirty.add(this.boxed(layer, element));
      for (const element of layer.texts) {
        if (!layer.container.contains(element)) continue;
        const holder = this.boxed(layer, element);
        const box = boxOfElement(holder);
        if (box === undefined || box["txt"] !== 1 || holder === layer.container) {
          dirty.add(holder);
          continue;
        }
        if (dirty.has(holder)) continue;
        const text = remirrorText(holder, this.report);
        if (text === undefined) {
          dirty.add(holder);
          continue;
        }
        if (JSON.stringify(text) === JSON.stringify(box["t"] ?? null)) continue;
        const previous = box["t"];
        const live = text !== null && typeof text["s"] === "string" && (isFrameBoundElement(element) || this.liveTexts.has(box.id));
        let needsPatch = true;
        if (live) {
          const record = ui.writeText(`text:${box.id}`, String(text["s"]));
          text["live"] = record.slots;
          this.liveTexts.add(box.id);
          if (!record.grew && typeof previous === "object" && previous !== null && "live" in previous && "s" in previous) {
            const { s: _old, ...oldStyle } = previous;
            const { s: _next, ...newStyle } = text;
            needsPatch = JSON.stringify(oldStyle) !== JSON.stringify(newStyle);
          }
          this.stats.slots += 1;
        } else if (this.liveTexts.delete(box.id)) ui.releaseText(`text:${box.id}`);
        if (text === null) delete box["t"];
        else box["t"] = text;
        if (needsPatch) {
          ui.patchText(box.id, text);
          this.stats.texts += 1;
        }
      }
      layer.dirty.clear();
      layer.texts.clear();
      // An element inside another dirty one is covered by it.
      const tops = [...dirty].filter((element) => ![...dirty].some((other) => other !== element && other.contains(element)));
      for (const top of tops) {
        let current = top;
        for (;;) {
          if (current === layer.container) {
            layer.root = mirrorRoot(layer.container, this.report);
            full = true;
            break;
          }
          const previous = boxOfElement(current);
          const shape = previous === undefined ? null : specShape(previous);
          const box = remirrorElement(current, this.report);
          if (box !== null) {
            this.prepareLive(ui, box, previous);
            if (shape !== specShape(box)) patches.push(box);
            else this.stats.slots += 1;
            const present = new Set<number>();
            const remember = (node: WireBox): void => {
              present.add(node.id);
              for (const child of node.c ?? []) remember(child);
            };
            remember(box);
            const releaseRemoved = (node: WireBox): void => {
              if (!present.has(node.id)) this.releaseLive(ui, node.id);
              for (const child of node.c ?? []) releaseRemoved(child);
            };
            if (previous !== undefined) releaseRemoved(previous);
            break;
          }
          current = this.boxed(layer, current.parentElement ?? layer.container);
        }
        if (full) break;
      }
    }
    if (full) {
      this.stale = false;
      const roots = this.layers.map((layer) => layer.root).filter((root): root is WireBox => root !== null);
      ui.setSpec(roots as unknown as RuneUiNode[], false);
      const present = new Set<number>();
      const visit = (box: WireBox): void => {
        present.add(box.id);
        for (const child of box.c ?? []) visit(child);
      };
      for (const root of roots) visit(root);
      for (const id of [...this.liveTexts, ...this.liveStyles.keys()]) if (!present.has(id)) this.releaseLive(ui, id);
      this.stats.full += 1;
    } else if (patches.length > 0) {
      const roots = new Set(this.layers.map((layer) => layer.root).filter((root): root is WireBox => root !== null));
      const replacements = compactPatches(patches, roots, ownerOf);
      ui.patch(replacements as unknown as RuneUiNode[]);
      this.stats.patches += 1;
      this.stats.boxes += replacements.length;
    }
    const elapsed = performance.now() - started;
    this.stats.ms += elapsed;
    this.stats.lastMs = elapsed;
    this.syncCanvases();
  }

  /** Embedded canvases enter Rune's image paint order only when their captured frame changes. */
  private syncCanvases(): void {
    const sources = new Map<HTMLCanvasElement, number>();
    const visit = (box: WireBox): void => {
      if (box["island"] === 1) {
        const source = elementOf(box.id);
        const rect = source === null ? undefined : runeRectOf(source);
        if (source instanceof HTMLCanvasElement && source.width > 0 && source.height > 0 && rect !== undefined && rect[2] > 0 && rect[3] > 0) sources.set(source, box.id);
      }
      for (const child of box.c ?? []) visit(child);
    };
    for (const layer of this.layers) if (layer.root !== null) visit(layer.root);
    for (const [source, feed] of this.canvasFeeds) if (!sources.has(source)) {
      feed.stop();
      this.canvasFeeds.delete(source);
    }
    for (const [source, id] of sources) if (!this.canvasFeeds.has(source)) {
      try {
        const stream = source.captureStream();
        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        let stopped = false;
        let stopFrames = (): void => {};
        const stop = (): void => {
          if (stopped) return;
          stopped = true;
          stopFrames();
          for (const track of stream.getTracks()) track.stop();
          video.onerror = null;
          video.srcObject = null;
          this.ui?.removeCanvas(id);
        };
        video.onerror = () => {
          const error = video.error ?? new Error("embedded canvas playback failed");
          stop();
          this.fail(error);
        };
        const feed = { stop, received: false, streamed: false };
        stopFrames = watchVideoFrames(video, frame => {
          this.ui?.canvasFrame(id, frame);
          feed.received = true;
          feed.streamed = true;
        }, error => {
          stop();
          this.fail(error);
        });
        if (!stopped) {
          this.canvasFeeds.set(source, feed);
          this.ui?.canvasFrame(id, source);
          feed.received = true;
          const track = stream.getVideoTracks()[0];
          if (track === undefined || !("requestFrame" in track) || typeof track.requestFrame !== "function") throw new Error("canvas stream cannot request its initial frame");
          track.requestFrame();
        }
      } catch (error) {
        this.fail(error);
        return;
      }
    }
  }

  private stopCanvases(): void {
    for (const feed of this.canvasFeeds.values()) feed.stop();
    this.canvasFeeds.clear();
  }

  private scrollTo(element: Element, x: number, y: number, smooth: boolean): void {
    const box = boxOfElement(element);
    if (this.ui !== null && box !== undefined) this.ui.scrollTo(box.id, x, y, smooth);
    else this.scrollRequests.set(element, { x, y, smooth });
  }

  private onEvent(event: RuneUiEvent): void {
    if (event.id === "__spec__") {
      // Rune kept its old tree: say so, and send every layer again from the top.
      const cause = `${event.kind}: ${event.text ?? "unknown error"}`;
      console.error(`degraded: Rune refused a UI update (${cause}); sending the whole tree again`);
      this.errors.push(cause);
      if (this.errors.length > 20) this.errors.shift();
      if (this.errors.filter((seen) => seen === cause).length <= 3) this.remirror();
      return;
    }
    if (!event.id.startsWith("x")) return;
    const element = elementOf(Number(event.id.slice(1)));
    if (element === null) return;
    if (event.kind === "scroll" && event.scroll !== undefined) {
      setRuneScroll(element, event.scroll);
      return;
    }
    if (event.kind === "edit" && typeof event.text === "string") {
      const field = element as HTMLInputElement;
      if (field.value === event.text) return;
      const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(field, event.text);
      field.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
      return;
    }
    if (event.kind === "submit") {
      element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
      (element as HTMLInputElement).form?.requestSubmit();
    }
  }
}
