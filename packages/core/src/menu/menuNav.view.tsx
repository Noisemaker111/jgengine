/** @jsxImportSource @jgengine/core/ui/jsx */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefCallback } from "@jgengine/core/ui/jsx";
import type { KeyboardEvent as ReactKeyboardEvent } from "@jgengine/core/ui/jsx/dom.view";

import {
  menuIntentForPadAxis,
  menuIntentForPadButton,
  menuIntentForKey,
  menuNavIdAt,
  menuNavIndex,
  menuNavMove,
  shouldRepeatMenuNav,
  type MenuIntent,
  type MenuNavDirection,
  type MenuNavRepeat,
} from "@jgengine/core/menu/menuNav";

export interface MenuNavItemProps {
  "data-jg-menu-item": string;
  tabIndex: number;
  "aria-current"?: "true";
  ref: RefCallback<HTMLElement>;
  onPointerEnter: () => void;
  onFocus: () => void;
}

export interface MenuNavContainerProps {
  "data-jg-menu-nav": "";
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
}

export interface MenuNavController {
  activeId: string | null;
  setActive: (id: string | null) => void;
  move: (direction: MenuNavDirection) => void;
  itemProps: (id: string) => MenuNavItemProps;
  containerProps: MenuNavContainerProps;
}

export interface UseMenuNavOptions {
  ids: readonly string[];
  columns?: number;
  wrap?: boolean;
  disabled?: readonly string[];
  initialId?: string;
  enabled?: boolean;
  onConfirm?: (id: string) => void;
  /**
   * Left/right (arrow keys, d-pad, left stick) change the focused item's value by one step instead of
   * moving focus. Give it to a menu whose items are settings rows; hold-to-repeat applies, so a held
   * direction steps repeatedly. Up/down and confirm/back are unchanged.
   */
  onAdjust?: (id: string, delta: -1 | 1) => void;
  onBack?: () => void;
  gamepad?: boolean;
  repeat?: MenuNavRepeat;
}

function isTextEntry(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (element === null || typeof element.closest !== "function") return false;
  return element.closest("input, textarea, select, [contenteditable]:not([contenteditable=false])") !== null;
}

/**
 * Bind a menu's focus order to the DOM: arrow keys, WASD, Home/End and a standard gamepad move a
 * roving focus, Enter/Space/A confirm, Escape/Backspace/B/Start go back. Tab is left to the browser,
 * so a menu never traps focus, and typing in a text field is never intercepted. The menu is pure
 * state + listeners — it unmounts with the screen, so it costs nothing during play.
 *
 * @capability use-menu-nav keyboard and gamepad focus navigation for a menu — roving focus order, confirm/back, disabled-item skipping, no focus trap
 */
