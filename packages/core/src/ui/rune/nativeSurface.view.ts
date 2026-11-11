import { RuneUi, type RuneUiEvent } from "../runeUi.view";
import { RuneNode, nativeEnabled, nativeLabel, nativeSpec, visibleNativeNodes, type RuneTreeSink } from "./nativeTree";
import { menuIntentForKey, menuIntentForPadButton, menuIntentForPadAxis, menuNavMove, shouldRepeatMenuNav, type MenuIntent } from "../../menu/menuNav";
import { RuneActivation, runeNextFocus } from "./activation";

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

/**
 * Where a key goes while a native field may own the keyboard: the field itself (Rune reads it from
 * its canvas or the phone proxy), out of the field (Escape), or out and on to navigation (Tab).
 * `null` when no field is being edited. It is checked before captures, back and menu navigation.
 * @internal
 */
/** The first visible, enabled `autoFocus` field not focused this way before; marks it seen. @internal */
export function nextAutoFocusField(nodes: readonly RuneNode[], seen: WeakSet<RuneNode>): RuneNode | null {
  const field = nodes.find(node => node.tag === "rune-field" && node.props.autoFocus === true && nativeEnabled(node) && !seen.has(node));
  if (field === undefined) return null;
  seen.add(field);
  return field;
}

export function nativeFieldKey(code: string, editing: boolean): "field" | "leave" | "leave-navigate" | null {
  if (!editing) return null;
  if (code === "Escape") return "leave";
  if (code === "Tab") return "leave-navigate";
  return "field";
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
  private readonly props = new Map<string, { id: string; field: string; read: () => unknown; last: string | undefined }>();
  private raf = 0;
  private readonly cleanups: (() => void)[] = [];
  private specs = 0;
  private modal = false;
  private padFrame = 0;
  private padIntent: MenuIntent | null = null;
  private padPressedAt = 0;
  private padLastFiredAt: number | null = null;
  private readonly activation = new RuneActivation(() => performance.now());
  private keyHeld: RuneNode | undefined;
  /** The native field that owns the keyboard, if any. */
  private editing: RuneNode | null = null;
  private readonly autoFocused = new WeakSet<RuneNode>();
  /** Offscreen input that raises the phone keyboard for {@link editing} on touch devices. */
  private proxy: HTMLInputElement | HTMLTextAreaElement | null = null;

  constructor(private readonly root: RuneNode) {
    mounting = mounting.then(async () => {
      if (this.dead) return;
      const ui = await RuneUi.create({ fonts: [...fontUrls] });
      if (this.dead) { ui.destroy(); return; }
      this.ui = ui;
      ui.on("*", event => this.event(event));
      // Rune reads a field's keys on its canvas; stop them there so window hotkeys stay quiet.
      const contain = (event: KeyboardEvent) => { if (this.editing !== null) event.stopPropagation(); };
      ui.surfaceCanvas.addEventListener("keydown", contain);
      ui.surfaceCanvas.addEventListener("keyup", contain);
      this.cleanups.push(() => { ui.surfaceCanvas.removeEventListener("keydown", contain); ui.surfaceCanvas.removeEventListener("keyup", contain); });
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
    const release = (event: KeyboardEvent) => { if (menuIntentForKey(event.code) === "confirm") this.releaseKey(); };
    const cancel = () => { this.activation.cancel(); this.keyHeld = undefined; };
    window.addEventListener("keyup", release, true);
    window.addEventListener("blur", cancel);
    this.cleanups.push(() => { window.removeEventListener("keyup", release, true); window.removeEventListener("blur", cancel); });
    const padsChanged = () => this.pollPad();
    window.addEventListener("gamepadconnected", padsChanged);
    this.cleanups.push(() => window.removeEventListener("gamepadconnected", padsChanged));
    const tick = () => {
      if (this.dead) return;
      let grew = false;
      for (const [name, read] of this.texts) if (this.ui?.writeText(name, read()).grew) grew = true;
      if (grew) { this.root.dirty = true; this.sync(); }
      const patches: { id: string; field: string; value: unknown }[] = [];
      for (const bound of this.props.values()) {
        const value = bound.read(), next = JSON.stringify(value);
        if (bound.last !== next) { patches.push({ id: bound.id, field: bound.field, value }); bound.last = next; }
      }
      this.ui?.patchNative(patches);
      if (this.texts.size > 0 || this.props.size > 0) this.raf = requestAnimationFrame(tick);
      else this.raf = 0;
    };
    this.startTexts = () => { if (this.raf === 0 && (this.texts.size > 0 || this.props.size > 0)) this.raf = requestAnimationFrame(tick); };
    const debug = {
      tree: () => this.root,
      stats: () => ({ specs: this.specs, ...this.ui?.stats }),
      text: () => this.visibleNodes().filter(node => node.tag === "rune-text").map(nativeLabel).join("\n"),
      point: (label: string) => {
        const wanted = label.toLowerCase();
        const node = this.visibleNodes().filter(node => nativeEnabled(node) && node.props.onPress !== undefined && nativeLabel(node).toLowerCase().includes(wanted))
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
        if (node === undefined || !nativeEnabled(node)) throw new Error(`Native UI control unavailable: ${label}`);
        if ((node.props.holdMs ?? 0) > 0) throw new Error(`Native UI control needs a real hold: ${label}`);
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
    const nextProps = new Map<string, { id: string; field: string; read: () => unknown; last: string | undefined }>();
    const sink: RuneTreeSink = {
      setSpec: () => {},
      bindNumber: (name, read) => { nextBound.add(name); return ui.bind(name, read); },
      writeNumber: (name, value) => { nextBound.add(name); ui.write(name, value); return ui.slot(name); },
      bindText: (name, read) => {
        nextTexts.set(name, read);
        return ui.writeText(name, read()).slots;
      },
      bindProp: (id, field, read) => {
        const value = read();
        nextProps.set(`${id}:${field}`, { id, field, read, last: JSON.stringify(value) });
        return value;
      },
    };
    const spec = nativeSpec(this.root, sink);
    const released = this.modal && !spec.modal;
    this.modal = spec.modal;
    for (const name of this.bound) if (!nextBound.has(name)) ui.releaseSlot(name);
    for (const name of this.texts.keys()) if (!nextTexts.has(name)) ui.releaseText(name);
    this.bound.clear();
    for (const name of nextBound) this.bound.add(name);
    this.texts.clear();
    for (const [name, read] of nextTexts) this.texts.set(name, read);
    this.props.clear();
    for (const [name, bound] of nextProps) this.props.set(name, bound);
    ui.setSpec(spec.children.map(node => ({ ...node })), spec.modal);
    this.specs += 1;
    this.root.dirty = false;
    this.startTexts();
    this.pollPad();
    if (released) this.restorePlayFocus();
    this.autoFocusFields();
  }

  /** A field marked `autoFocus` takes the keyboard the first time it appears (chat opened by Enter). */
  private autoFocusFields(): void {
    const field = nextAutoFocusField(this.visibleNodes(), this.autoFocused);
    if (field !== null && this.editing !== field) this.enterField(field, true);
  }

  private restorePlayFocus(): void {
    queueMicrotask(() => {
      if (this.dead || this.modal) return;
      const active = document.activeElement;
      if (active === null || active === document.body || active.id === "jg-ui") document.querySelector<HTMLElement>("[data-jg-play-surface]")?.focus({preventScroll:true});
    });
  }

  private pollPad(): void {
    if (this.dead || this.padFrame !== 0 || !this.modal || typeof navigator.getGamepads !== "function") return;
    const pads = navigator.getGamepads();
    const pad = [...pads].find(candidate => candidate !== null && candidate.connected);
    if (pad === undefined || pad === null) { this.keyHeld = undefined; this.activation.cancel(); this.padIntent = null; return; }
    let intent: MenuIntent | null = null;
    for (let index = 0; index < pad.buttons.length; index += 1) {
      if (pad.buttons[index]?.pressed) { intent = menuIntentForPadButton(index); if (intent !== null) break; }
    }
    intent ??= menuIntentForPadAxis(0, pad.axes[0] ?? 0) ?? menuIntentForPadAxis(1, pad.axes[1] ?? 0);
    const now = performance.now();
    const first = intent !== this.padIntent;
    if (first && this.padIntent === "confirm") this.releaseKey();
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
    if (event.kind === "blur" && this.editing !== null && this.editing.id === event.id) {
      // The phone proxy taking DOM focus blurs Rune's canvas; the proxy still owns the field.
      if (this.proxy === null || document.activeElement !== this.proxy) this.leaveField(false);
      return;
    }
    if (node === undefined || !nativeEnabled(node)) return;
    if (event.kind === "focus" && node.tag === "rune-field") { this.enterField(node, false); return; }
    if (event.kind === "submit") { node.props.onSubmit?.(event.text ?? ""); return; }
    if (event.kind === "press") { node.focus(); node.props.onPress?.(); }
    if (event.kind === "hover") node.focus();
    if (event.kind === "hover" || event.kind === "leave") node.props.onHover?.(event.kind === "hover");
    if (event.kind === "drag" && event.text !== undefined) {
      const gesture: unknown = JSON.parse(event.text);
      if (typeof gesture !== "object" || gesture === null || !("phase" in gesture) || !("x" in gesture) || !("y" in gesture) || !("width" in gesture) || !("height" in gesture) || !("cancelled" in gesture)) throw new Error("Invalid native gesture");
      if ((gesture.phase === "down" || gesture.phase === "move" || gesture.phase === "up") && typeof gesture.x === "number" && typeof gesture.y === "number" && typeof gesture.width === "number" && typeof gesture.height === "number" && typeof gesture.cancelled === "boolean") {
        if (gesture.phase === "down") { node.focus(); this.activation.begin(node.id,node.props.holdMs); }
        if (gesture.phase === "up") {
          const inside = gesture.x >= 0 && gesture.y >= 0 && gesture.x <= gesture.width && gesture.y <= gesture.height;
          if (this.activation.end(node.id,gesture.cancelled || !inside)) node.props.onPress?.();
          if (!gesture.cancelled && node.props.dragValue !== undefined) {
            const rect = this.ui?.nativeRects.get(node.id);
            if (rect !== undefined) {
              const x = rect[0] + gesture.x, y = rect[1] + gesture.y;
              const target = this.visibleNodes().reverse().find(candidate => {
                const r = this.ui?.nativeRects.get(candidate.id);
                return candidate.props.onDrop !== undefined && nativeEnabled(candidate) && r !== undefined && x >= r[0] && x <= r[0]+r[2] && y >= r[1] && y <= r[1]+r[3];
              });
              target?.props.onDrop?.(node.props.dragValue);
            }
          }
        }
        node.props.onDrag?.({ phase: gesture.phase, x: gesture.x, y: gesture.y, width: gesture.width, height: gesture.height, cancelled: gesture.cancelled });
      }
    }
    if (event.kind === "slider" && event.value !== undefined) node.props.onValue?.(event.value);
    if (event.kind === "commit" && event.value !== undefined) node.props.onCommit?.(event.value);
    if (event.kind === "edit" && event.text !== undefined) node.props.onEdit?.(event.text);
    if (event.kind === "press" || event.kind === "drag") this.restorePlayFocus();
  }

  private releaseKey(): void {
    const node = this.keyHeld;
    this.keyHeld = undefined;
    if (node !== undefined && this.activation.end(node.id) && this.visibleNodes().includes(node) && nativeEnabled(node)) node.props.onPress?.();
  }

  /** Give `node` the keyboard. `ask`: the page chose it (keyboard or pad), so Rune focuses it too. */
  private enterField(node: RuneNode, ask: boolean): void {
    this.editing = node;
    if (this.root.focused !== node) node.focus();
    const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    if (coarse) { this.raiseKeyboard(node); if (ask) this.ui?.focusNative(node.id); return; }
    this.ui?.surfaceCanvas.focus({ preventScroll: true });
    if (ask) this.ui?.focusNative(node.id);
  }

  /** Leave the edited field. `tell`: Rune still thinks it has focus (Escape, Tab, the proxy closing). */
  private leaveField(tell = true): void {
    if (this.editing === null) return;
    this.editing = null;
    const proxy = this.proxy;
    this.proxy = null;
    proxy?.remove();
    if (tell) this.ui?.focusNative(null);
    this.restorePlayFocus();
  }

  /**
   * Phones show their keyboard only for a focused DOM text input, so a touch device edits through one
   * offscreen proxy: its text replaces the field's and its send key submits. Loader boundary only.
   */
  private raiseKeyboard(node: RuneNode): void {
    const multi = node.props.multiline === true;
    this.proxy?.remove();
    const proxy = document.createElement(multi ? "textarea" : "input");
    if (proxy instanceof HTMLInputElement) proxy.type = node.props.secret === true ? "password" : "text";
    proxy.setAttribute("aria-label", nativeLabel(node) || node.props.placeholder || "Text");
    proxy.setAttribute("autocapitalize", "off");
    proxy.setAttribute("autocomplete", "off");
    proxy.setAttribute("enterkeyhint", multi ? "enter" : "send");
    proxy.inputMode = "text";
    proxy.spellcheck = false;
    proxy.value = node.props.value ?? "";
    Object.assign(proxy.style, { position: "fixed", left: "0", bottom: "0", width: "1px", height: "1px", opacity: "0", pointerEvents: "none", fontSize: "16px" });
    proxy.addEventListener("input", () => { if (this.proxy === proxy) this.editing?.props.onReplace?.(proxy.value); });
    proxy.addEventListener("keydown", event => {
      event.stopPropagation();
      if (!(event instanceof KeyboardEvent)) return;
      if (event.key === "Enter" && !multi) { event.preventDefault(); this.editing?.props.onSubmit?.(proxy.value); }
    });
    proxy.addEventListener("blur", () => { if (this.proxy === proxy) this.leaveField(); });
    document.body.append(proxy);
    this.proxy = proxy;
    proxy.focus({ preventScroll: true });
  }

  private key(event: KeyboardEvent): void {
    const route = nativeFieldKey(event.code, this.editing !== null);
    if (route === "field") return;
    if (route !== null) {
      this.leaveField();
      if (route === "leave") { event.preventDefault(); event.stopImmediatePropagation(); return; }
    }
    const nodes = this.visibleNodes();
    const capture = [...nodes].reverse().find(node => nativeEnabled(node) && node.props.onKey !== undefined);
    if (capture !== undefined) { event.preventDefault(); event.stopImmediatePropagation(); capture.props.onKey?.(event.code); return; }
    if (event.code === "Escape") {
      const close = [...nodes].reverse().find(node => nativeEnabled(node) && node.props.onBack !== undefined);
      if (close === undefined) { if (this.modal) { event.preventDefault(); event.stopImmediatePropagation(); } return; }
      event.preventDefault(); event.stopImmediatePropagation(); close.props.onBack?.(); return;
    }
    if (!this.modal) return;
    const controls = nodes.filter(node => nativeEnabled(node) && (node.props.onPress !== undefined || node.props.onValue !== undefined || node.props.onCommit !== undefined || node.tag === "rune-field"));
    if (controls.length === 0) return;
    let index = controls.findIndex(node => node === this.root.focused);
    const intent = menuIntentForKey(event.code);
    if ((intent === "left" || intent === "right") && controls[Math.max(0,index)]?.props.onAdjust !== undefined) {
      event.preventDefault(); event.stopImmediatePropagation();
      controls[Math.max(0,index)]?.props.onAdjust?.(intent === "left" ? -1 : 1);
    } else if (event.code === "Tab" || intent === "down" || intent === "up" || intent === "left" || intent === "right" || intent === "first" || intent === "last") {
      event.preventDefault(); event.stopImmediatePropagation();
      const direction = event.code === "Tab" ? event.shiftKey ? "up" : "down" : intent === "first" || intent === "last" || intent === "up" ? intent : "down";
      const nextIndex = index < 0 && direction === "down" ? 0 : menuNavMove(index, direction, { count: controls.length });
      const current = controls[index];
      const spatial = current !== undefined && (intent === "up" || intent === "down" || intent === "left" || intent === "right") ? runeNextFocus(current,controls,node => this.ui?.nativeRects.get(node.id),intent) : undefined;
      const next = spatial ?? controls[nextIndex];
      next?.focus(); next?.scrollIntoView();
    } else if (intent === "confirm") {
      event.preventDefault(); event.stopImmediatePropagation();
      if (index < 0) index = 0;
      const node = controls[index];
      if (node !== undefined && !event.repeat) {
        if (node.tag === "rune-field") this.enterField(node, true);
        else if ((node.props.holdMs ?? 0) > 0) { this.keyHeld = node; this.activation.begin(node.id,node.props.holdMs); }
        else node.props.onPress?.();
      }
    } else {
      event.stopImmediatePropagation();
    }
  }

  destroy(): void {
    this.dead = true;
    this.proxy?.remove();
    this.proxy = null;
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
