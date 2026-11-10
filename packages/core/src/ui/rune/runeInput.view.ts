/**
 * Pointer and keyboard input for Rune-drawn UI. The page's real pointer events
 * are hit-tested against where Rune laid each box out, and the element under the
 * pointer receives ordinary DOM events (pointerdown, click, mouseenter, wheel,
 * keydown) that bubble through its ancestors, so handlers written for the DOM
 * run unchanged. Hover, pressed and focused elements carry the attributes the
 * state rules' twins read (`cssStates.view`).
 */

import { boxOfElement, elementOf, type WireBox } from "./cssMirror.view";
import { runeRectOf } from "./domMeasure.view";
import { stateMatters } from "./cssStates.view";

type Roots = () => readonly WireBox[];

const FOCUSABLE = "button, input, select, textarea, a[href], summary, [tabindex], [contenteditable]";

function inside(element: Element | null, x: number, y: number): boolean {
  if (element === null) return false;
  const rect = runeRectOf(element);
  return rect !== undefined && x >= rect[0] && y >= rect[1] && x <= rect[0] + rect[2] && y <= rect[1] + rect[3];
}

/** The topmost box under the point that takes pointer input, in paint order. */
function hitBox(box: WireBox, x: number, y: number): WireBox | null {
  const element = box.id === 0 ? null : elementOf(box.id);
  const clips = box["ovx"] !== undefined || box["ovy"] !== undefined;
  if (clips && !inside(element, x, y)) return null;
  const children = box.c;
  if (children !== undefined) {
    for (let i = children.length - 1; i >= 0; i -= 1) {
      const found = hitBox(children[i] as WireBox, x, y);
      if (found !== null) return found;
    }
  }
  return box["hit"] === 1 && inside(element, x, y) ? box : null;
}

export class RuneInput {
  private readonly roots: Roots;
  private hovered: Element | null = null;
  private pressed: Element | null = null;
  private focused: HTMLElement | null = null;
  private marked: Record<"hover" | "active" | "focus", Element[]> = { hover: [], active: [], focus: [] };
  private lastClick = { at: 0, target: null as Element | null };
  private readonly cleanups: (() => void)[] = [];

  /** Called with a form control whose state a click changed without changing any attribute. */
  private readonly controlChanged: (element: Element) => void;

  constructor(roots: Roots, controlChanged: (element: Element) => void = () => undefined) {
    this.roots = roots;
    this.controlChanged = controlChanged;
    const on = <K extends keyof WindowEventMap>(type: K, handler: (event: WindowEventMap[K]) => void, passive = true) => {
      window.addEventListener(type, handler, { capture: true, passive });
      this.cleanups.push(() => window.removeEventListener(type, handler, { capture: true }));
    };
    on("pointermove", (event) => this.onMove(event));
    on("pointerdown", (event) => this.onDown(event));
    on("pointerup", (event) => this.onUp(event));
    on("pointercancel", (event) => this.onUp(event));
    // The browser's own mouse and click events for a pointer over the UI are replaced by the
    // ones sent to the element, so nothing hears a press twice.
    for (const type of ["mousedown", "mouseup", "mousemove", "click", "dblclick", "auxclick"] as const) {
      on(type, (event) => {
        if (!this.own(event) && (this.pressed ?? this.target(event.clientX, event.clientY)) !== null) event.stopPropagation();
      });
    }
    on("contextmenu", (event) => this.relay(event, this.target(event.clientX, event.clientY)), false);
    on("keydown", (event) => this.onKey(event), false);
    on("keyup", (event) => this.onKey(event), false);
    this.patchFocus();
  }

  destroy(): void {
    for (const cleanup of this.cleanups.splice(0)) cleanup();
  }

  /** The element under a viewport point, or null when the point is on the game. */
  target(x: number, y: number): Element | null {
    const roots = this.roots();
    for (let i = roots.length - 1; i >= 0; i -= 1) {
      const box = hitBox(roots[i] as WireBox, x, y);
      if (box !== null) return elementOf(box.id);
    }
    return null;
  }

  /**
   * Whether the real pointer event over `target` stops here. A text field and a scrolling box
   * keep theirs: Rune itself places the caret, selects and scrolls from them.
   */
  private claims(target: Element | null): boolean {
    if (target === null) return false;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return false;
    for (let e: Element | null = target; e !== null && !e.hasAttribute("data-jg-rune-layer"); e = e.parentElement) {
      const box = boxOfElement(e);
      if (box !== undefined && (box["ovx"] === 2 || box["ovy"] === 2)) return false;
    }
    return true;
  }

