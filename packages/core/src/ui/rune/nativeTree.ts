import type { Props } from "../jsx/element";
import type { Host } from "../jsx/reconciler";
import { isLive, readLive } from "../liveValue";
import type { RuneElement, RuneElementProps, RuneBoundFont } from "./element";

let nextId = 0;

/** A native host node; it has no browser element or computed style. */
export class RuneNode implements RuneElement {
  readonly id = `n${++nextId}`;
  parent: RuneNode | null = null;
  children: RuneNode[] = [];
  props: RuneElementProps = {};
  text = "";
  dirty = true;
  connected = false;
  focused: RuneNode | null = null;
  onFocus: ((node: RuneNode) => void) | null = null;
  onScroll: ((node: RuneNode) => void) | null = null;

  constructor(readonly tag: string) {}

  surface(): RuneNode {
    let node: RuneNode = this;
    while (node.parent !== null) node = node.parent;
    return node;
  }

  focus(): void {
    const surface = this.surface();
    if (surface.focused === this) return;
    surface.focused = this;
    surface.onFocus?.(this);
  }

  scrollIntoView(): void { this.surface().onScroll?.(this); }
}

/** The small protocol a native host needs; a recorder can implement it without a browser. */
export interface RuneTreeSink {
  setSpec(children: NativeWireNode[], modal: boolean): void;
  bindNumber(name: string, get: () => number): number;
  writeNumber(name: string, value: number): number;
  bindText(name: string, get: () => string): { n: number; u: number[] };
  bindProp?(id: string, field: string, get: () => unknown): unknown;
}

/** One native element in the wire protocol, using the same typed props as JSX. */
export interface NativeWireNode {
  k: "native";
  id: string;
  kind: string;
  props: Record<string, unknown>;
  children: NativeWireNode[];
}

const EVENT_PROPS = new Set(["children", "ref", "onPress", "onFocus", "onValue", "onCommit", "onAdjust", "onKey", "onEdit", "onSubmit", "onReplace", "onBack", "onDrag", "onHover", "onDrop", "holdMs", "dragValue", "modal", "autoFocus"]);
const SLOT_PROPS = new Set(["opacity", "width", "height", "x", "y", "scale"]);
const FONT_PROPS = ["size", "weight", "family", "mono", "color", "tracking", "align"] as const;

/** Serialize native nodes directly. Live values allocate slots, never component state. */
export function nativeSpec(root: RuneNode, sink: RuneTreeSink, sampleLive = false): { children: NativeWireNode[]; modal: boolean } {
  let modal = false;
  function visit(node: RuneNode, inherited: RuneBoundFont): NativeWireNode | null {
    if (node.props.hidden === true) return null;
    if (node.props.modal) modal = true;
    const font: RuneBoundFont = { ...inherited };
    for (const field of FONT_PROPS) if (node.props[field] !== undefined) Object.assign(font, { [field]: node.props[field] });
    const props: Record<string, unknown> = { ...font };
    for (const [field, value] of Object.entries(node.props)) {
      if (EVENT_PROPS.has(field) || value === undefined) continue;
      props[field] = value;
    }
    props["interactive"] = node.props.onPress !== undefined || node.props.onValue !== undefined || node.props.onCommit !== undefined || node.props.onDrop !== undefined || node.props.onHover !== undefined;
    props["focused"] = root.focused === node;
    if (node.props.onDrag !== undefined || node.props.holdMs !== undefined || node.props.dragValue !== undefined) props["drag"] = true;
    for (const [field, value] of Object.entries(props)) {
      if (!isLive(value)) continue;
      const read = () => value.get();
      const current = read();
      if (sampleLive) { props[field] = current; continue; }
      delete props[field];
      if (typeof current === "number" && SLOT_PROPS.has(field)) {
        props[`${field}Slot`] = sink.bindNumber(`${node.id}:${field}`, () => {
          const next = read();
          if (typeof next !== "number" || !Number.isFinite(next)) throw new Error(`Rune ${node.id}.${field} needs a finite number`);
          return next;
        });
      } else if (field === "text" && typeof current === "string") {
        props["textSlots"] = sink.bindText(`${node.id}:text`, () => String(read()));
      } else if (sink.bindProp !== undefined) props[field] = sink.bindProp(node.id, field, read);
      else throw new Error(`Rune live ${field} needs a native property binding sink`);
    }
    if (node.tag === "#text") props["text"] = node.text;
    if (node.tag === "rune-text" && node.props.text === undefined) props["text"] = node.children.map(nativeLabel).join("");
    return { k: "native", id: node.id, kind: node.tag.replace("rune-", ""), props,
      children: node.tag === "rune-text" ? [] : node.children.map(child => visit(child, font)).filter((child): child is NativeWireNode => child !== null) };
  }
  const font: RuneBoundFont = {};
  for (const field of FONT_PROPS) if (root.props[field] !== undefined) Object.assign(font, { [field]: root.props[field] });
  const children = root.children.map(child => visit(child, font)).filter((child): child is NativeWireNode => child !== null);
  return { children, modal: modal || root.props.modal === true };
}

/** Pure reconciler host. `flush` publishes only roots changed by a commit. */
export function nativeTreeHost(changed: (root: RuneNode) => void): Host<RuneNode> {
  const dirty = (node: RuneNode) => { const root = node.surface(); root.dirty = true; changed(root); };
  return {
    createElement: tag => new RuneNode(tag),
    createText: text => { const node = new RuneNode("#text"); node.text = text; return node; },
    setText(node, text) { if (node.text !== text) { node.text = text; dirty(node); } },
    updateProps(node, _tag, _prev, props: Props) {
      node.props = props; // type-escape: JSX host props are checked against RuneElementProps at the authoring boundary
      dirty(node);
    },
    place(parent, node, before) {
      if (node.parent === parent && parent.children[parent.children.indexOf(node) + 1] === (before ?? undefined)) return;
      if (node.parent !== null) {
        const old = node.parent;
        old.children.splice(old.children.indexOf(node), 1);
        dirty(old);
      }
      const index = before === null ? -1 : parent.children.indexOf(before);
      parent.children.splice(index < 0 ? parent.children.length : index, 0, node);
      node.parent = parent;
      dirty(parent);
    },
    remove(parent, node) {
      const at = parent.children.indexOf(node);
      if (at < 0) return;
      parent.children.splice(at, 1);
      node.parent = null;
      dirty(parent);
    },
  };
}

/** Current readable label for keyboard navigation, accessibility and test drivers. */
export function nativeLabel(node: RuneNode): string {
  return node.props.label ?? (node.props.text === undefined ? node.text + node.children.map(nativeLabel).join("") : readLive(node.props.text));
}

/** Disabled containers disable their descendants for every input device. */
export function nativeEnabled(node: RuneNode): boolean {
  for (let parent: RuneNode | null = node; parent !== null; parent = parent.parent) {
    if (readLive(parent.props.disabled ?? false) || readLive(parent.props.hidden ?? false)) return false;
  }
  return true;
}

/** Visible input scope: the last modal owns input, and hidden subtrees never participate. @internal */
export function visibleNativeNodes(root: RuneNode): RuneNode[] {
  const nodes: RuneNode[] = [];
  const visit = (node: RuneNode) => {
    if (readLive(node.props.hidden ?? false)) return;
    nodes.push(node);
    for (const child of node.children) visit(child);
  };
  visit(root);
  const modal = [...nodes].reverse().find(node => node.props.modal);
  return modal === undefined ? nodes : nodes.filter(node => {
    for (let parent: RuneNode | null = node; parent !== null; parent = parent.parent) if (parent === modal) return true;
    return false;
  });
}
