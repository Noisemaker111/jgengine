/**
 * Turns an undisplayed DOM subtree into Rune CSS boxes. The browser resolves the
 * cascade (classes, Tailwind, custom properties, media queries) for elements it
 * never lays out or paints; this file reads each element's computed style once
 * per change and writes the numbers Rune lays out and draws.
 *
 * Whatever a style asks for that the painter cannot draw is recorded in
 * {@link MirrorReport}, by property and by the element's classes, never dropped
 * silently.
 */

import {
  colorAlpha,
  parseAlign,
  parseColor,
  parseDim,
  parseGradient,
  parsePlacement,
  parsePx,
  parseRadius,
  parseShadows,
  parseTextShadows,
  parseTracks,
  parseTransform,
  splitTop,
  type WireDim,
  type WireLayer,
} from "./cssValues";

/** One CSS box on the wire (`native/crates/jg-ui/src/css.rs`). */
export interface WireBox {
  k: "x";
  id: number;
  c?: WireBox[];
  [field: string]: unknown;
}

/** What the mirror could not express, counted by `property: value` and by where it was asked. */
export class MirrorReport {
  readonly lost = new Map<string, { count: number; where: Set<string> }>();

  add(what: string, element: Element): void {
    let entry = this.lost.get(what);
    if (entry === undefined) {
      entry = { count: 0, where: new Set() };
      this.lost.set(what, entry);
    }
    entry.count += 1;
    if (entry.where.size < 6) entry.where.add(describe(element));
  }

  lines(): string[] {
    return [...this.lost.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([what, entry]) => `${entry.count}x ${what}  <- ${[...entry.where].join(", ")}`);
  }
}

function describe(element: Element): string {
  const classes = typeof element.className === "string" && element.className !== "" ? `.${element.className.trim().split(/\s+/).slice(0, 3).join(".")}` : "";
  return `${element.localName}${classes}`;
}

interface Inherited {
  /** The nearest positioned ancestor's box, where out-of-flow descendants are placed. */
  positioned: WireBox[];
}

const TEXT_INPUT_TYPES = new Set(["", "text", "search", "email", "url", "tel", "password", "number"]);
const ISLAND_TAGS = new Set(["canvas", "video", "iframe", "audio", "object", "embed"]);
const SKIP_TAGS = new Set(["script", "style", "template", "link", "meta", "noscript", "title", "head"]);

let nextId = 1;
const ids = new WeakMap<Element, number>();
const elementsById = new Map<number, WeakRef<Element>>();

/** A stable numeric id per mirrored element, for events and rects coming back from Rune. */
export function idOf(element: Element): number {
  let id = ids.get(element);
  if (id === undefined) {
    id = nextId;
    nextId += 1;
    ids.set(element, id);
    elementsById.set(id, new WeakRef(element));
  }
  return id;
}

export function elementOf(id: number): Element | null {
  const element = elementsById.get(id)?.deref() ?? null;
  if (element === null) elementsById.delete(id);
  return element;
}

function isInline(display: string): boolean {
  return display === "inline" || display === "contents";
}

function isInlineLevel(display: string): boolean {
  return display.startsWith("inline");
}

function collapse(text: string, whiteSpace: string): string {
  if (whiteSpace === "pre" || whiteSpace === "pre-wrap" || whiteSpace === "break-spaces") return text;
  if (whiteSpace === "pre-line") return text.replace(/[ \t]+/g, " ");
  return text.replace(/\s+/g, " ");
}

function applyCase(text: string, transform: string): string {
  if (transform === "uppercase") return text.toUpperCase();
  if (transform === "lowercase") return text.toLowerCase();
  if (transform === "capitalize") return text.replace(/(^|[\s-])(\p{L})/gu, (_m, lead: string, letter: string) => lead + letter.toUpperCase());
  return text;
}

interface Run {
  text: string;
  style: CSSStyleDeclaration;
}

