/**
 * The DOM host: draws an engine UI tree as real elements. Used where the page
 * itself is the product (the website, the editor's forms) and by tests that
 * read markup; games draw through the Rune host instead.
 */

import type { Props } from "./element";
import { flushSync, type Host } from "./reconciler";

const SVG_NS = "http://www.w3.org/2000/svg";

const UNITLESS = new Set([
  "animationIterationCount", "aspectRatio", "borderImageOutset", "borderImageSlice", "borderImageWidth", "columnCount", "columns", "flex",
  "flexGrow", "flexShrink", "flexPositive", "flexNegative", "flexOrder", "gridArea", "gridRow", "gridRowEnd", "gridRowSpan", "gridRowStart",
  "gridColumn", "gridColumnEnd", "gridColumnSpan", "gridColumnStart", "fontWeight", "lineClamp", "lineHeight", "opacity", "order", "orphans",
  "scale", "tabSize", "widows", "zIndex", "zoom", "fillOpacity", "floodOpacity", "stopOpacity", "strokeDasharray", "strokeDashoffset",
  "strokeMiterlimit", "strokeOpacity", "strokeWidth",
]);

const PROPERTY_NAMES: Record<string, string> = {
  className: "class",
  htmlFor: "for",
  tabIndex: "tabindex",
  readOnly: "readonly",
  autoFocus: "autofocus",
  autoComplete: "autocomplete",
  autoCapitalize: "autocapitalize",
  autoCorrect: "autocorrect",
  spellCheck: "spellcheck",
  maxLength: "maxlength",
  minLength: "minlength",
  colSpan: "colspan",
  rowSpan: "rowspan",
  crossOrigin: "crossorigin",
  srcSet: "srcset",
  inputMode: "inputmode",
  enterKeyHint: "enterkeyhint",
  contentEditable: "contenteditable",
  playsInline: "playsinline",
  acceptCharset: "accept-charset",
  httpEquiv: "http-equiv",
  xlinkHref: "xlink:href",
  dateTime: "datetime",
  noValidate: "novalidate",
  formNoValidate: "formnovalidate",
  allowFullScreen: "allowfullscreen",
  referrerPolicy: "referrerpolicy",
  fetchPriority: "fetchpriority",
};

/** SVG attributes that keep their camelCase spelling; every other one is written with hyphens. */
const SVG_CAMEL = new Set([
  "viewBox", "preserveAspectRatio", "gradientUnits", "gradientTransform", "patternUnits", "patternTransform", "patternContentUnits",
  "spreadMethod", "stdDeviation", "baseFrequency", "numOctaves", "textLength", "lengthAdjust", "clipPathUnits", "maskUnits",
  "maskContentUnits", "markerWidth", "markerHeight", "markerUnits", "refX", "refY", "startOffset", "pathLength", "tableValues",
  "filterUnits", "primitiveUnits", "kernelMatrix", "surfaceScale", "specularConstant", "specularExponent", "diffuseConstant",
  "xChannelSelector", "yChannelSelector", "attributeName", "attributeType", "repeatCount", "repeatDur", "keyTimes", "keySplines",
  "calcMode", "edgeMode", "targetX", "targetY", "limitingConeAngle", "pointsAtX", "pointsAtY", "pointsAtZ", "requiredExtensions",
  "systemLanguage", "zoomAndPan",
]);

const EVENT_NAMES: Record<string, string> = {
  doubleclick: "dblclick",
  change: "input",
  focus: "focusin",
  blur: "focusout",
};

/** Elements whose `change` really is the DOM `change` event. */
function changeEvent(node: Element): string {
  if (node instanceof HTMLSelectElement) return "change";
  if (node instanceof HTMLInputElement && (node.type === "checkbox" || node.type === "radio" || node.type === "file" || node.type === "range" || node.type === "color")) {
    return node.type === "range" || node.type === "color" ? "input" : "change";
  }
  return "input";
}

interface Listener {
  handler: (event: Event) => void;
  dispatch: (event: Event) => void;
  type: string;
  capture: boolean;
}

interface NodeState {
  listeners: Map<string, Listener>;
  controlled: boolean;
  value: unknown;
  checked: unknown;
}

const states = new WeakMap<Node, NodeState>();

