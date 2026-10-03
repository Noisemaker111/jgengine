import { useEffect, useRef, type RefObject } from "react";

interface FocusOwner {
  root: HTMLElement;
  restore: HTMLElement | null;
}

const owners = new WeakMap<Document, FocusOwner[]>();

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(
    'a[href],button,textarea,input,select,[tabindex]',
  )).filter((element) => {
    if (element.tabIndex < 0 || element.matches(":disabled") || element.closest("[hidden],[inert]")) return false;
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    return style?.visibility !== "hidden" && style?.visibility !== "collapse" && element.getClientRects().length > 0;
  });
}

function focusInitial(root: HTMLElement, options: DialogBehaviorOptions): void {
  const controls = focusableWithin(root);
  const preferred = options.initialFocus === "root" ? root : options.initialFocus?.();
  (preferred !== null && preferred !== undefined && (preferred === root || controls.includes(preferred))
    ? preferred : controls[0] ?? root).focus();
}

/** Options for controlled dialog focus behavior; callers own markup, state, and close policy. */
export interface DialogBehaviorOptions {
  /** Whether the dialog is mounted and open. */
  open: boolean;
  /** Escape requests a close; leaving `open` true keeps the dialog active. Omit to disable Escape. */
  onClose?: () => void;
  /** Preferred initial focus, falling back to the first available control or the dialog root. */
  initialFocus?: "root" | (() => HTMLElement | null);
  /** Refocus when the content identity changes, without replacing the original return target. */
  focusKey?: unknown;
}

/**
 * Focus entry, Tab trapping, Escape requests, and focus restoration for a caller-owned dialog.
 * Attach the returned ref to the dialog root and supply `role="dialog"`, `aria-modal`, an accessible
 * name, and `tabIndex={-1}`. The most recently opened dialog handles keys, including portal roots.
 * Closing an inner dialog restores its opener; cleanup never steals focus from another active dialog.
 * Replacing the root while open keeps its position and original return target.
 *
 * @capability dialog-behavior controlled dialog focus and keyboard behavior without owning markup or screen state
 */
export function useDialogBehavior<T extends HTMLElement = HTMLDivElement>(
  options: DialogBehaviorOptions,
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const activeOwner = useRef<FocusOwner | null>(null);
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    const root = ref.current;
    if (!options.open || root === null) return;
    const document = root.ownerDocument;
    const stack = owners.get(document) ?? [];
    owners.set(document, stack);
    const owner: FocusOwner = { root, restore: document.activeElement as HTMLElement | null };
    activeOwner.current = owner;
    const child = stack.findIndex((entry) => root.contains(entry.root));
    if (child < 0) stack.push(owner);
    else stack.splice(child, 0, owner);
    const keydown = (event: KeyboardEvent) => {
      if (stack.at(-1) !== owner || event.defaultPrevented) return;
      if (event.key === "Escape" && latest.current.onClose !== undefined) {
        event.preventDefault();
        event.stopPropagation();
        latest.current.onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const root = owner.root;
      const controls = focusableWithin(root);
      const first = controls[0], last = controls.at(-1);
      const active = document.activeElement;
      if (first === undefined || !root.contains(active) || active === root ||
          (event.shiftKey ? active === first : active === last)) {
        event.preventDefault();
        event.stopPropagation();
        (event.shiftKey ? last : first)?.focus();
        if (first === undefined) root.focus();
      }
    };
    document.addEventListener("keydown", keydown, true);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      const wasTop = stack.at(-1) === owner;
      const index = stack.indexOf(owner);
      if (index >= 0) stack.splice(index, 1);
      for (const entry of stack) {
        if (entry.restore !== null && owner.root.contains(entry.restore)) entry.restore = owner.restore;
      }
      if (wasTop && owner.restore?.isConnected && !owner.restore.closest("[hidden],[inert]")) {
        owner.restore.focus();
      }
      if (stack.length === 0) owners.delete(document);
      activeOwner.current = null;
    };
  }, [options.open]);

  useEffect(() => {
    const root = ref.current;
    const owner = activeOwner.current;
    if (!options.open || root === null || owner === null || owner.root === root) return;
    const stack = owners.get(owner.root.ownerDocument);
    for (const entry of stack ?? []) {
      if (entry !== owner && entry.restore !== null && owner.root.contains(entry.restore)) entry.restore = root;
    }
    owner.root = root;
    if (stack?.at(-1) === owner) focusInitial(root, latest.current);
  });

  useEffect(() => {
    const root = ref.current;
    if (!options.open || root === null || owners.get(root.ownerDocument)?.at(-1)?.root !== root) return;
    focusInitial(root, latest.current);
  }, [options.open, options.focusKey]);

  return ref;
}