/** Gathers the text of an element whose content is only text and plain inline elements; `null` when it holds a box. */
function inlineRuns(element: Element, style: CSSStyleDeclaration, out: Run[]): boolean {
  for (let node = element.firstChild; node !== null; node = node.nextSibling) {
    if (node.nodeType === 3) {
      const text = node.nodeValue ?? "";
      if (text !== "") out.push({ text, style });
      continue;
    }
    if (node.nodeType !== 1) continue;
    const child = node as Element;
    if (child.localName === "br") {
      out.push({ text: "\n", style });
      continue;
    }
    const childStyle = getComputedStyle(child);
    if (childStyle.display === "none") continue;
    if (!isInline(childStyle.display) || child.localName === "svg" || child.localName === "img" || hasBoxPaint(childStyle)) return false;
    if (!inlineRuns(child, childStyle, out)) return false;
  }
  return true;
}

function hasBoxPaint(style: CSSStyleDeclaration): boolean {
  if (style.backgroundImage !== "none") return true;
  const background = parseColor(style.backgroundColor);
  if (background !== null && colorAlpha(background) > 0) return true;
  if (parsePx(style.borderTopWidth) + parsePx(style.borderBottomWidth) + parsePx(style.borderLeftWidth) + parsePx(style.borderRightWidth) > 0) return true;
  return parsePx(style.paddingLeft) + parsePx(style.paddingRight) + parsePx(style.marginLeft) + parsePx(style.marginRight) > 0;
}

function fontOf(style: CSSStyleDeclaration): { f: string; z: number; w: number; i: boolean; lh: number; ls: number } {
  const size = parsePx(style.fontSize);
  const lineHeight = style.lineHeight;
  const weight = style.fontWeight === "bold" ? 700 : style.fontWeight === "normal" ? 400 : parseFloat(style.fontWeight) || 400;
  return {
    f: style.fontFamily,
    z: size,
    w: weight,
    i: style.fontStyle !== "normal",
    lh: lineHeight === "normal" ? 0 : parsePx(lineHeight),
    ls: style.letterSpacing === "normal" ? 0 : parsePx(style.letterSpacing),
  };
}

function textOf(runs: Run[], style: CSSStyleDeclaration, report: MirrorReport, element: Element): Record<string, unknown> | null {
  const base = fontOf(style);
  const baseColor = parseColor(style.color) ?? 0xffffffff;
  let content = "";
  const spans: Record<string, unknown>[] = [];
  let previousSpace = true;
  for (const run of runs) {
    let text = applyCase(collapse(run.text, run.style.whiteSpace), run.style.textTransform);
    if (previousSpace && text.startsWith(" ") && run.style.whiteSpace !== "pre" && run.style.whiteSpace !== "pre-wrap") text = text.slice(1);
    if (text === "") continue;
    previousSpace = text.endsWith(" ") || text.endsWith("\n");
    const start = content.length;
    content += text;
    if (run.style === style) continue;
    const font = fontOf(run.style);
    const color = parseColor(run.style.color) ?? baseColor;
    const span: Record<string, unknown> = { a: start, b: content.length };
    let differs = false;
    if (color !== baseColor) {
      span["c"] = color;
      differs = true;
    }
    if (font.w !== base.w) {
      span["w"] = font.w;
      differs = true;
    }
    if (font.z !== base.z) {
      span["z"] = font.z;
      differs = true;
    }
    if (font.i !== base.i) {
      span["i"] = font.i;
      differs = true;
    }
    if (run.style.textDecorationLine.includes("underline")) {
      span["u"] = true;
      differs = true;
    }
    if (font.f !== base.f) report.add(`inline font-family change: ${font.f.slice(0, 40)}`, element);
    if (differs) spans.push(span);
  }
  if (previousSpace && content.endsWith(" ")) content = content.slice(0, -1);
  if (content === "") return null;
  const align = style.textAlign;
  const nowrap = style.whiteSpace === "nowrap" || style.whiteSpace === "pre";
  const text: Record<string, unknown> = { s: content, c: baseColor, ...base };
  if (spans.length > 0) text["sp"] = spans;
  if (align === "center") text["al"] = 1;
  else if (align === "right" || align === "end") text["al"] = 2;
  if (nowrap) text["wr"] = style.textOverflow === "ellipsis" ? 2 : 1;
  const shadows = parseTextShadows(style.textShadow);
  if (shadows.length > 0) text["ts"] = shadows;
  if (style.textDecorationLine.includes("underline")) spans.push({ a: 0, b: content.length, u: true });
  if (style.textDecorationLine.includes("line-through")) report.add("text-decoration: line-through", element);
  return text;
}

