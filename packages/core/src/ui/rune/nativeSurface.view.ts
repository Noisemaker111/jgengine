import { RuneUi, type RuneUiEvent } from "../runeUi.view";
import { RuneNode, nativeLabel, nativeSpec, visibleNativeNodes, type RuneTreeSink } from "./nativeTree";
import { menuIntentForKey, menuIntentForPadButton, menuIntentForPadAxis, menuNavMove, shouldRepeatMenuNav, type MenuIntent } from "../../menu/menuNav";

const surfaces = new Map<RuneNode, NativeSurface>();
const fontUrls = new Set<string>();
let mounting: Promise<void> = Promise.resolve();

/** Register native font bytes before the first surface mounts. */
export function registerNativeRuneFont(url: string): void { fontUrls.add(url); }

/** Called by the JSX host once per commit; it never observes or measures DOM. @internal */
export function syncNativeSurface(root: RuneNode): void {
  if (!root.connected || root.tag !== "rune-surface") return;
  let surface = surfaces.get(root);
  if (surface === undefined) {
    if ([...surfaces.keys()].some(node => node.connected)) throw new Error("Rune supports one native surface per page; compose overlays inside it");
    surface = new NativeSurface(root);
    surfaces.set(root, surface);
  }
  surface.sync();
}

/** Release a detached native tree and all its listeners/slots. @internal */
export function removeNativeSurface(root: RuneNode): void {
  surfaces.get(root)?.destroy();
  surfaces.delete(root);
}

class NativeSurface {
  private ui: RuneUi | null = null;
  private dead = false;
  private readonly bound = new Set<string>();
  private readonly texts = new Map<string, () => string>();
  private raf = 0;
  private readonly cleanups: (() => void)[] = [];
  private specs = 0;
  private modal = false;
  private padFrame = 0;
  private padIntent: MenuIntent | null = null;
  private padPressedAt = 0;
  private padLastFiredAt: number | null = null;

  constructor(private readonly root: RuneNode) {
    mounting = mounting.then(async () => {
      if (this.dead) return;
      const ui = await RuneUi.create({ fonts: [...fontUrls] });
      if (this.dead) { ui.destroy(); return; }
      this.ui = ui;
      ui.on("*", event => this.event(event));
      root.onFocus = node => {
        node.props.onFocus?.();
        document.getElementById("jg-ui")?.setAttribute("aria-label", nativeLabel(node));
        root.dirty = true;
        this.sync();
      };
      root.onScroll = node => ui.scrollNativeIntoView(node.id);
      this.sync();
    }).catch((error: unknown) => {
      console.error("degraded: native Rune UI could not start", error);
      window.dispatchEvent(new ErrorEvent("error", { message: `Native Rune UI: ${String(error)}`, error }));
    });
    const key = (event: KeyboardEvent) => this.key(event);
    window.addEventListener("keydown", key, true);
    this.cleanups.push(() => window.removeEventListener("keydown", key, true));
    const padsChanged = () => this.pollPad();
    window.addEventListener("gamepadconnected", padsChanged);
    this.cleanups.push(() => window.removeEventListener("gamepadconnected", padsChanged));
    const tick = () => {
      if (this.dead) return;
      let grew = false;
      for (const [name, read] of this.texts) if (this.ui?.writeText(name, read()).grew) grew = true;
      if (grew) { this.root.dirty = true; this.sync(); }
      if (this.texts.size > 0) this.raf = requestAnimationFrame(tick);
      else this.raf = 0;
    };
    this.startTexts = () => { if (this.raf === 0 && this.texts.size > 0) this.raf = requestAnimationFrame(tick); };
    const debug = {
      tree: () => this.root,
      stats: () => ({ specs: this.specs, ...this.ui?.stats }),
      text: () => this.visibleNodes().filter(node => node.tag === "rune-text").map(nativeLabel).join("\n"),
      point: (label: string) => {
        const wanted = label.toLowerCase();
        const node = this.visibleNodes().filter(node => !node.props.disabled && node.props.onPress !== undefined && nativeLabel(node).toLowerCase().includes(wanted))
          .sort((a,b) => nativeLabel(a).length - nativeLabel(b).length)[0];
        if (node === undefined || this.ui === null) return null;
        const rect = this.ui.nativeRects.get(node.id);
        if (rect === undefined) return null;
        let [left,top,w,h] = rect;
        let right = Math.min(window.innerWidth,left + w), bottom = Math.min(window.innerHeight,top + h);
        left = Math.max(0,left); top = Math.max(0,top);
        for (let parent = node.parent; parent !== null; parent = parent.parent) {
          if (!parent.props.scroll && !parent.props.clip) continue;
          const clip = this.ui.nativeRects.get(parent.id);
          if (clip === undefined) return null;
          left = Math.max(left,clip[0]); top = Math.max(top,clip[1]);
          right = Math.min(right,clip[0] + clip[2]); bottom = Math.min(bottom,clip[1] + clip[3]);
        }
        if (right <= left || bottom <= top) { node.scrollIntoView(); return null; }
        return { x: (left + right) / 2, y: (top + bottom) / 2 };
      },
      press: (label: string) => {
        const node = this.visibleNodes().find(node => node.props.onPress !== undefined && nativeLabel(node) === label);
        if (node === undefined || node.props.disabled) throw new Error(`Native UI control unavailable: ${label}`);
        node.props.onPress?.();
      },
    };
    window.__jgNativeUi = debug;
    this.cleanups.push(() => { if (window.__jgNativeUi === debug) delete window.__jgNativeUi; });
  }

