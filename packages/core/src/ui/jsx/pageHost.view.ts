import type { Host } from "./reconciler";
import { domHost } from "./domHost.view";
import { RuneNode, nativeTreeHost } from "../rune/nativeTree";
import { syncNativeSurface, removeNativeSurface } from "../rune/nativeSurface.view";

type PageNode = Node | RuneNode;
const dirty = new Set<RuneNode>();
const native = nativeTreeHost(root => dirty.add(root));

/** One JSX tree can contain native surfaces and ordinary page tooling, sharing all providers. */
export const pageHost: Host<PageNode> = {
  createElement(tag, parent) {
    if (tag.startsWith("rune-")) return native.createElement(tag, parent instanceof RuneNode ? parent : null);
    if (parent instanceof RuneNode) throw new Error(`Native Rune UI cannot contain <${tag}>; use typed Rune elements`);
    return domHost.createElement(tag, parent);
  },
  createText(text, parent) {
    return parent instanceof RuneNode ? native.createText(text, parent) : domHost.createText(text, parent);
  },
  setText(node, text) { if (node instanceof RuneNode) native.setText(node, text); else domHost.setText(node, text); },
  updateProps(node, tag, prev, next) {
    if (node instanceof RuneNode) native.updateProps(node, tag, prev, next);
    else domHost.updateProps(node, tag, prev, next);
  },
  place(parent, node, before) {
    if (parent instanceof RuneNode) {
      if (!(node instanceof RuneNode) || (before !== null && !(before instanceof RuneNode))) throw new Error("DOM content cannot enter a Rune surface");
      native.place(parent, node, before);
    } else if (node instanceof RuneNode) {
      if (node.tag !== "rune-surface") throw new Error("Rune elements must live inside RuneSurface");
      node.connected = true;
      dirty.add(node);
    } else domHost.place(parent, node, before instanceof RuneNode ? null : before);
  },
  remove(parent, node) {
    if (parent instanceof RuneNode && node instanceof RuneNode) native.remove(parent, node);
    else if (node instanceof RuneNode) { node.connected = false; dirty.delete(node); removeNativeSurface(node); }
    else if (!(parent instanceof RuneNode)) domHost.remove(parent, node);
  },
  childrenPlaced(parent) { if (!(parent instanceof RuneNode)) domHost.childrenPlaced?.(parent); },
  commitDone() {
    for (const node of dirty) syncNativeSurface(node.surface());
    dirty.clear();
  },
};
