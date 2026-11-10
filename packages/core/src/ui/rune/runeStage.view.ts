/**
 * The page's Rune stage: one Rune canvas over the game, drawing every mounted
 * {@link RuneLayer}. A layer is an undisplayed DOM subtree; the stage watches it
 * for changes, mirrors it to Rune CSS boxes and sends events from Rune back to
 * its elements as ordinary DOM events.
 *
 * Nothing here runs per frame. A layer is mirrored again only when its DOM
 * changed (a component re-rendered) or the viewport resized.
 */

import { RuneUi, type RuneUiEvent, type RuneUiNode } from "../runeUi.view";
import { MirrorReport, elementOf, idOf, mirrorContents, type WireBox } from "./cssMirror.view";
import { installRuneMeasure, runeRectOf, setRuneRect } from "./domMeasure.view";

interface Layer {
  container: HTMLElement;
  observer: MutationObserver;
  order: number;
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
  private lastJson = "";
  private layerCount = 0;
  private readonly islands = new Map<HTMLCanvasElement, HTMLCanvasElement>();
  private islandHost: HTMLDivElement | null = null;
  private islandRaf = 0;
  /** Milliseconds the last mirror pass took, and how many it has run: read by perf probes. */
  stats = { passes: 0, lastMs: 0, totalMs: 0, boxes: 0 };

  private constructor() {
    installRuneMeasure();
    window.addEventListener("resize", () => this.invalidate());
    (window as { __jgRuneStage?: RuneStage }).__jgRuneStage = this;
  }

  /** Start mirroring `container`'s children; returns the detach function. */
  attach(container: HTMLElement): () => void {
    const observer = new MutationObserver(() => this.invalidate());
    observer.observe(container, { subtree: true, childList: true, attributes: true, characterData: true });
    this.layerCount += 1;
    const layer: Layer = { container, observer, order: this.layerCount };
    this.layers.push(layer);
    this.invalidate();
    return () => {
      observer.disconnect();
      const at = this.layers.indexOf(layer);
      if (at !== -1) this.layers.splice(at, 1);
      this.invalidate();
    };
  }

  /** Mirror again before the next frame; many calls in one task make one pass. */
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
    this.lastJson = "";
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
        this.lastJson = "";
        this.sync();
      })
      .catch((error: unknown) => {
        this.creating = false;
        console.error("degraded: the Rune UI layer failed to mount", error);
      });
  }

  private sync(): void {
    if (this.layers.length === 0 && this.ui === null) return;
    this.ensureUi();
    if (this.ui === null) return;
    const started = performance.now();
    const roots: WireBox[] = [];
    let boxes = 0;
    for (const layer of this.layers) {
      const children: WireBox[] = [];
      children.push(...mirrorContents(layer.container, this.report, { positioned: children }));
      roots.push({ k: "x", id: idOf(layer.container), pos: 2, ins: [0, 0, 0, 0], d: 1, c: children });
    }
    const json = JSON.stringify(roots);
    boxes = (json.match(/"k":"x"/g) ?? []).length;
    const elapsed = performance.now() - started;
    this.stats.passes += 1;
    this.stats.lastMs = elapsed;
    this.stats.totalMs += elapsed;
    this.stats.boxes = boxes;
    if (json === this.lastJson) return;
    this.lastJson = json;
    this.ui.setSpec(roots as unknown as RuneUiNode[], false);
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