function dims(element: Element, report: MirrorReport, name: string, values: string[]): WireDim[] | null {
  let any = false;
  const out: WireDim[] = [];
  for (const value of values) {
    const dim = parseDim(value);
    if (dim === null) {
      report.add(`${name}: ${value}`, element);
      out.push("auto");
      continue;
    }
    if (dim !== 0 && dim !== "auto") any = true;
    out.push(dim);
  }
  return any ? out : null;
}

function setDim(box: WireBox, key: string, element: Element, report: MirrorReport, name: string, value: string): void {
  if (value === "auto" || value === "none") return;
  const dim = parseDim(value);
  if (dim === null) {
    if (value !== "min-content" && value !== "max-content" && value !== "fit-content") report.add(`${name}: ${value}`, element);
    return;
  }
  box[key] = dim;
}

/** Layout, paint and interaction of one element's own box. */
function boxOf(element: Element, style: CSSStyleDeclaration, report: MirrorReport): WireBox {
  const box: WireBox = { k: "x", id: idOf(element) };
  const display = style.display;
  const flex = display.endsWith("flex");
  const grid = display.endsWith("grid");
  if (grid) box["d"] = 2;
  else if (!flex) box["d"] = 1;
  if (flex) {
    const direction = style.flexDirection;
    if (direction === "column") box["fd"] = 1;
    else if (direction === "row-reverse") box["fd"] = 2;
    else if (direction === "column-reverse") box["fd"] = 3;
    if (style.flexWrap === "wrap") box["fw"] = 1;
    else if (style.flexWrap === "wrap-reverse") box["fw"] = 2;
  }
  if (flex || grid) {
    const ai = parseAlign(style.alignItems);
    if (ai !== 0) box["ai"] = ai;
    const jc = parseAlign(style.justifyContent);
    if (jc !== 0) box["jc"] = jc;
    const ac = parseAlign(style.alignContent);
    if (ac !== 0) box["ac"] = ac;
    const columnGap = parsePx(style.columnGap);
    const rowGap = parsePx(style.rowGap);
    if (columnGap !== 0 || rowGap !== 0) box["gap"] = [columnGap, rowGap];
  }
  if (grid) {
    const ji = parseAlign(style.justifyItems);
    if (ji !== 0) box["ji"] = ji;
    for (const [key, name, value] of [
      ["gtc", "grid-template-columns", style.gridTemplateColumns],
      ["gtr", "grid-template-rows", style.gridTemplateRows],
      ["gac", "grid-auto-columns", style.gridAutoColumns],
      ["gar", "grid-auto-rows", style.gridAutoRows],
    ] as const) {
      const tracks = parseTracks(value);
      if (tracks === null) report.add(`${name}: ${value}`, element);
      else if (tracks.length > 0) box[key] = tracks;
    }
    const flow = style.gridAutoFlow;
    if (flow.startsWith("column")) box["gaf"] = flow.includes("dense") ? 3 : 1;
    else if (flow.includes("dense")) box["gaf"] = 2;
  }
  const asf = parseAlign(style.alignSelf);
  if (asf !== 0) box["asf"] = asf;
  const jsf = parseAlign(style.justifySelf);
  if (jsf !== 0) box["jsf"] = jsf;
  const column = parsePlacement(style.gridColumnStart, style.gridColumnEnd);
  if (column !== null) box["gc"] = column;
  const row = parsePlacement(style.gridRowStart, style.gridRowEnd);
  if (row !== null) box["gr"] = row;

  const position = style.position;
  if (position === "absolute" || position === "fixed") box["pos"] = 2;
  else if (position !== "static") box["pos"] = 1;
  if (position !== "static") {
    const inset = dims(element, report, "inset", [style.left, style.top, style.right, style.bottom]);
    if (inset !== null || style.left !== "auto" || style.top !== "auto" || style.right !== "auto" || style.bottom !== "auto") {
      box["ins"] = [style.left, style.top, style.right, style.bottom].map((value) => parseDim(value) ?? "auto");
    }
  }
  setDim(box, "w", element, report, "width", style.width);
  setDim(box, "h", element, report, "height", style.height);
  setDim(box, "mnw", element, report, "min-width", style.minWidth);
  setDim(box, "mnh", element, report, "min-height", style.minHeight);
  setDim(box, "mxw", element, report, "max-width", style.maxWidth);
  setDim(box, "mxh", element, report, "max-height", style.maxHeight);
  if (style.boxSizing === "content-box") box["cb"] = 1;
  const margin = [style.marginLeft, style.marginTop, style.marginRight, style.marginBottom];
  if (margin.some((value) => value !== "0px")) box["mg"] = margin.map((value) => parseDim(value) ?? 0);
  const padding = dims(element, report, "padding", [style.paddingLeft, style.paddingTop, style.paddingRight, style.paddingBottom]);
  if (padding !== null) box["pd"] = padding;
  const borderWidths = [parsePx(style.borderTopWidth), parsePx(style.borderRightWidth), parsePx(style.borderBottomWidth), parsePx(style.borderLeftWidth)];
  if (borderWidths.some((width) => width > 0)) {
    box["bw"] = borderWidths;
    const sides = [style.borderTopColor, style.borderRightColor, style.borderBottomColor, style.borderLeftColor];
    const widest = borderWidths.indexOf(Math.max(...borderWidths));
    const color = parseColor(sides[widest] ?? "");
    if (color !== null && colorAlpha(color) > 0) box["bc"] = color;
    if (new Set(sides.filter((_side, index) => (borderWidths[index] ?? 0) > 0)).size > 1) report.add("border: a different colour per side", element);
    const borderStyle = [style.borderTopStyle, style.borderRightStyle, style.borderBottomStyle, style.borderLeftStyle][widest];
    if (borderStyle === "dashed" || borderStyle === "dotted") box["dash"] = borderStyle === "dotted" ? 1 : 2;
    else if (borderStyle !== "solid") report.add(`border-style: ${borderStyle}`, element);
  }
  const grow = parseFloat(style.flexGrow);
  if (grow > 0) box["fg"] = grow;
  const shrink = parseFloat(style.flexShrink);
  if (shrink !== 1) box["fs"] = shrink;
  if (style.flexBasis !== "auto") setDim(box, "fb", element, report, "flex-basis", style.flexBasis);
  if (style.aspectRatio !== "auto") {
    const [a = "1", b = "1"] = style.aspectRatio.replace("auto", "").split("/");
    const ratio = parseFloat(a) / (parseFloat(b) || 1);
    if (ratio > 0) box["ar"] = ratio;
  }
  const overflowX = style.overflowX;
  const overflowY = style.overflowY;
  if (overflowX === "auto" || overflowX === "scroll") box["ovx"] = 2;
  else if (overflowX !== "visible") box["ovx"] = 1;
  if (overflowY === "auto" || overflowY === "scroll") box["ovy"] = 2;
  else if (overflowY !== "visible") box["ovy"] = 1;

  const background = parseColor(style.backgroundColor);
  if (background !== null && colorAlpha(background) > 0) box["bg"] = background;
  const image = style.backgroundImage;
  if (image !== "none" && image !== "") {
    const layers: (WireLayer | { flat: number })[] = [];
    for (const part of splitTop(image, ",").reverse()) {
      if (part.startsWith("url(")) {
        box["img"] = part.slice(4, -1).replace(/^["']|["']$/g, "");
        if (style.backgroundSize === "cover") box["fit"] = 1;
        else if (style.backgroundSize === "contain") box["fit"] = 2;
        continue;
      }
      const layer = parseGradient(part);
      if (layer === null) report.add(`background-image: ${part.slice(0, 60)}`, element);
      else layers.push(layer);
    }
    if (layers.length > 0) box["ly"] = layers;
  }
  const radii = [parseRadius(style.borderTopLeftRadius), parseRadius(style.borderTopRightRadius), parseRadius(style.borderBottomRightRadius), parseRadius(style.borderBottomLeftRadius)];
  if (radii.some((radius) => radius !== 0)) box["rad"] = radii;
  const shadows = parseShadows(style.boxShadow);
  if (shadows.length > 0) box["sh"] = shadows;
  const opacity = parseFloat(style.opacity);
  if (opacity < 1) box["op"] = opacity;
  if (style.visibility === "hidden" || style.visibility === "collapse") box["op"] = 0;
  const transform = parseTransform(style.translate, style.rotate, style.scale, style.transform);
  if (transform !== null) {
    if (transform.lost !== null) report.add(`transform: ${transform.lost}`, element);
    box["tf"] = [transform.x, transform.y, transform.rotate, transform.scale, transform.fx, transform.fy];
    const origin = style.transformOrigin.split(" ");
    const ox = origin[0] ?? "50%";
    const oy = origin[1] ?? "50%";
    if (ox.endsWith("%") && oy.endsWith("%") && (ox !== "50%" || oy !== "50%")) box["to"] = [parseFloat(ox) / 100, parseFloat(oy) / 100];
  }
  const filter = style.filter;
  if (filter !== "none" && filter !== "") {
    const blur = /blur\(([\d.]+)px\)/.exec(filter);
    if (blur !== null) box["blur"] = parseFloat(blur[1] ?? "0");
    const rest = filter.replace(/blur\([^)]*\)/, "").trim();
    if (rest !== "") report.add(`filter: ${rest}`, element);
  }
  const backdrop = style.backdropFilter;
  if (backdrop !== "none" && backdrop !== "" && backdrop !== undefined) {
    const blur = /blur\(([\d.]+)px\)/.exec(backdrop);
    if (blur !== null) box["bblur"] = parseFloat(blur[1] ?? "0");
    else report.add(`backdrop-filter: ${backdrop}`, element);
  }
  if (style.clipPath !== "none" && style.clipPath !== "") report.add(`clip-path: ${style.clipPath.slice(0, 40)}`, element);
  if (style.maskImage !== "none" && style.maskImage !== "" && style.maskImage !== undefined) report.add(`mask-image: ${style.maskImage.slice(0, 40)}`, element);
  if (style.mixBlendMode !== "normal") report.add(`mix-blend-mode: ${style.mixBlendMode}`, element);
  if (style.pointerEvents !== "none" && style.visibility !== "hidden") box["hit"] = 1;
  const z = style.zIndex;
  if (z !== "auto") box["z"] = Number.parseInt(z, 10) || 0;
  return box;
}

function pseudoBox(element: Element, which: "::before" | "::after", report: MirrorReport): WireBox | null {
  const style = getComputedStyle(element, which);
  const content = style.content;
  if (content === "none" || content === "normal" || content === "" || style.display === "none") return null;
  const box = boxOf(element, style, report);
  box.id = idOf(element) * 4 + (which === "::before" ? 1 : 2) + 0x40000000;
  delete box["hit"];
  const text = /^"(.*)"$/.exec(content);
  if (text !== null && text[1] !== undefined && text[1] !== "") {
    const wire = textOf([{ text: text[1].replace(/\\([0-9a-f]{1,6}) ?/gi, (_m, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16))), style }], style, report, element);
    if (wire !== null) box["t"] = wire;
  } else if (text === null) {
    report.add(`content: ${content.slice(0, 40)}`, element);
  }
  return box;
}

