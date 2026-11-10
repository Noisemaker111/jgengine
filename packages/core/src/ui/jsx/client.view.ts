/**
 * Mounts an engine UI tree on a page: `createRoot(container).render(<App />)`.
 */

import { createPortal } from "./element";
import type { UiNode } from "./element";
import { domHost } from "./domHost.view";
import { Root as TreeRoot, flushSync } from "./reconciler";

export interface Root {
  render(node: UiNode): void;
  unmount(): void;
}

let rootCount = 0;

/** A root drawing `container`'s children as DOM elements. */
export function createRoot(container: Element | DocumentFragment): Root {
  rootCount += 1;
  const tree = new TreeRoot<Node>(domHost, container, rootCount === 1 ? "r" : `r${rootCount}`);
  return {
    render(node) {
      tree.render(node);
    },
    unmount() {
      tree.unmount();
    },
  };
}

export function hydrateRoot(container: Element, node: UiNode): Root {
  container.textContent = "";
  const root = createRoot(container);
  root.render(node);
  return root;
}

export { createPortal, flushSync };

export default { createRoot, hydrateRoot, createPortal, flushSync };