  /** Whether a real event is one this class dispatched (so it is not handled twice). */
  private own(event: Event): boolean {
    return (event as { jgRune?: boolean }).jgRune === true;
  }

  private send(target: Element, event: Event): boolean {
    (event as { jgRune?: boolean }).jgRune = true;
    return target.dispatchEvent(event);
  }

  private init(event: PointerEvent | MouseEvent, bubbles = true): PointerEventInit {
    return {
      bubbles,
      cancelable: bubbles,
      composed: true,
      view: window,
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
      button: event.button,
      buttons: event.buttons,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      detail: event.detail,
      pointerId: (event as PointerEvent).pointerId ?? 1,
      pointerType: (event as PointerEvent).pointerType ?? "mouse",
      isPrimary: (event as PointerEvent).isPrimary ?? true,
      pressure: (event as PointerEvent).pressure ?? 0,
    };
  }

  private chain(element: Element | null): Element[] {
    const out: Element[] = [];
    for (let e = element; e !== null && !e.hasAttribute("data-jg-rune-layer"); e = e.parentElement) out.push(e);
    return out;
  }

  /** Mark `element` and the ancestors a rule reads the state on; unmark the previous ones. */
  private mark(state: "hover" | "active" | "focus", attribute: string, element: Element | null): void {
    const next = this.chain(element).filter((e) => stateMatters(e, state, attribute));
    for (const e of this.marked[state]) if (!next.includes(e)) e.removeAttribute(attribute);
    for (const e of next) if (!e.hasAttribute(attribute)) e.setAttribute(attribute, "");
    this.marked[state] = next;
  }

  private onMove(event: PointerEvent): void {
    if (this.own(event)) return;
    const over = this.target(event.clientX, event.clientY);
    const target = this.pressed ?? over;
    if (this.claims(target)) event.stopPropagation();
    if (over !== this.hovered) {
      const before = this.chain(this.hovered);
      const after = this.chain(over);
      const init = this.init(event);
      if (this.hovered !== null) {
        this.send(this.hovered, new PointerEvent("pointerout", { ...init, relatedTarget: over }));
        this.send(this.hovered, new MouseEvent("mouseout", { ...init, relatedTarget: over }));
      }
      for (const e of before) {
        if (after.includes(e)) continue;
        this.send(e, new PointerEvent("pointerleave", { ...this.init(event, false), relatedTarget: over }));
        this.send(e, new MouseEvent("mouseleave", { ...this.init(event, false), relatedTarget: over }));
      }
      if (over !== null) {
        this.send(over, new PointerEvent("pointerover", { ...init, relatedTarget: this.hovered }));
        this.send(over, new MouseEvent("mouseover", { ...init, relatedTarget: this.hovered }));
      }
      for (const e of after.reverse()) {
        if (before.includes(e)) continue;
        this.send(e, new PointerEvent("pointerenter", { ...this.init(event, false), relatedTarget: this.hovered }));
        this.send(e, new MouseEvent("mouseenter", { ...this.init(event, false), relatedTarget: this.hovered }));
      }
      this.hovered = over;
      this.mark("hover", "data-jg-hover", over);
    }
    if (target !== null) {
      this.send(target, new PointerEvent("pointermove", this.init(event)));
      this.send(target, new MouseEvent("mousemove", this.init(event)));
    }
  }

  private onDown(event: PointerEvent): void {
    if (this.own(event)) return;
    const target = this.target(event.clientX, event.clientY);
    if (target === null) {
      if (this.focused !== null) this.focus(null);
      return;
    }
    if (this.claims(target)) event.stopPropagation();
    this.pressed = target;
    this.mark("active", "data-jg-active", target);
    const down = new PointerEvent("pointerdown", this.init(event));
    const allowed = this.send(target, down);
    const mouse = new MouseEvent("mousedown", this.init(event));
    if (allowed && this.send(target, mouse)) {
      const focusable = target.closest(FOCUSABLE);
      this.focus(focusable instanceof HTMLElement && !focusable.hasAttribute("data-jg-rune-layer") && (focusable as HTMLButtonElement).disabled !== true ? focusable : null);
    }
  }

