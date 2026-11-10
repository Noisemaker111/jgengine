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
  parseClipPath, parseColor,
  parseDim,
  parseGradient,
  placeLayer,
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

/** What text needs from an element's computed style, read once and kept until the element is mirrored again. */
interface TextStyle {
  display: string;
  whiteSpace: string;
  transform: string;
  color: number;
  f: string;
  z: number;
  w: number;
  i: boolean;
  lh: number;
  ls: number;
  underline: boolean;
  strike: boolean;
  align: string;
  ellipsis: boolean;
  shadow: string;
  /** Whether this element can be a span of its parent's text (no box of its own to draw). */
  mergeable: boolean;
}

const textStyles = new WeakMap<Element, TextStyle>();

function hasBoxPaint(style: CSSStyleDeclaration): boolean {
  if (style.backgroundImage !== "none") return true;
  const background = parseColor(style.backgroundColor);
  if (background !== null && colorAlpha(background) > 0) return true;
  // Space around an unpainted inline element is dropped rather than breaking the line of text it sits in.
  if (style.outlineStyle !== "none" && parsePx(style.outlineWidth) > 0) return true;
  return parsePx(style.borderTopWidth) + parsePx(style.borderBottomWidth) + parsePx(style.borderLeftWidth) + parsePx(style.borderRightWidth) > 0;
}

function readTextStyle(element: Element, style: CSSStyleDeclaration): TextStyle {
  const lineHeight = style.lineHeight;
  const decoration = style.textDecorationLine;
  const display = style.display;
  const snapshot: TextStyle = {
    display,
    whiteSpace: style.whiteSpace,
    transform: style.textTransform,
    color: parseColor(style.color) ?? 0xffffffff,
    f: style.fontFamily,
    z: parsePx(style.fontSize),
    w: style.fontWeight === "bold" ? 700 : style.fontWeight === "normal" ? 400 : parseFloat(style.fontWeight) || 400,
    i: style.fontStyle !== "normal",
    lh: lineHeight === "normal" ? 0 : parsePx(lineHeight),
    ls: style.letterSpacing === "normal" ? 0 : parsePx(style.letterSpacing),
    underline: decoration.includes("underline"),
    strike: decoration.includes("line-through"),
    align: style.textAlign,
    ellipsis: style.textOverflow === "ellipsis",
    shadow: style.textShadow,
    mergeable: display !== "none" && isInline(display) && element.localName !== "svg" && element.localName !== "img" && !hasBoxPaint(style),
  };
  textStyles.set(element, snapshot);
  return snapshot;
}

/** The kept text style of `element`, read from the browser only when it was never read or was dropped. */
function textStyleOf(element: Element): TextStyle {
  return textStyles.get(element) ?? readTextStyle(element, getComputedStyle(element));
}

interface Run {
  text: string;
  style: TextStyle;
  /** A `<br>`: a line break that white-space collapsing leaves alone. */
  hard?: boolean;
}

/** Gathers the text of an element whose content is only text and plain inline elements; false when it holds a box. */
function inlineRuns(element: Element, style: TextStyle, out: Run[], fresh: boolean): boolean {
  for (let node = element.firstChild; node !== null; node = node.nextSibling) {
    if (node.nodeType === 3) {
      const text = node.nodeValue ?? "";
      if (text !== "") out.push({ text, style });
      continue;
    }
    if (node.nodeType !== 1) continue;
    const child = node as Element;
    if (child.localName === "br") {
      out.push({ text: "\n", style, hard: true });
      continue;
    }
    const childStyle = fresh ? readTextStyle(child, getComputedStyle(child)) : textStyleOf(child);
    if (childStyle.display === "none") continue;
    if (!childStyle.mergeable) return false;
    if (!inlineRuns(child, childStyle, out, fresh)) return false;
  }
  return true;
}

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|[\u200d\ufe0f\s])+$/u;
const EMOJI_DRAWN = /\p{Emoji_Presentation}|\ufe0f/u;
const emojiPictures = new Map<string, { url: string; w: number; h: number } | null>();

