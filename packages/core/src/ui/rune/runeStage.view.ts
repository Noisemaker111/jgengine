/**
 * The page's Rune stage: one Rune canvas over the game, drawing every mounted
 * {@link RuneLayer}. A layer is an undisplayed DOM subtree; the stage watches it
 * for changes, mirrors it to Rune CSS boxes and sends events from Rune back to
 * its elements as ordinary DOM events.
 *
 * Nothing here runs per frame. What a change costs follows what changed: text
 * that moved replaces one box's text with no style read; an element whose class
 * or style changed is mirrored again with its subtree; only a resize or a new
 * layer mirrors a whole layer.
 */

import { RuneUi, type RuneUiEvent, type RuneUiNode } from "../runeUi.view";
import { MirrorReport, boxOfElement, elementOf, mirrorRoot, remirrorElement, remirrorText, type WireBox } from "./cssMirror.view";
import { installRuneMeasure, runeRectOf, setRuneRect } from "./domMeasure.view";

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

export class RuneStage {
  /** The page's stage, made on first use. */
  static get(): RuneStage {
    if (stage === null) stage = new RuneStage();
    return stage;
  }

  readonly report = new MirrorReport();
  private readonly layers: Layer[] = [];
  private ui: RuneUi | null = null;
  private creating = false;
  private queued = false;
  private mountedFonts = "";
  /** The whole tree must be sent again (a layer came or went, Rune remounted). */
  private stale = true;
  private readonly islands = new Map<HTMLCanvasElement, HTMLCanvasElement>();
  private islandHost: HTMLDivElement | null = null;
  private islandRaf = 0;
  /** What the mirror has done and what it cost, for perf probes: passes by kind, boxes built, milliseconds. */
  stats = { full: 0, patches: 0, texts: 0, boxes: 0, ms: 0, lastMs: 0 };

  private constructor() {
    installRuneMeasure();
    window.addEventListener("resize", () => {
      for (const layer of this.layers) layer.root = null;
      this.invalidate();
    });
    (window as { __jgRuneStage?: RuneStage }).__jgRuneStage = this;
  }

  /** Start mirroring `container`'s children; returns the detach function. */
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

  fontsChanged(): void {
    if (this.ui === null) return;
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
        ui.on("*", (event) => this.onEvent(event));
        ui.onRects = (moved) => {
          for (const [id, x, y, w, h] of moved) {
            const element = elementOf(id);
            if (element !== null) setRuneRect(element, [x, y, w, h]);
          }
          this.placeIslands();
        };
        this.stale = true;
        this.sync();
      })
      .catch((error: unknown) => {
        this.creating = false;
        console.error("degraded: the Rune UI layer failed to mount", error);
      });
  }

  private onMutations(layer: Layer, records: MutationRecord[]): void {
    for (const record of records) {
      const target = record.target;
      if (record.type === "characterData") {
        if (target.parentElement !== null) layer.texts.add(target.parentElement);
        continue;
      }
      if (record.type === "attributes") {
        const name = record.attributeName;
        if (name === null || (target as Element).getAttribute(name) === record.oldValue) continue;
        layer.dirty.add(target as Element);
        continue;
      }
      let onlyText = true;
      for (const node of record.addedNodes) if (node.nodeType !== 3) onlyText = false;
      for (const node of record.removedNodes) if (node.nodeType !== 3) onlyText = false;
      if (onlyText) layer.texts.add(target as Element);
      else layer.dirty.add(target as Element);
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
        if (text === null) delete box["t"];
        else box["t"] = text;
        ui.patchText(box.id, text);
        this.stats.texts += 1;
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
          const box = remirrorElement(current, this.report);
          if (box !== null) {
            patches.push(box);
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
      this.stats.full += 1;
    } else if (patches.length > 0) {
      ui.patch(patches as unknown as RuneUiNode[]);
      this.stats.patches += 1;
      this.stats.boxes += patches.length;
    }
    const elapsed = performance.now() - started;
    this.stats.ms += elapsed;
    this.stats.lastMs = elapsed;
  }

  /**
   * A `<canvas>` inside a layer is never displayed, so each gets a visible copy placed where Rune
   * laid it out, redrawn from the original every frame while any exist. The copies sit above the
   * Rune canvas: Rune content meant to overlap a canvas draws under it (a known gap).
   */
  private placeIslands(): void {
    const sources: HTMLCanvasElement[] = [];
    for (const layer of this.layers) sources.push(...layer.container.querySelectorAll("canvas"));
    for (const [source, copy] of this.islands) {
      if (!sources.includes(source)) {
        copy.remove();
        this.islands.delete(source);
      }
    }
    if (sources.length === 0) return;
    if (this.islandHost === null) {
      this.islandHost = document.createElement("div");
      this.islandHost.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:41;overflow:hidden";
      this.islandHost.dataset["jgRuneIslands"] = "";
      document.body.appendChild(this.islandHost);
    }
    for (const source of sources) {
      const rect = runeRectOf(source);
      let copy = this.islands.get(source);
      if (rect === undefined || rect[2] <= 0 || rect[3] <= 0) {
        if (copy !== undefined) copy.style.display = "none";
        continue;
      }
      if (copy === undefined) {
        copy = document.createElement("canvas");
        copy.style.position = "absolute";
        this.islandHost.appendChild(copy);
        this.islands.set(source, copy);
      }
      copy.style.display = "block";
      copy.style.left = `${rect[0]}px`;
      copy.style.top = `${rect[1]}px`;
      copy.style.width = `${rect[2]}px`;
      copy.style.height = `${rect[3]}px`;
      copy.style.borderRadius = getComputedStyle(source).borderRadius;
    }
    if (this.islandRaf === 0) this.islandRaf = requestAnimationFrame(this.copyIslands);
  }

  private readonly copyIslands = (): void => {
    this.islandRaf = 0;
    if (this.islands.size === 0) return;
    for (const [source, copy] of this.islands) {
      if (copy.style.display === "none" || source.width === 0 || source.height === 0) continue;
      if (copy.width !== source.width) copy.width = source.width;
      if (copy.height !== source.height) copy.height = source.height;
      const context = copy.getContext("2d");
      if (context === null) continue;
      context.clearRect(0, 0, copy.width, copy.height);
      context.drawImage(source, 0, 0);
    }
    this.islandRaf = requestAnimationFrame(this.copyIslands);
  };

  private onEvent(event: RuneUiEvent): void {
    if (event.id === "__spec__") {
      console.error(`degraded: Rune refused the UI tree: ${event.text ?? "unknown error"}`);
      return;
    }
    if (!event.id.startsWith("x")) return;
    const element = elementOf(Number(event.id.slice(1)));
    if (element === null) return;
    if (event.kind === "click") {
      if ((element as HTMLButtonElement).disabled === true) return;
      const rect = this.ui?.rects.get(Number(event.id.slice(1)));
      const x = rect === undefined ? 0 : rect[0] + rect[2] / 2;
      const y = rect === undefined ? 0 : rect[1] + rect[3] / 2;
      const init: PointerEventInit = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, pointerId: 1, pointerType: "mouse", isPrimary: true };
      element.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
      element.dispatchEvent(new MouseEvent("mousedown", { ...init, buttons: 1 }));
      element.dispatchEvent(new PointerEvent("pointerup", init));
      element.dispatchEvent(new MouseEvent("mouseup", init));
      element.dispatchEvent(new MouseEvent("click", init));
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