function stateOf(node: Node): NodeState {
  let state = states.get(node);
  if (state === undefined) {
    state = { listeners: new Map(), controlled: false, value: undefined, checked: undefined };
    states.set(node, state);
  }
  return state;
}

function hyphenate(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function setStyle(node: HTMLElement | SVGElement, prev: unknown, next: unknown): void {
  const style = node.style;
  if (typeof next === "string") {
    style.cssText = next;
    return;
  }
  const before = typeof prev === "object" && prev !== null ? (prev as Record<string, unknown>) : null;
  const after = typeof next === "object" && next !== null ? (next as Record<string, unknown>) : null;
  if (before !== null) {
    for (const name in before) {
      if (after === null || !(name in after)) {
        if (name.startsWith("--")) style.removeProperty(name);
        else style.setProperty(hyphenate(name), "");
      }
    }
  } else if (typeof prev === "string") {
    style.cssText = "";
  }
  if (after === null) return;
  for (const name in after) {
    const value = after[name];
    if (before !== null && before[name] === value) continue;
    if (name.startsWith("--")) {
      if (value === null || value === undefined) style.removeProperty(name);
      else style.setProperty(name, String(value));
      continue;
    }
    const text = value === null || value === undefined || typeof value === "boolean" ? "" : typeof value === "number" && value !== 0 && !UNITLESS.has(name) ? `${value}px` : String(value);
    if (name === "float") style.setProperty("float", text);
    else (style as unknown as Record<string, string>)[name] = text; // type-escape: CSSStyleDeclaration indexed by property name
  }
}

function setListener(node: Element, name: string, handler: unknown): void {
  const state = stateOf(node);
  const existing = state.listeners.get(name);
  if (typeof handler !== "function") {
    if (existing !== undefined) {
      node.removeEventListener(existing.type, existing.dispatch, existing.capture);
      state.listeners.delete(name);
    }
    return;
  }
  if (existing !== undefined) {
    existing.handler = handler as (event: Event) => void;
    return;
  }
  let base = name.slice(2);
  let capture = false;
  if (base.endsWith("Capture") && base !== "GotPointerCapture" && base !== "LostPointerCapture") {
    capture = true;
    base = base.slice(0, -7);
  }
  const lower = base.toLowerCase();
  const type = lower === "change" ? changeEvent(node) : (EVENT_NAMES[lower] ?? lower);
  const listener: Listener = {
    handler: handler as (event: Event) => void,
    type,
    capture,
    dispatch: (event) => {
      const wrapped = event as Event & { nativeEvent?: Event; persist?: () => void; isDefaultPrevented?: () => boolean; isPropagationStopped?: () => boolean };
      if (wrapped.nativeEvent === undefined) {
        wrapped.nativeEvent = event;
        wrapped.persist = () => {};
        wrapped.isDefaultPrevented = () => event.defaultPrevented;
        wrapped.isPropagationStopped = () => event.cancelBubble;
      }
      flushSync(() => listener.handler(event));
      if (state.controlled) queueMicrotask(() => restoreControlled(node, state));
    },
  };
  state.listeners.set(name, listener);
  node.addEventListener(type, listener.dispatch, capture);
}

/** A controlled field shows its prop, not what the browser typed, once handlers have run. */
function restoreControlled(node: Element, state: NodeState): void {
  const field = node as HTMLInputElement;
  if (state.value !== undefined && state.value !== null) {
    const text = String(state.value);
    if (field.value !== text) field.value = text;
  }
  if (state.checked !== undefined && state.checked !== null && field.checked !== Boolean(state.checked)) field.checked = Boolean(state.checked);
}

function setProp(node: Element, tag: string, name: string, prev: unknown, next: unknown, svg: boolean): void {
  if (name === "children" || name === "key" || name === "ref") return;
  if (name === "style") {
    setStyle(node as HTMLElement, prev, next);
    return;
  }
  if (name === "dangerouslySetInnerHTML") {
    const html = (next as { __html?: unknown } | null | undefined)?.__html;
    const before = (prev as { __html?: unknown } | null | undefined)?.__html;
    if (html !== before) node.innerHTML = html === null || html === undefined ? "" : String(html);
    return;
  }
  if (name.length > 2 && name.charCodeAt(0) === 111 && name.charCodeAt(1) === 110 && name.charCodeAt(2) >= 65 && name.charCodeAt(2) <= 90) {
    setListener(node, name, next);
    return;
  }
  if (name === "value" && (tag === "input" || tag === "textarea" || tag === "select")) {
    const state = stateOf(node);
    state.controlled = next !== undefined;
    state.value = next;
    const text = next === null || next === undefined ? "" : String(next);
    if ((node as HTMLInputElement).value !== text) (node as HTMLInputElement).value = text;
    return;
  }
  if (name === "checked" && tag === "input") {
    const state = stateOf(node);
    state.controlled = next !== undefined;
    state.checked = next;
    (node as HTMLInputElement).checked = Boolean(next);
    return;
  }
  if (name === "defaultValue") {
    if (prev === undefined && next !== undefined && next !== null) (node as HTMLInputElement).value = String(next);
    return;
  }
  if (name === "defaultChecked") {
    if (prev === undefined) (node as HTMLInputElement).checked = Boolean(next);
    return;
  }
  if (name === "muted" || name === "selected" || name === "indeterminate") {
    (node as unknown as Record<string, unknown>)[name] = Boolean(next); // type-escape: element property by name
    return;
  }
  if (name === "suppressHydrationWarning" || name === "suppressContentEditableWarning") return;
  if (name === "autoFocus") {
    if (prev === undefined && next === true) queueMicrotask(() => (node as HTMLElement).focus());
    return;
  }
  const attribute = svg
    ? (name === "className" ? "class" : SVG_CAMEL.has(name) || name.includes("-") ? name : (PROPERTY_NAMES[name] ?? hyphenate(name)))
    : (PROPERTY_NAMES[name] ?? (name.startsWith("aria") && !name.includes("-") ? `aria-${name.slice(4).toLowerCase()}` : name));
  if (next === null || next === undefined || next === false) {
    if (next === false && (attribute.startsWith("aria-") || attribute.startsWith("data-") || attribute === "draggable" || attribute === "spellcheck" || attribute === "contenteditable")) {
      node.setAttribute(attribute, "false");
    } else {
      node.removeAttribute(attribute);
    }
    return;
  }
  if (typeof next === "function" || typeof next === "symbol") return;
  node.setAttribute(attribute, next === true ? (attribute.startsWith("aria-") || attribute.startsWith("data-") || attribute === "draggable" || attribute === "spellcheck" || attribute === "contenteditable" ? "true" : "") : String(next));
}

/** The host a DOM root renders through. */
export const domHost: Host<Node> = {
  createElement(tag, parent) {
    const svg = tag === "svg" || (parent instanceof Element && parent.namespaceURI === SVG_NS && parent.localName !== "foreignObject");
    return svg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  },
  createText(text) {
    return document.createTextNode(text);
  },
  setText(node, text) {
    node.nodeValue = text;
  },
  updateProps(node, tag, prev, next) {
    const element = node as Element;
    const svg = element.namespaceURI === SVG_NS;
    if (prev !== null) {
      for (const name in prev) if (!(name in next)) setProp(element, tag, name, prev[name], undefined, svg);
    }
    let late: string | null = null;
    for (const name in next) {
      const value = next[name];
      const before = prev === null ? undefined : prev[name];
      if (name === "value" || name === "checked") {
        late = name;
        if (name === "checked") setProp(element, tag, name, before, value, svg);
        continue;
      }
      if (value === before && name !== "style") continue;
      setProp(element, tag, name, before, value, svg);
    }
    // After type/min/max/step, which change what a value may be.
    if (late !== null && "value" in next) setProp(element, tag, "value", prev === null ? undefined : prev["value"], next["value"], svg);
  },
  place(parent, node, before) {
    if (node.parentNode === parent && node.nextSibling === before) return;
    parent.insertBefore(node, before !== null && before.parentNode === parent ? before : null);
  },
  remove(parent, node) {
    if (node.parentNode === parent) parent.removeChild(node);
  },
  childrenPlaced(parent) {
    if (parent instanceof HTMLSelectElement) {
      const state = states.get(parent);
      if (state !== undefined && state.value !== undefined && state.value !== null) parent.value = String(state.value);
    }
  },
};