export function useMenuNav({
  ids,
  columns = 1,
  wrap = true,
  disabled,
  initialId,
  enabled = true,
  onConfirm,
  onBack,
  onAdjust,
  gamepad = true,
  repeat,
}: UseMenuNavOptions): MenuNavController {
  const disabledIndices = useMemo(() => {
    if (disabled === undefined || disabled.length === 0) return undefined;
    return disabled.map((id) => ids.indexOf(id)).filter((index) => index >= 0);
  }, [disabled, ids]);

  const firstEnabled = useMemo(() => {
    for (let index = 0; index < ids.length; index += 1) {
      if (disabledIndices === undefined || !disabledIndices.includes(index)) return index;
    }
    return -1;
  }, [ids, disabledIndices]);

  const [activeIndex, setActiveIndex] = useState(() => {
    const initial = initialId === undefined ? -1 : ids.indexOf(initialId);
    return initial >= 0 ? initial : firstEnabled;
  });
  const activeId = menuNavIdAt(ids, activeIndex);

  const idsRef = useRef(ids);
  idsRef.current = ids;
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  const callbacks = useRef({ onConfirm, onBack, onAdjust });
  callbacks.current = { onConfirm, onBack, onAdjust };

  const elements = useRef(new Map<string, HTMLElement>());
  const pendingFocus = useRef(true);
  // The first pass claims focus only when nothing else owns it; later moves focus the new item.
  const claimed = useRef(false);
  const firstEnablePass = useRef(true);

  const focusActive = useCallback(() => {
    const id = menuNavIdAt(idsRef.current, activeIndexRef.current);
    if (id === null) return;
    elements.current.get(id)?.focus({ preventScroll: true });
  }, []);

  // A control or dialog that already owns focus keeps it; the first move brings focus into the menu. Without
  // this a menu mounted inside a dialog takes focus from the dialog's own initial control, and the dialog's
  // opener is never restored on close.
  const claimFocus = useCallback(() => {
    const active = typeof document === "undefined" ? null : document.activeElement;
    if (active !== null && active !== document.body && active !== document.documentElement) return;
    focusActive();
  }, [focusActive]);

  const move = useCallback(
    (direction: MenuNavDirection) => {
      const layout = {
        count: idsRef.current.length,
        columns,
        wrap,
        ...(disabledIndices === undefined ? {} : { disabled: disabledIndices }),
      };
      const next = menuNavMove(activeIndexRef.current, direction, layout);
      if (next < 0 || next === activeIndexRef.current) return;
      pendingFocus.current = true;
      setActiveIndex(next);
    },
    [columns, disabledIndices, wrap],
  );

  const setActive = useCallback((id: string | null) => {
    const index = menuNavIndex(idsRef.current, id);
    if (index < 0) return;
    pendingFocus.current = false;
    setActiveIndex(index);
  }, []);

  const activate = useCallback((id: string | null) => {
    if (id !== null) callbacks.current.onConfirm?.(id);
  }, []);

  const runIntent = useCallback(
    (intent: MenuIntent) => {
      if (intent === "confirm") activate(menuNavIdAt(idsRef.current, activeIndexRef.current));
      else if (intent === "back") callbacks.current.onBack?.();
      else if (intent === "left" || intent === "right") {
        const adjust = callbacks.current.onAdjust;
        if (adjust === undefined) {
          move(intent);
          return;
        }
        const id = menuNavIdAt(idsRef.current, activeIndexRef.current);
        if (id !== null) adjust(id, intent === "right" ? 1 : -1);
      } else move(intent);
    },
    [activate, move],
  );

  const runIntentRef = useRef(runIntent);
  runIntentRef.current = runIntent;
  const repeatRef = useRef(repeat);
  repeatRef.current = repeat;

  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    if (claimed.current) {
      focusActive();
      return;
    }
    claimed.current = true;
    claimFocus();
  }, [activeIndex, claimFocus, focusActive]);

  useEffect(() => {
    if (!enabled) return;
    pendingFocus.current = true;
    if (firstEnablePass.current) {
      firstEnablePass.current = false;
      claimFocus();
      return;
    }
    focusActive();
  }, [enabled, claimFocus, focusActive]);

  useEffect(() => {
    const index = ids.indexOf(activeId ?? "");
    if (activeId !== null && index >= 0) return;
    setActiveIndex(firstEnabled);
  }, [ids, activeId, firstEnabled]);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (!enabled || event.defaultPrevented || isTextEntry(event.target)) return;
      const intent = menuIntentForKey(event.code);
      if (intent === null) return;
      const target = event.target as HTMLElement;
      const nativeActivate =
        intent === "confirm" &&
        typeof target.closest === "function" &&
        target.closest("button, a[href], [role='button'], summary") !== null;
      if (intent === "back") {
        if (callbacks.current.onBack === undefined) return;
        event.preventDefault();
        callbacks.current.onBack();
        return;
      }
      if (nativeActivate) return;
      event.preventDefault();
      runIntent(intent);
    },
    [enabled, runIntent],
  );

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    const onWindowKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || isTextEntry(event.target)) return;
      const target = event.target as HTMLElement | null;
      if (target !== null && typeof target.closest === "function" && target.closest("[data-jg-menu-nav]") !== null) return;
      const intent = menuIntentForKey(event.code);
      if (intent === null) return;
      if (intent === "back") {
        if (callbacks.current.onBack === undefined) return;
        event.preventDefault();
        callbacks.current.onBack();
        return;
      }
      event.preventDefault();
      runIntent(intent);
    };
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [enabled, runIntent]);

  useEffect(() => {
    if (!enabled || !gamepad) return;
    if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return;
    if (typeof requestAnimationFrame !== "function") return;

    const held = new Map<number, { pressedAt: number; lastFiredAt: number | null }>();
    let stick: { intent: MenuNavDirection; pressedAt: number; lastFiredAt: number | null } | null = null;
    let previousPressed = new Set<number>();
    let frame = 0;

    const poll = (): void => {
      frame = requestAnimationFrame(poll);
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (isTextEntry(document.activeElement)) return;
      const pads = navigator.getGamepads();
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      let pad: Gamepad | null = null;
      for (const candidate of pads) {
        if (candidate !== null && candidate.connected) {
          pad = candidate;
          break;
        }
      }
      if (pad === null) {
        held.clear();
        previousPressed = new Set();
        stick = null;
        return;
      }
      const pressed = new Set<number>();
      for (let button = 0; button < pad.buttons.length; button += 1) {
        if (pad.buttons[button]?.pressed === true) pressed.add(button);
      }
      for (const button of pressed) {
        const intent = menuIntentForPadButton(button);
        if (intent === null) continue;
        const isNew = !previousPressed.has(button);
        const record = held.get(button);
        if (intent === "confirm" || intent === "back") {
          if (isNew) runIntent(intent);
          continue;
        }
        if (isNew) {
          held.set(button, { pressedAt: now, lastFiredAt: now });
          runIntentRef.current(intent);
          continue;
        }
        if (record !== undefined && shouldRepeatMenuNav(now, record, repeatRef.current)) {
          record.lastFiredAt = now;
          runIntentRef.current(intent);
        }
      }
      for (const button of [...held.keys()]) if (!pressed.has(button)) held.delete(button);
      previousPressed = pressed;

      const horizontal = menuIntentForPadAxis(0, pad.axes[0] ?? 0);
      const vertical = menuIntentForPadAxis(1, pad.axes[1] ?? 0);
      const axisIntent = horizontal ?? vertical;
      if (axisIntent === null) {
        stick = null;
        return;
      }
      if (stick === null || stick.intent !== axisIntent) {
        stick = { intent: axisIntent, pressedAt: now, lastFiredAt: now };
        runIntentRef.current(axisIntent);
        return;
      }
      if (shouldRepeatMenuNav(now, stick, repeatRef.current)) {
        stick.lastFiredAt = now;
        runIntentRef.current(axisIntent);
      }
    };

    frame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frame);
  }, [enabled, gamepad]);

  const itemProps = useCallback(
    (id: string): MenuNavItemProps => {
      const active = id === activeId;
      return {
        "data-jg-menu-item": id,
        tabIndex: active ? 0 : -1,
        ...(active ? { "aria-current": "true" as const } : {}),
        ref: (node: HTMLElement | null) => {
          if (node === null) elements.current.delete(id);
          else elements.current.set(id, node);
        },
        onPointerEnter: () => setActive(id),
        onFocus: () => setActive(id),
      };
    },
    [activeId, setActive],
  );

  const containerProps = useMemo<MenuNavContainerProps>(
    () => ({
      "data-jg-menu-nav": "",
      onKeyDown,
    }),
    [onKeyDown],
  );

  return { activeId, setActive, move, itemProps, containerProps };
}

export type MenuNavRender = (nav: MenuNavController) => ReactNode;