/** Inline SVG as standalone markup, with the colours CSS gave it written in. */
function svgMarkup(svg: SVGSVGElement, style: CSSStyleDeclaration): string {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  const sources = [svg, ...svg.querySelectorAll("*")];
  const targets = [copy, ...copy.querySelectorAll("*")];
  const color = style.color;
  for (let i = 0; i < sources.length; i += 1) {
    const source = sources[i] as Element;
    const target = targets[i] as Element;
    const shape = getComputedStyle(source);
    for (const name of ["fill", "stroke"] as const) {
      const value = shape[name];
      if (value !== "" && value !== undefined) target.setAttribute(name, value);
    }
    for (const [attribute, value] of [["stroke-width", shape.strokeWidth], ["opacity", shape.opacity], ["fill-opacity", shape.fillOpacity], ["stroke-opacity", shape.strokeOpacity], ["stroke-linecap", shape.strokeLinecap], ["stroke-linejoin", shape.strokeLinejoin]] as const) {
      if (value !== "" && value !== undefined && value !== "1" && value !== "1px" && value !== "butt" && value !== "miter") target.setAttribute(attribute, value);
    }
    target.removeAttribute("class");
    target.removeAttribute("style");
  }
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.removeAttribute("width");
  copy.removeAttribute("height");
  return copy.outerHTML.replace(/currentcolor/gi, color);
}