  private readonly startTexts: () => void;

  sync(): void {
    const ui = this.ui;
    if (ui === null || !this.root.dirty) return;
    const nextBound = new Set<string>();
    const nextTexts = new Map<string, () => string>();
    const sink: RuneTreeSink = {
      setSpec: () => {},
      bindNumber: (name, read) => { nextBound.add(name); return ui.bind(name, read); },
      writeNumber: (name, value) => { nextBound.add(name); ui.write(name, value); return ui.slot(name); },
      bindText: (name, read) => {
        nextTexts.set(name, read);
        return ui.writeText(name, read()).slots;
      },
    };
    const spec = nativeSpec(this.root, sink);
    this.modal = spec.modal;
    for (const name of this.bound) if (!nextBound.has(name)) ui.releaseSlot(name);
    for (const name of this.texts.keys()) if (!nextTexts.has(name)) ui.releaseText(name);
    this.bound.clear();
    for (const name of nextBound) this.bound.add(name);
    this.texts.clear();
    for (const [name, read] of nextTexts) this.texts.set(name, read);
    ui.setSpec(spec.children.map(node => ({ ...node })), spec.modal);
    this.specs += 1;
    this.root.dirty = false;
    this.startTexts();
    this.pollPad();
  }

  private pollPad(): void {
    if (this.dead || this.padFrame !== 0 || !this.modal || typeof navigator.getGamepads !== "function") return;
    const pads = navigator.getGamepads();
    const pad = [...pads].find(candidate => candidate !== null && candidate.connected);
    if (pad === undefined || pad === null) return;
    let intent: MenuIntent | null = null;
    for (let index = 0; index < pad.buttons.length; index += 1) {
      if (pad.buttons[index]?.pressed) { intent = menuIntentForPadButton(index); if (intent !== null) break; }
    }
    intent ??= menuIntentForPadAxis(0, pad.axes[0] ?? 0) ?? menuIntentForPadAxis(1, pad.axes[1] ?? 0);
    const now = performance.now();
    const first = intent !== this.padIntent;
    if (first) { this.padIntent = intent; this.padPressedAt = now; this.padLastFiredAt = now; }
    if (intent !== null && (first || ((intent !== "confirm" && intent !== "back") && shouldRepeatMenuNav(now, { pressedAt: this.padPressedAt, lastFiredAt: this.padLastFiredAt }, {})))) {
      this.padLastFiredAt = now;
      const code = intent === "confirm" ? "Enter" : intent === "back" ? "Escape" : intent === "up" ? "ArrowUp" : intent === "down" ? "ArrowDown" : intent === "left" ? "ArrowLeft" : "ArrowRight";
      this.key(new KeyboardEvent("keydown", { code }));
    }
    this.padFrame = requestAnimationFrame(() => { this.padFrame = 0; this.pollPad(); });
  }