  private onUp(event: PointerEvent): void {
    if (this.own(event)) return;
    const pressed = this.pressed;
    this.pressed = null;
    if (pressed === null) return;
    if (this.claims(pressed)) event.stopPropagation();
    this.mark("active", "data-jg-active", null);
    const over = this.target(event.clientX, event.clientY);
    const target = over ?? pressed;
    this.send(pressed, new PointerEvent(event.type === "pointercancel" ? "pointercancel" : "pointerup", this.init(event)));
    this.send(pressed, new MouseEvent("mouseup", this.init(event)));
    if (event.type === "pointercancel" || over === null) return;
    // A click lands on the element both the press and the release are inside.
    let clicked: Element | null = pressed;
    while (clicked !== null && !clicked.contains(target)) clicked = clicked.parentElement;
    if (clicked === null || clicked.hasAttribute("data-jg-rune-layer")) return;
    const off = clicked.closest("button:disabled, input:disabled, select:disabled, textarea:disabled, fieldset:disabled");
    if (off !== null) return;
    if (event.button === 0) {
      const now = performance.now();
      const second = now - this.lastClick.at < 400 && this.lastClick.target === clicked;
      this.send(clicked, new MouseEvent("click", { ...this.init(event), detail: second ? 2 : 1 }));
      const control = clicked.closest("select, input[type=checkbox], input[type=radio]");
      if (control instanceof HTMLSelectElement && control.options.length > 0) {
        // No list can drop down from an undisplayed element: each click moves to the next option.
        control.selectedIndex = (control.selectedIndex + 1) % control.options.length;
        control.dispatchEvent(new Event("input", { bubbles: true }));
        control.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (control !== null) this.controlChanged(control);
      if (second) this.send(clicked, new MouseEvent("dblclick", { ...this.init(event), detail: 2 }));
      this.lastClick = { at: second ? 0 : now, target: clicked };
    } else if (event.button === 1) {
      this.send(clicked, new MouseEvent("auxclick", this.init(event)));
    }
  }

  /** Send a copy of a real context-menu event to the element under it; the real one stops here. */
  private relay(event: MouseEvent, target: Element | null): void {
    if (this.own(event) || target === null) return;
    event.stopPropagation();
    if (!this.send(target, new MouseEvent(event.type, this.init(event)))) event.preventDefault();
  }

  private onKey(event: KeyboardEvent): void {
    const focused = this.focused;
    if (this.own(event) || focused === null || !focused.isConnected) return;
    // A text field's keys belong to Rune, which is editing it.
    if (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) return;
    event.stopImmediatePropagation();
    const copy = new KeyboardEvent(event.type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      key: event.key,
      code: event.code,
      location: event.location,
      repeat: event.repeat,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
    });
    const allowed = this.send(focused, copy);
    if (!allowed) {
      event.preventDefault();
      return;
    }
    // Enter and Space press the focused control, as they do in a page.
    if (event.type === "keydown" && (event.key === "Enter" || event.key === " ") && focused.matches("button, [role=button], a[href], summary") && (focused as HTMLButtonElement).disabled !== true) {
      event.preventDefault();
      this.send(focused, new MouseEvent("click", { bubbles: true, cancelable: true, composed: true, view: window, detail: 0 }));
    }
  }

  /** Move focus to `element` (null: nowhere), with the focus events a page would see. */
  focus(element: HTMLElement | null): void {
    const before = this.focused;
    if (before === element) return;
    this.focused = element;
    if (before !== null) {
      this.send(before, new FocusEvent("blur", { relatedTarget: element }));
      this.send(before, new FocusEvent("focusout", { bubbles: true, composed: true, relatedTarget: element }));
    }
    this.mark("focus", "data-jg-focus", element);
    if (element !== null) {
      this.send(element, new FocusEvent("focus", { relatedTarget: before }));
      this.send(element, new FocusEvent("focusin", { bubbles: true, composed: true, relatedTarget: before }));
    }
  }

  get focusedElement(): HTMLElement | null {
    return this.focused !== null && this.focused.isConnected ? this.focused : null;
  }

  /** `element.focus()`, `blur()` and `document.activeElement` answer for elements the browser cannot focus. */
  private patchFocus(): void {
    const input = this;
    const flag = HTMLElement.prototype as { jgRuneFocus?: boolean };
    if (flag.jgRuneFocus === true) return;
    flag.jgRuneFocus = true;
    const focus = HTMLElement.prototype.focus;
    const blur = HTMLElement.prototype.blur;
    HTMLElement.prototype.focus = function patchedFocus(this: HTMLElement, options?: FocusOptions): void {
      if (this.closest("[data-jg-rune-layer]") !== null) input.focus(this);
      else focus.call(this, options);
    };
    HTMLElement.prototype.blur = function patchedBlur(this: HTMLElement): void {
      if (input.focusedElement === this) input.focus(null);
      else blur.call(this);
    };
    const active = Object.getOwnPropertyDescriptor(Document.prototype, "activeElement");
    const read = active?.get;
    if (active !== undefined && read !== undefined) {
      Object.defineProperty(Document.prototype, "activeElement", {
        ...active,
        get(this: Document) {
          return input.focusedElement ?? (read.call(this) as Element | null);
        },
      });
    }
  }
}