/** The boxes of a `display: contents` element's children (and of nested such wrappers), in order. */
export function mirrorContents(element: Element, report: MirrorReport, inherited: Inherited): WireBox[] {
  const out: WireBox[] = [];
  const style = getComputedStyle(element);
  for (let node = element.firstChild; node !== null; node = node.nextSibling) {
    if (node.nodeType === 3) {
      const raw = node.nodeValue ?? "";
      if (raw.trim() === "") continue;
      const text = textOf([{ text: raw, style }], style, report, element);
      if (text !== null) out.push({ k: "x", id: 0, t: text, fs: 0 });
      continue;
    }
    if (node.nodeType !== 1) continue;
    const child = node as Element;
    if (getComputedStyle(child).display === "contents") {
      out.push(...mirrorContents(child, report, inherited));
      continue;
    }
    const box = mirrorElement(child, report, inherited);
    if (box !== null) out.push(box);
  }
  return out;
}

/**
 * Builds the wire box for `element` and its subtree; `null` when it draws nothing
 * (`display: none`, a script). Out-of-flow boxes whose parent is not positioned are
 * appended to the nearest positioned ancestor, which is where CSS places them.
 */
export function mirrorElement(element: Element, report: MirrorReport, inherited: Inherited = { positioned: [] }): WireBox | null {
  if (SKIP_TAGS.has(element.localName)) return null;
  const style = getComputedStyle(element);
  const display = style.display;
  if (display === "none") return null;
  const box = boxOf(element, style, report);
  const tag = element.localName;
  if (tag === "svg") {
    box["svg"] = svgMarkup(element as SVGSVGElement, style);
    const svg = element as SVGSVGElement;
    const w = svg.getAttribute("width");
    const h = svg.getAttribute("height");
    if (box["w"] === undefined && w !== null && !w.endsWith("%")) box["w"] = parseFloat(w);
    if (box["h"] === undefined && h !== null && !h.endsWith("%")) box["h"] = parseFloat(h);
    return box;
  }
  if (tag === "img") {
    const img = element as HTMLImageElement;
    box["img"] = img.currentSrc !== "" ? img.currentSrc : img.src;
    box["fit"] = style.objectFit === "cover" ? 1 : style.objectFit === "contain" ? 2 : 0;
    if (box["w"] === undefined && img.width > 0) box["w"] = img.width;
    if (box["h"] === undefined && img.height > 0) box["h"] = img.height;
    return box;
  }
  if (ISLAND_TAGS.has(tag)) {
    box["island"] = 1;
    return box;
  }
  if (tag === "input" || tag === "textarea") {
    const field = element as HTMLInputElement;
    const type = tag === "textarea" ? "" : field.type;
    if (TEXT_INPUT_TYPES.has(type)) {
      box["inp"] = { v: field.value, ph: field.placeholder ?? "", multi: tag === "textarea", secret: type === "password", off: field.disabled, rev: Number(field.dataset["jgRev"] ?? 0) };
      box["t"] = { s: "", c: parseColor(style.color) ?? 0xffffffff, ...fontOf(style) };
      return box;
    }
    report.add(`<input type=${type}>`, element);
    return box;
  }
  if (tag === "select") report.add("<select>", element);

  const children: WireBox[] = [];
  const positioned = style.position !== "static" ? children : inherited.positioned;
  const next: Inherited = { positioned };
  const before = pseudoBox(element, "::before", report);
  if (before !== null) children.push(before);

  const runs: Run[] = [];
  const onlyInline = element.firstChild !== null && inlineRuns(element, style, runs);
  if (onlyInline) {
    const text = textOf(runs, style, report, element);
    if (text !== null) box["t"] = text;
  } else {
    let inlineRow = false;
    for (let node = element.firstChild; node !== null; node = node.nextSibling) {
      if (node.nodeType === 3) {
        const raw = node.nodeValue ?? "";
        if (raw.trim() === "") continue;
        const text = textOf([{ text: raw, style }], style, report, element);
        if (text !== null) {
          children.push({ k: "x", id: 0, t: text, fs: 0 });
          inlineRow = true;
        }
        continue;
      }
      if (node.nodeType !== 1) continue;
      if (getComputedStyle(node as Element).display === "contents") {
        // A layout-free wrapper: its children are this box's children.
        for (const grandchild of mirrorContents(node as Element, report, next)) {
          if (grandchild["inl"] === 1 || grandchild.id === 0) inlineRow = true;
          children.push(grandchild);
        }
        continue;
      }
      const child = mirrorElement(node as Element, report, next);
      if (child === null) continue;
      if (child["pos"] === 2 && style.position === "static" && child["ins"] !== undefined && positioned !== children) {
        positioned.push(child);
        continue;
      }
      if (child["inl"] === 1) inlineRow = true;
      children.push(child);
    }
    // A block that holds text or inline-level boxes flows them in lines.
    if (inlineRow && box["d"] === 1) {
      delete box["d"];
      box["fw"] = 1;
      box["ai"] = 5;
      const align = style.textAlign;
      if (align === "center") box["jc"] = 3;
      else if (align === "right" || align === "end") box["jc"] = 2;
    }
  }
  const after = pseudoBox(element, "::after", report);
  if (after !== null) children.push(after);
  if (isInlineLevel(display)) box["inl"] = 1;
  if (children.length > 0) {
    // Boxes with a z-index paint in that order; in-flow ones keep their layout order.
    const floating = children.filter((child) => child["pos"] === 2 && typeof child["z"] === "number");
    if (floating.length > 0) {
      const rest = children.filter((child) => !floating.includes(child));
      floating.sort((a, b) => (a["z"] as number) - (b["z"] as number));
      box.c = [...floating.filter((child) => (child["z"] as number) < 0), ...rest, ...floating.filter((child) => (child["z"] as number) >= 0)];
    } else {
      box.c = children;
    }
  }
  return box;
}