  private visibleNodes(): RuneNode[] {
    return visibleNativeNodes(this.root);
  }

  private event(event: RuneUiEvent): void {
    if (event.kind === "error") {
      const error = new Error(`Native Rune UI: ${event.text ?? "unknown native error"}`);
      console.error("degraded: native Rune UI rejected its tree", error);
      window.dispatchEvent(new ErrorEvent("error", { message: error.message, error }));
      return;
    }
    const node = this.visibleNodes().find(node => node.id === event.id);
    if (node === undefined || node.props.disabled) return;
    if (event.kind === "press") { node.focus(); node.props.onPress?.(); }
    if (event.kind === "hover") node.focus();
    if (event.kind === "slider" && event.value !== undefined) node.props.onValue?.(event.value);
    if (event.kind === "commit" && event.value !== undefined) node.props.onCommit?.(event.value);
    if (event.kind === "edit" && event.text !== undefined) node.props.onEdit?.(event.text);
  }

  private key(event: KeyboardEvent): void {
    const nodes = this.visibleNodes();
    const capture = [...nodes].reverse().find(node => node.props.onKey !== undefined);
    if (capture !== undefined) { event.preventDefault(); event.stopImmediatePropagation(); capture.props.onKey?.(event.code); return; }
    if (event.code === "Escape") {
      const close = [...nodes].reverse().find(node => node.props.onBack !== undefined);
      if (close === undefined) { if (this.modal) { event.preventDefault(); event.stopImmediatePropagation(); } return; }
      event.preventDefault(); event.stopImmediatePropagation(); close.props.onBack?.(); return;
    }
    if (!this.modal) return;
    const controls = nodes.filter(node => !node.props.disabled && (node.props.onPress !== undefined || node.props.onValue !== undefined || node.props.onCommit !== undefined));
    if (controls.length === 0) return;
    let index = controls.findIndex(node => node === this.root.focused);
    const intent = menuIntentForKey(event.code);
    if (event.code === "Tab" || intent === "down" || intent === "up" || intent === "first" || intent === "last") {
      event.preventDefault(); event.stopImmediatePropagation();
      const direction = event.code === "Tab" ? event.shiftKey ? "up" : "down" : intent === "first" || intent === "last" || intent === "up" ? intent : "down";
      const nextIndex = index < 0 && direction === "down" ? 0 : menuNavMove(index, direction, { count: controls.length });
      const next = controls[nextIndex];
      next?.focus(); next?.scrollIntoView();
    } else if (intent === "confirm") {
      event.preventDefault(); event.stopImmediatePropagation();
      if (index < 0) index = 0;
      controls[index]?.props.onPress?.();
    } else if (intent === "left" || intent === "right") {
      event.preventDefault(); event.stopImmediatePropagation();
      controls[Math.max(0,index)]?.props.onAdjust?.(intent === "left" ? -1 : 1);
    } else {
      event.stopImmediatePropagation();
    }
  }

  destroy(): void {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this.padFrame);
    for (const cleanup of this.cleanups) cleanup();
    this.root.onFocus = null;
    this.root.onScroll = null;
    this.ui?.destroy();
  }
}

declare global {
  interface Window {
    __jgNativeUi?: { tree(): RuneNode; stats(): object; text(): string; point(label: string): { x: number; y: number } | null; press(label: string): void };
  }
}