/**
 * Colour emoji as a picture. Rune's fonts hold no colour glyphs, so text that is only emoji (a
 * ride's icon, a tab's mark) is drawn once by the browser, in the system's emoji font, and shown
 * as an image the size the text would take.
 */
function emojiPicture(text: string, size: number): { url: string; w: number; h: number } | null {
  if (!(size > 0) || !EMOJI_ONLY.test(text) || !EMOJI_DRAWN.test(text)) return null;
  const key = `${size}|${text}`;
  const known = emojiPictures.get(key);
  if (known !== undefined) return known;
  let made: { url: string; w: number; h: number } | null = null;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (context !== null) {
    const font = `${size}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    context.font = font;
    const w = Math.max(1, Math.ceil(context.measureText(text).width));
    const h = Math.max(1, Math.round(size * 1.25));
    const scale = 3;
    canvas.width = w * scale;
    canvas.height = h * scale;
    context.scale(scale, scale);
    context.font = font;
    context.textBaseline = "middle";
    context.fillText(text, 0, h / 2 + size * 0.04);
    made = { url: canvas.toDataURL("image/png"), w, h };
  }
  emojiPictures.set(key, made);
  return made;
}

function fontOf(style: TextStyle): { f: string; z: number; w: number; i: boolean; lh: number; ls: number } {
  return { f: style.f, z: style.z, w: style.w, i: style.i, lh: style.lh, ls: style.ls };
}

function textOf(runs: Run[], style: TextStyle, report: MirrorReport, element: Element): Record<string, unknown> | null {
  const baseColor = style.color;
  let content = "";
  const spans: Record<string, unknown>[] = [];
  let previousSpace = true;
  for (const run of runs) {
    const pre = run.style.whiteSpace === "pre" || run.style.whiteSpace === "pre-wrap";
    let text = run.hard === true ? run.text : applyCase(collapse(run.text, run.style.whiteSpace), run.style.transform);
    if (run.hard === true && content.endsWith(" ")) content = content.slice(0, -1);
    if (previousSpace && !pre && text.startsWith(" ")) text = text.slice(1);
    if (text === "") continue;
    previousSpace = text.endsWith(" ") || text.endsWith("\n");
    const start = content.length;
    content += text;
    if (run.style === style) continue;
    const span: Record<string, unknown> = { a: start, b: content.length };
    let differs = false;
    if (run.style.color !== baseColor) {
      span["c"] = run.style.color;
      differs = true;
    }
    if (run.style.w !== style.w) {
      span["w"] = run.style.w;
      differs = true;
    }
    if (run.style.z !== style.z) {
      span["z"] = run.style.z;
      differs = true;
    }
    if (run.style.i !== style.i) {
      span["i"] = run.style.i;
      differs = true;
    }
    if (run.style.underline) {
      span["u"] = true;
      differs = true;
    }
    if (run.style.f !== style.f) report.add(`inline font-family change: ${run.style.f.slice(0, 40)}`, element);
    if (differs) spans.push(span);
  }
  if (previousSpace && content.endsWith(" ")) content = content.slice(0, -1);
  if (content === "") return null;
  const nowrap = style.whiteSpace === "nowrap" || style.whiteSpace === "pre";
  const text: Record<string, unknown> = { s: content, c: baseColor, ...fontOf(style) };
  if (style.underline) spans.push({ a: 0, b: content.length, u: true });
  if (spans.length > 0) text["sp"] = spans;
  if (style.align === "center") text["al"] = 1;
  else if (style.align === "right" || style.align === "end") text["al"] = 2;
  if (nowrap) text["wr"] = style.ellipsis ? 2 : 1;
  const shadows = parseTextShadows(style.shadow);
  if (shadows.length > 0) text["ts"] = shadows;
  if (style.strike) report.add("text-decoration: line-through", element);
  return text;
}

/**
 * The text of `element` again from the styles kept at its last mirror, for a change that only
 * touched text nodes: no computed style is read. `undefined` when the element no longer holds
 * only text (it gained a box), which needs a full mirror.
 */
export function remirrorText(element: Element, report: MirrorReport): Record<string, unknown> | null | undefined {
  const style = textStyles.get(element);
  if (style === undefined) return undefined;
  const runs: Run[] = [];
  if (!inlineRuns(element, style, runs, false)) return undefined;
  return textOf(runs, style, report, element);
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
/**
 * The computed `transform` list. `getComputedStyle().transform` is `none` for an element with no
 * box (which every mirrored element is), so it is read from the typed style map instead.
 */
function transformOf(element: Element): string {
  const typed = (element as Element & { computedStyleMap?: () => { get(name: string): { toString(): string } | undefined } }).computedStyleMap?.();
  return typed?.get("transform")?.toString() ?? "none";
}

/** `@keyframes` rules by name, found again when a stylesheet is added. */
let keyframeRules = new Map<string, CSSKeyframesRule>();
let keyframeSheets = -1;

function collectKeyframes(rules: CSSRuleList, out: Map<string, CSSKeyframesRule>): void {
  for (const rule of rules) {
    if (rule instanceof CSSKeyframesRule) out.set(rule.name, rule);
    else if ("cssRules" in rule) collectKeyframes((rule as CSSGroupingRule).cssRules, out);
  }
}

function keyframesNamed(name: string): CSSKeyframesRule | undefined {
  if (keyframeSheets !== document.styleSheets.length) {
    keyframeSheets = document.styleSheets.length;
    keyframeRules = new Map();
    for (const sheet of document.styleSheets) {
      try {
        collectKeyframes(sheet.cssRules, keyframeRules);
      } catch {
        // A stylesheet from another origin keeps its rules to itself.
      }
    }
  }
  return keyframeRules.get(name);
}

const seconds = (text: string): number => (text.endsWith("ms") ? parseFloat(text) / 1000 : parseFloat(text)) || 0;
/** The animations whose end was already announced, per element. */
const announced = new WeakMap<Element, Set<string>>();

/**
 * An undisplayed element never runs its CSS animations, so the mirror shows where each one ends:
 * the last keyframe of an animation that keeps it (`forwards`), and otherwise the element's own
 * style. Code waiting on `animationend` hears it after the animation's time. A looping animation
 * shows its resting style.
 */
function animationEnd(element: Element, style: CSSStyleDeclaration): Record<string, string> | null {
  const names = style.animationName.split(", ");
  if (names.every((name) => name === "none" || name === "")) return null;
  const pick = (list: string, index: number): string => {
    const parts = list.split(", ");
    return parts[index % parts.length] ?? "";
  };
  let out: Record<string, string> | null = null;
  names.forEach((name, index) => {
    const rule = name === "none" ? undefined : keyframesNamed(name);
    if (rule === undefined) return;
    const count = pick(style.animationIterationCount, index);
    if (count === "infinite") return;
    const turns = parseFloat(count) || 1;
    let heard = announced.get(element);
    if (heard === undefined) announced.set(element, (heard = new Set()));
    if (!heard.has(name)) {
      heard.add(name);
      const wait = (seconds(pick(style.animationDelay, index)) + seconds(pick(style.animationDuration, index)) * turns) * 1000;
      setTimeout(() => {
        if (element.isConnected) element.dispatchEvent(new AnimationEvent("animationend", { animationName: name, bubbles: true }));
      }, Math.max(0, wait));
    }
    const fill = pick(style.animationFillMode, index);
    if (fill !== "forwards" && fill !== "both") return;
    const direction = pick(style.animationDirection, index);
    const backwards = direction === "reverse" || (direction === "alternate" && turns % 2 === 0) || (direction === "alternate-reverse" && turns % 2 === 1);
    const last = backwards ? ["0%", "from"] : ["100%", "to"];
    for (const frame of rule.cssRules) {
      if (!(frame instanceof CSSKeyframeRule) || !frame.keyText.split(",").some((key) => last.includes(key.trim()))) continue;
      for (const property of frame.style) {
        const value = frame.style.getPropertyValue(property);
        if (value.includes("var(")) continue;
        out ??= {};
        out[property.replace(/-([a-z])/g, (_dash, letter: string) => letter.toUpperCase())] = value;
      }
    }
  });
  return out;
}

/** `style` with `over` in place of the properties it names. */
function styleWith(style: CSSStyleDeclaration, over: Record<string, string>): CSSStyleDeclaration {
  return new Proxy(style, {
    get(target, property) {
      if (typeof property === "string" && property in over) return over[property];
      const value: unknown = Reflect.get(target, property);
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
}

/**
 * The box for `element`. An animated element is read with its animations switched off for the
 * length of the read (the browser holds an undisplayed element at each animation's first frame,
 * which is often invisible), then given the last frame of those that keep it.
 */
function boxOf(element: Element, computed: CSSStyleDeclaration, report: MirrorReport, pseudo = false): WireBox {
  const animated = !pseudo && computed.animationName.split(", ").some((name) => name !== "none" && name !== "");
  if (!animated) return boxOfStyle(element, computed, report, pseudo, null);
  const ended = animationEnd(element, computed);
  const inline = (element as HTMLElement).style;
  const hadStyle = element.hasAttribute("style");
  const prior = inline.getPropertyValue("animation");
  const priority = inline.getPropertyPriority("animation");
  inline.setProperty("animation", "none", "important");
  try {
    return boxOfStyle(element, ended === null ? computed : styleWith(computed, ended), report, pseudo, ended);
  } finally {
    if (prior === "") inline.removeProperty("animation");
    else inline.setProperty("animation", prior, priority);
    if (!hadStyle) element.removeAttribute("style");
  }
}

function boxOfStyle(element: Element, style: CSSStyleDeclaration, report: MirrorReport, pseudo: boolean, ended: Record<string, string> | null): WireBox {
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
  // A flex item that is 100% of its container across the flow fills it by stretching: that holds
  // when the container's own size comes from flexing, where a percentage has nothing to resolve against.
  if (!pseudo && (box["h"] === "100%" || box["w"] === "100%") && element.parentElement !== null) {
    const around = getComputedStyle(element.parentElement);
    if (around.display.endsWith("flex")) {
      const across = around.flexDirection.startsWith("column") ? "w" : "h";
      if (box[across] === "100%") {
        delete box[across];
        box["asf"] = 4;
      }
      // Along the flow, 100% of a container with no size of its own is the room it ends up with.
      const along = across === "w" ? "h" : "w";
      if (box[along] === "100%" && (along === "h" ? around.height : around.width) === "auto") {
        delete box[along];
        if (typeof box["fg"] !== "number" || box["fg"] < 1) box["fg"] = 1;
        if (box["fb"] === undefined) box["fb"] = 0;
      }
    }
  }
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
    if (new Set(sides.filter((_side, index) => (borderWidths[index] ?? 0) > 0)).size > 1) box["bcs"] = sides.map((side) => parseColor(side) ?? 0);
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
    const parts = splitTop(image, ",");
    const sizes = splitTop(style.backgroundSize, ",");
    const positions = splitTop(style.backgroundPosition, ",");
    const repeats = splitTop(style.backgroundRepeat, ",");
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      const part = (parts[index] ?? "").trim();
      if (part === "none") continue;
      if (part.startsWith("url(")) {
        // A background picture never sizes its box, unlike an `<img>`.
        box["bgi"] = part.slice(4, -1).replace(/^["']|["']$/g, "");
        if (style.backgroundSize === "cover") box["bfit"] = 1;
        else if (style.backgroundSize === "contain") box["bfit"] = 2;
        continue;
      }
      const layer = parseGradient(part);
      if (layer === null) report.add(`background-image: ${part.slice(0, 60)}`, element);
      else layers.push(placeLayer(layer, sizes[index % sizes.length] ?? "auto", positions[index % positions.length] ?? "0% 0%", repeats[index % repeats.length] ?? "repeat"));
    }
    if (layers.length > 0) box["ly"] = layers;
  }
  const radii = [parseRadius(style.borderTopLeftRadius), parseRadius(style.borderTopRightRadius), parseRadius(style.borderBottomRightRadius), parseRadius(style.borderBottomLeftRadius)];
  if (radii.some((radius) => radius !== 0)) box["rad"] = radii;
  const shadows = parseShadows(style.boxShadow);
  if (shadows.length > 0) box["sh"] = shadows;
  if (style.outlineStyle !== "none" && style.outlineStyle !== "") {
    const width = parsePx(style.outlineWidth);
    const color = parseColor(style.outlineColor);
    if (width > 0 && color !== null && colorAlpha(color) > 0) {
      box["ol"] = [width, parsePx(style.outlineOffset), style.outlineStyle === "dotted" ? 1 : style.outlineStyle === "dashed" ? 2 : 0];
      box["olc"] = color;
    }
  }
  const opacity = parseFloat(style.opacity);
  if (opacity < 1) box["op"] = opacity;
  if (style.visibility === "hidden" || style.visibility === "collapse") box["op"] = 0;
  const transform = parseTransform(style.translate, style.rotate, style.scale, pseudo || ended?.["transform"] !== undefined ? style.transform : transformOf(element));
  if (transform !== null) {
    if (transform.lost !== null) report.add(`transform: ${transform.lost}`, element);
    box["tf"] = [transform.x, transform.y, transform.rotate, transform.scale, transform.fx, transform.fy];
    if (transform.skew !== 0) box["sk"] = transform.skew;
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
  if (style.clipPath !== "none" && style.clipPath !== "") {
    const clip = parseClipPath(style.clipPath);
    if (clip === null) report.add(`clip-path: ${style.clipPath.slice(0, 40)}`, element);
    else box["cp"] = clip;
  }
  const mask = style.maskImage;
  if (mask !== "none" && mask !== "" && mask !== undefined) {
    // A picture used as a mask over a flat colour is that picture in that colour (a tinted icon).
    const url = /^url\(["']?(.*?)["']?\)$/.exec(mask);
    const svg = url === null || box["bg"] === undefined ? undefined : maskSvg(url[1] ?? "");
    if (svg === undefined) report.add(`mask-image: ${mask.slice(0, 40)}`, element);
    else {
      if (svg !== null) box["svg"] = tintedSvg(svg, style.backgroundColor, (style as CSSStyleDeclaration & { maskMode?: string }).maskMode === "luminance");
      delete box["bg"];
    }
  }
  if (style.mixBlendMode !== "normal") {
    // A blended layer drawn unblended would cover what it is meant to tint, so it is left out.
    report.add(`mix-blend-mode: ${style.mixBlendMode}`, element);
    delete box["bg"];
    delete box["ly"];
    delete box["bgi"];
  }
  if (style.pointerEvents !== "none" && style.visibility !== "hidden") box["hit"] = 1;
  const z = style.zIndex;
  if (z !== "auto") box["z"] = Number.parseInt(z, 10) || 0;
  // `zoom` (the HUD's fit-to-screen scale): the box lays out in `1 / zoom` of its space and is
  // drawn scaled from its top-left corner, so its content fills the same room at the new size.
  const zoom = parseFloat((style as CSSStyleDeclaration & { zoom?: string }).zoom ?? "1");
  if (Number.isFinite(zoom) && zoom > 0 && zoom !== 1) {
    const moved = (box["tf"] as number[] | undefined) ?? [0, 0, 0, 1, 0, 0];
    moved[3] = (moved[3] ?? 1) * zoom;
    box["tf"] = moved;
    if (box["to"] === undefined) box["to"] = [0, 0];
    const insets = box["ins"] as WireDim[] | undefined;
    const fit = (size: "w" | "h", near: number, far: number): void => {
      const from = insets?.[near];
      const to = insets?.[far];
      const own = box[size];
      if (own === undefined && insets !== undefined && typeof from === "number" && typeof to === "number") {
        box[size] = [-(from + to) / zoom, 1 / zoom];
        insets[far] = "auto";
      } else if (typeof own === "string" && own.endsWith("%")) {
        box[size] = [0, parseFloat(own) / 100 / zoom];
      }
    };
    fit("w", 0, 2);
    fit("h", 1, 3);
  }
  return box;
}

function pseudoBox(element: Element, which: "::before" | "::after", report: MirrorReport): WireBox | null {
  const style = getComputedStyle(element, which);
  const content = style.content;
  if (content === "none" || content === "normal" || content === "" || style.display === "none") return null;
  const box = boxOf(element, style, report, true);
  box.id = idOf(element) * 4 + (which === "::before" ? 1 : 2) + 0x40000000;
  delete box["hit"];
  const text = /^"(.*)"$/.exec(content);
  if (text !== null && text[1] !== undefined && text[1] !== "") {
    // A pseudo-element's text style is its own; nothing keeps it between mirrors.
    const snapshot = readTextStyle(element, style);
    textStyles.delete(element);
    const wire = textOf([{ text: text[1].replace(/\\([0-9a-f]{1,6}) ?/gi, (_m, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16))), style: snapshot }], snapshot, report, element);
    if (wire !== null) box["t"] = wire;
  } else if (text === null) {
    report.add(`content: ${content.slice(0, 40)}`, element);
  }
  return box;
}

/** Inline SVG as standalone markup, with the colours CSS gave it written in. */
/** SVG pictures used as masks, by URL: the markup, `null` while it loads, `undefined` for one that is not SVG. */
const maskSvgs = new Map<string, string | null | undefined>();
let maskLoaded: () => void = () => undefined;

/** Called when a mask picture has arrived and the elements that use it can be drawn. */
export function onMaskLoaded(listener: () => void): void {
  maskLoaded = listener;
}

function maskSvg(url: string): string | null | undefined {
  if (maskSvgs.has(url)) return maskSvgs.get(url);
  maskSvgs.set(url, null);
  void fetch(url)
    .then((response) => (response.ok ? response.text() : ""))
    .catch(() => "")
    .then((text) => {
      maskSvgs.set(url, text.includes("<svg") ? text : undefined);
      maskLoaded();
    });
  return null;
}

/** `svg` in one flat colour, keeping its coverage (or, for a luminance mask, its brightness as coverage). */
function tintedSvg(svg: string, color: string, luminance: boolean): string {
  const open = svg.indexOf("<svg");
  const head = svg.indexOf(">", open);
  const tail = svg.lastIndexOf("</svg>");
  if (open === -1 || head === -1 || tail === -1) return svg;
  const parts = /^rgba?\(([^)]*)\)$/.exec(color)?.[1]?.split(/[,\s/]+/).filter((part) => part !== "") ?? [];
  const flood = parts.length >= 3 ? `rgb(${parts[0]},${parts[1]},${parts[2]})` : color;
  const opacity = parts[3] ?? "1";
  const filter = `<defs><filter id="jg-tint" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">${luminance ? '<feColorMatrix in="SourceGraphic" type="luminanceToAlpha" result="cover"/>' : ""}<feFlood flood-color="${flood}" flood-opacity="${opacity}"/><feComposite in2="${luminance ? "cover" : "SourceAlpha"}" operator="in"/></filter></defs><g filter="url(#jg-tint)">`;
  return `${svg.slice(open, head + 1)}${filter}${svg.slice(head + 1, tail)}</g></svg>`;
}

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

/** Boxes with a positioned descendant that was handed up to an ancestor's list. */
const handsUp = new WeakSet<WireBox>();
/** The box last built for each element that has one of its own. */
const boxes = new WeakMap<Element, WireBox>();
/** The box whose `c` list holds a given box. */
const owners = new WeakMap<WireBox, WireBox>();

export function boxOfElement(element: Element): WireBox | undefined {
  return boxes.get(element);
}

export function ownerOf(box: WireBox): WireBox | undefined {
  return owners.get(box);
}

/** Record `children` as `box`'s list, in paint order. */
function adopt(box: WireBox, children: WireBox[]): void {
  if (children.length === 0) {
    delete box.c;
    return;
  }
  // In-flow boxes keep their layout order. An out-of-flow box paints by its z-index: under the
  // flow when it is negative or lower than an in-flow sibling's, above it otherwise.
  const z = (child: WireBox): number | null => (typeof child["z"] === "number" ? child["z"] : null);
  let flowTop = 0;
  for (const child of children) if (child["pos"] !== 2) flowTop = Math.max(flowTop, z(child) ?? 0);
  const under: WireBox[] = [];
  const over: WireBox[] = [];
  const rest: WireBox[] = [];
  for (const child of children) {
    const level = z(child);
    if (child["pos"] !== 2 || (level === null && flowTop === 0)) rest.push(child);
    else if ((level ?? 0) < 0 || (level ?? 0) < flowTop) under.push(child);
    else if (level === null) rest.push(child);
    else over.push(child);
  }
  if (under.length > 0 || over.length > 0) {
    const byLevel = (a: WireBox, b: WireBox): number => (z(a) ?? 0) - (z(b) ?? 0);
    box.c = [...under.sort(byLevel), ...rest, ...over.sort(byLevel)];
  } else {
    box.c = children;
  }
  for (const child of box.c) owners.set(child, box);
}

/** A layer's root box: the viewport, holding the mirrored children of `container`. */
export function mirrorRoot(container: Element, report: MirrorReport): WireBox {
  const root: WireBox = { k: "x", id: idOf(container), pos: 2, ins: [0, 0, 0, 0], d: 1 };
  const children: WireBox[] = [];
  children.push(...mirrorContents(container, report, { positioned: children }));
  adopt(root, children);
  boxes.set(container, root);
  return root;
}

/** The boxes of a `display: contents` element's children (and of nested such wrappers), in order. */
export function mirrorContents(element: Element, report: MirrorReport, inherited: Inherited): WireBox[] {
  const out: WireBox[] = [];
  const style = readTextStyle(element, getComputedStyle(element));
  boxes.delete(element);
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
  boxes.delete(element);
  if (SKIP_TAGS.has(element.localName)) return null;
  const style = getComputedStyle(element);
  const display = style.display;
  if (display === "none") {
    textStyles.delete(element);
    return null;
  }
  const box = boxOf(element, style, report);
  boxes.set(element, box);
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
  const textStyle = readTextStyle(element, style);
  if (tag === "input" || tag === "textarea") {
    const field = element as HTMLInputElement;
    const type = tag === "textarea" ? "" : field.type;
    if (TEXT_INPUT_TYPES.has(type)) {
      box["inp"] = { v: field.value, ph: field.placeholder ?? "", multi: tag === "textarea", secret: type === "password", off: field.disabled, rev: Number(field.dataset["jgRev"] ?? 0) };
      box["t"] = { s: "", c: textStyle.color, ...fontOf(textStyle) };
      return box;
    }
    if (type === "checkbox" || type === "radio") {
      // The browser's own tick box has no CSS to read: a small square (or disc) in the accent colour when on.
      const accent = parseColor(style.accentColor) ?? parseColor(style.color) ?? 0xffffffff;
      const side = Math.max(parsePx(style.width), parsePx(style.height), 13);
      box["w"] = side;
      box["h"] = side;
      box["fs"] = 0;
      box["bw"] = [1, 1, 1, 1];
      box["bc"] = field.checked ? accent : (parseColor(style.color) ?? 0xffffffff);
      if (field.checked) box["bg"] = accent;
      else delete box["bg"];
      box["rad"] = type === "radio" ? [9999, 9999, 9999, 9999] : [3, 3, 3, 3];
      return box;
    }
    if (type === "range") {
      // A slider as its track with the filled share in the accent colour.
      const min = Number(field.min === "" ? 0 : field.min);
      const max = Number(field.max === "" ? 100 : field.max);
      const share = max > min ? Math.min(1, Math.max(0, (Number(field.value) - min) / (max - min))) : 0;
      const accent = parseColor(style.accentColor) ?? parseColor(style.color) ?? 0xffffffff;
      if (box["h"] === undefined) box["h"] = 6;
      box["rad"] = [9999, 9999, 9999, 9999];
      box["bg"] = 0x80808066;
      box["ovx"] = 1;
      box["ovy"] = 1;
      box["d"] = 1;
      box.c = [{ k: "x", id: 0, d: 1, w: `${share * 100}%`, h: "100%", bg: accent }];
      return box;
    }
    report.add(`<input type=${type}>`, element);
    return box;
  }
  if (tag === "select") {
    // A closed list shows the option it is on; a click moves to the next one (`runeInput`).
    const list = element as HTMLSelectElement;
    const label = list.selectedOptions[0]?.label ?? "";
    const text = textOf([{ text: label, style: textStyle }], textStyle, report, element);
    if (text !== null) box["t"] = text;
    box["txt"] = 1;
    return box;
  }

  const children: WireBox[] = [];
  const positioned = style.position !== "static" ? children : inherited.positioned;
  const next: Inherited = { positioned };
  const hoistedBefore = inherited.positioned.length;
  const before = pseudoBox(element, "::before", report);
  if (before !== null) children.push(before);

  const runs: Run[] = [];
  const onlyInline = element.firstChild !== null && inlineRuns(element, textStyle, runs, true);
  if (onlyInline) {
    const text = textOf(runs, textStyle, report, element);
    const picture = text === null ? null : emojiPicture(String(text["s"]), Number(text["z"]));
    if (picture !== null) {
      // Not marked as a text box: a change of its text mirrors the element again.
      box["img"] = picture.url;
      box["fit"] = 2;
      if (box["w"] === undefined) box["w"] = picture.w;
      if (box["h"] === undefined) box["h"] = picture.h;
    } else {
      if (text !== null) box["t"] = text;
      box["txt"] = 1;
    }
  } else {
    let inlineRow = false;
    for (let node = element.firstChild; node !== null; node = node.nextSibling) {
      if (node.nodeType === 3) {
        const raw = node.nodeValue ?? "";
        if (raw.trim() === "") continue;
        const text = textOf([{ text: raw, style: textStyle }], textStyle, report, element);
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
        child["up"] = 1;
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
      box["row"] = 1;
      const align = style.textAlign;
      if (align === "center") box["jc"] = 3;
      else if (align === "right" || align === "end") box["jc"] = 2;
      // A block among them takes a line of its own, as wide as the box.
      for (const child of children) {
        if (child.id !== 0 && child["inl"] !== 1 && child["pos"] !== 2 && child["w"] === undefined && child["fb"] === undefined) child["fb"] = "100%";
      }
    }
  }
  // A grid item placed at the start, middle or end of its cell is as wide as its content, but no
  // wider than the cell (CSS `fit-content`); the layout engine would let it run past.
  if (box["d"] === 2) {
    const containerAlign = box["ji"];
    for (const child of children) {
      const align = child["jsf"] ?? containerAlign;
      if ((align === 1 || align === 2 || align === 3) && child["pos"] !== 2 && child["w"] === undefined && child["mxw"] === undefined) child["mxw"] = "100%";
    }
  }
  const after = pseudoBox(element, "::after", report);
  if (after !== null) children.push(after);
  if (isInlineLevel(display)) box["inl"] = 1;
  adopt(box, children);
  // A box under this one was handed up to a positioned ancestor's list.
  if (positioned !== children && inherited.positioned.length > hoistedBefore) handsUp.add(box);
  return box;
}

/**
 * Mirrors `element` again in place after it changed; returns the box to send as a patch, or
 * `null` when the change reaches outside the element (it appeared, vanished, moved to or from
 * a positioned ancestor, or changed how its parent flows) and the parent must be mirrored.
 */
export function remirrorElement(element: Element, report: MirrorReport): WireBox | null {
  const old = boxes.get(element);
  // A box that handed one up cannot be read again alone: the one it handed up lives in an
  // ancestor's list, and would stay there after its element is gone.
  if (old === undefined || old["up"] === 1 || handsUp.has(old)) return null;
  const owner = owners.get(old);
  if (owner === undefined || owner.c === undefined) return null;
  const sink: WireBox[] = [];
  const box = mirrorElement(element, report, { positioned: sink });
  if (box === null || sink.length > 0 || box["inl"] !== old["inl"] || (box["pos"] === 2) !== (old["pos"] === 2) || box["z"] !== old["z"]) {
    boxes.set(element, old);
    return null;
  }
  const at = owner.c.indexOf(old);
  if (at === -1) return null;
  owner.c[at] = box;
  owners.set(box, owner);
  return box;
}
