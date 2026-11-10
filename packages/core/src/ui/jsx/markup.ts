/**
 * Renders an engine UI tree once to an HTML string, with no effects run. Tests
 * read the produced tree through it; the website prerenders through it.
 */

import type { Props, UiNode } from "./element";
import { Root, type Host } from "./reconciler";

/** A node of the recorded tree: an element with props and children, or text. */
export interface MarkupNode {
  tag: string | null;
  text: string;
  props: Props;
  children: MarkupNode[];
}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

const UNITLESS = new Set([
  "animationIterationCount", "aspectRatio", "columnCount", "columns", "flex", "flexGrow", "flexShrink", "gridArea", "gridRow", "gridRowEnd",
  "gridRowStart", "gridColumn", "gridColumnEnd", "gridColumnStart", "fontWeight", "lineClamp", "lineHeight", "opacity", "order", "orphans",
  "scale", "tabSize", "widows", "zIndex", "zoom", "fillOpacity", "floodOpacity", "stopOpacity", "strokeDasharray", "strokeDashoffset",
  "strokeMiterlimit", "strokeOpacity", "strokeWidth",
]);

const ATTRIBUTE_NAMES: Record<string, string> = {
  className: "class",
  htmlFor: "for",
  tabIndex: "tabindex",
  readOnly: "readonly",
  autoFocus: "autofocus",
  autoComplete: "autocomplete",
  spellCheck: "spellcheck",
  maxLength: "maxlength",
  minLength: "minlength",
  colSpan: "colspan",
  rowSpan: "rowspan",
  crossOrigin: "crossorigin",
  srcSet: "srcset",
  inputMode: "inputmode",
  contentEditable: "contenteditable",
  playsInline: "playsinline",
  dateTime: "datetime",
  viewBox: "viewBox",
  preserveAspectRatio: "preserveAspectRatio",
  gradientUnits: "gradientUnits",
  gradientTransform: "gradientTransform",
  patternUnits: "patternUnits",
  stdDeviation: "stdDeviation",
  pathLength: "pathLength",
  defaultValue: "value",
  defaultChecked: "checked",
};

const STRING_BOOLEANS = new Set(["draggable", "spellcheck", "contenteditable"]);

export const markupHost: Host<MarkupNode> = {
  createElement: (tag) => ({ tag, text: "", props: {}, children: [] }),
  createText: (text) => ({ tag: null, text, props: {}, children: [] }),
  setText(node, text) {
    node.text = text;
  },
  updateProps(node, _tag, _prev, next) {
    node.props = next;
  },
  place(parent, node, before) {
    const at = parent.children.indexOf(node);
    if (at !== -1) parent.children.splice(at, 1);
    const index = before === null ? -1 : parent.children.indexOf(before);
    if (index === -1) parent.children.push(node);
    else parent.children.splice(index, 0, node);
  },
  remove(parent, node) {
    const at = parent.children.indexOf(node);
    if (at !== -1) parent.children.splice(at, 1);
  },
};

function escapeText(text: string): string {
  return text.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

function escapeAttribute(text: string): string {
  return text.replace(/[&<>"']/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#x27;"));
}

function hyphenate(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/^ms-/, "-ms-");
}

export function styleText(style: Record<string, unknown>): string {
  let out = "";
  for (const name in style) {
    const value = style[name];
    if (value === null || value === undefined || typeof value === "boolean" || value === "") continue;
    const custom = name.startsWith("--");
    const text = typeof value === "number" && value !== 0 && !custom && !UNITLESS.has(name) ? `${value}px` : String(value).trim();
    out += `${out === "" ? "" : ";"}${custom ? name : hyphenate(name)}:${text}`;
  }
  return out;
}

function attributeName(name: string, svg: boolean): string {
  const mapped = ATTRIBUTE_NAMES[name];
  if (mapped !== undefined) return mapped;
  if (name.startsWith("aria") && !name.includes("-") && name.length > 4) return `aria-${name.slice(4).toLowerCase()}`;
  if (svg && /[A-Z]/.test(name)) return hyphenate(name);
  return name;
}

function write(node: MarkupNode, svg: boolean, out: string[]): void {
  if (node.tag === null) {
    out.push(escapeText(node.text));
    return;
  }
  const tag = node.tag;
  const inSvg = svg || tag === "svg";
  out.push("<", tag);
  let inner: string | null = null;
  for (const name in node.props) {
    const value = node.props[name];
    if (name === "children" || name === "key" || name === "ref" || name === "suppressHydrationWarning") continue;
    if (name === "dangerouslySetInnerHTML") {
      const html = (value as { __html?: unknown } | null | undefined)?.__html;
      inner = html === null || html === undefined ? "" : String(html);
      continue;
    }
    if (value === null || value === undefined || typeof value === "function" || typeof value === "symbol") continue;
    if (name === "style") {
      if (typeof value === "object") {
        const text = styleText(value as Record<string, unknown>);
        if (text !== "") out.push(' style="', escapeAttribute(text), '"');
      }
      continue;
    }
    if (name === "value" && tag === "textarea") {
      inner = escapeText(String(value));
      continue;
    }
    const attribute = attributeName(name, inSvg);
    if (typeof value === "boolean") {
      if (attribute.startsWith("aria-") || attribute.startsWith("data-") || STRING_BOOLEANS.has(attribute)) out.push(" ", attribute, '="', String(value), '"');
      else if (value) out.push(" ", attribute, '=""');
      continue;
    }
    out.push(" ", attribute, '="', escapeAttribute(String(value)), '"');
  }
  if (VOID.has(tag)) {
    out.push("/>");
    return;
  }
  out.push(">");
  if (inner !== null) out.push(inner);
  else for (const child of node.children) write(child, inSvg && tag !== "foreignObject", out);
  out.push("</", tag, ">");
}

/** The recorded tree of one static render: the root's children. */
export function renderToTree(node: UiNode): MarkupNode[] {
  const container: MarkupNode = { tag: "#root", text: "", props: {}, children: [] };
  const root = new Root<MarkupNode>(markupHost, container, "R", false);
  root.render(node);
  return container.children;
}

export function treeToMarkup(nodes: readonly MarkupNode[]): string {
  const out: string[] = [];
  for (const node of nodes) write(node, false, out);
  return out.join("");
}

/** One static render to an HTML string; effects do not run. */
export function renderToStaticMarkup(node: UiNode): string {
  return treeToMarkup(renderToTree(node));
}

export const renderToString = renderToStaticMarkup;
