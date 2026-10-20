import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import {
  closePanel,
  closeTopPanel,
  createPanelState,
  focusPanel,
  isOpen as isPanelOpen,
  movePanel,
  openPanel,
  orderedOpen,
  panelByHotkey,
  type PanelDef,
  type PanelPosition,
  type PanelState,
} from "@jgengine/core/ui/panelModel";

import { useReducedMotion } from "./accessibility";
import { HudButton } from "./hudButton";
import { HudFrame, type HudFrameShape, type HudFrameVariation } from "./hudFrame";
import { useHudInteract, type HudInteractListener } from "./hudInteract";
import { HudPanel } from "./hudPanel";
import { hudType } from "./hudTokens";
import { observeBrowserSuspension } from "./browserLifecycle";
import { usePresence } from "./presence";

/**
 * React chrome over the headless panel/window model (`@jgengine/core/ui/panelModel`) — the toggleable,
 * draggable, z-stacked windows a WoW-style UI is made of (B for bag, C for character, ESC to close).
 * `usePanels` is the DATA/HOOK layer (open/close/toggle/focus + a keybind listener), `PanelHost` renders
 * the open windows in z-order, and `Window` is a standalone one-off window. All unskinned and
 * token-driven: games reskin via `HudTheme` tokens and by swapping the `HudFrame` variation.
 */

/** Intent a key press resolves to over a panel set: toggle a panel, close the top window, or ignore. */
export interface PanelKeyResult {
  handled: boolean;
  type?: "toggle" | "closeTop";
  id?: string;
}

/**
 * Pure keybind resolver for a panel set: ESC resolves to `closeTop` when a closable window is open, and
 * any other key routes through {@link panelByHotkey} (trying `code` then `key`) to a `toggle`. Returns
 * the intent without touching the DOM, so it unit-tests headless and `usePanels` is a thin shell over it.
 */
export function panelKeyAction(
  defs: readonly PanelDef[],
  state: PanelState,
  event: { code?: string; key?: string },
): PanelKeyResult {
  if (event.key === "Escape" || event.code === "Escape") {
    return closeTopPanel(state) === state ? { handled: false } : { handled: true, type: "closeTop" };
  }
  const id =
    (event.code !== undefined ? panelByHotkey(defs, event.code) : null) ??
    (event.key !== undefined ? panelByHotkey(defs, event.key) : null);
  return id === null ? { handled: false } : { handled: true, type: "toggle", id };
}

/** @internal True when a key event targets a text input / textarea / contenteditable, where hotkeys must not fire. */
function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (el === null || typeof el.tagName !== "string") return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable === true;
}

/** Options for {@link usePanels}. */
export interface UsePanelsOptions {
  /** Fired when a panel transitions from closed to open (not on refocus of an already-open panel). */
  onOpen?: (id: string) => void;
  /** Fired when an open panel is closed. */
  onClose?: (id: string) => void;
  /** Set false to skip installing the window keybind/ESC listener (default true). */
  hotkeys?: boolean;
}

/** The live panel manager returned by {@link usePanels} and consumed by {@link PanelHost}. */
export interface PanelsManager {
  state: PanelState;
  defs: readonly PanelDef[];
  isOpen: (id: string) => boolean;
  open: (id: string) => void;
  close: (id: string) => void;
  toggle: (id: string) => void;
  focus: (id: string) => void;
  move: (id: string, pos: PanelPosition) => void;
  byHotkey: (code: string) => string | null;
}

/**
 * The DATA/HOOK layer: wrap the core panel model in state and install a window keybind listener —
 * per-panel hotkeys toggle their window and ESC closes the topmost closable one. Hotkeys are ignored
 * while the player is typing in an input/textarea/contenteditable. The listener is cleaned up on
 * unmount and SSR-safe (armed in an effect). Feed the returned manager to {@link PanelHost}, or drive a
 * bespoke window layout from it directly.
 *
 * @capability use-panels headless toggleable-window manager with keybind + ESC handling over the core panel model
 */
export function usePanels(defs: readonly PanelDef[], options?: UsePanelsOptions): PanelsManager {
  const [state, setState] = useState<PanelState>(() => createPanelState(defs));

  const stateRef = useRef(state);
  stateRef.current = state;
  const defsRef = useRef(defs);
  defsRef.current = defs;
  const onOpenRef = useRef(options?.onOpen);
  onOpenRef.current = options?.onOpen;
  const onCloseRef = useRef(options?.onClose);
  onCloseRef.current = options?.onClose;

  const open = useCallback((id: string) => {
    const wasOpen = isPanelOpen(stateRef.current, id);
    setState((s) => openPanel(s, id));
    if (!wasOpen) onOpenRef.current?.(id);
  }, []);

  const close = useCallback((id: string) => {
    const wasOpen = isPanelOpen(stateRef.current, id);
    setState((s) => closePanel(s, id));
    if (wasOpen) onCloseRef.current?.(id);
  }, []);

  const toggle = useCallback(
    (id: string) => {
      if (isPanelOpen(stateRef.current, id)) close(id);
      else open(id);
    },
    [open, close],
  );

  const focus = useCallback((id: string) => setState((s) => focusPanel(s, id)), []);
  const move = useCallback(
    (id: string, pos: PanelPosition) => setState((s) => movePanel(s, id, pos)),
    [],
  );
  const byHotkey = useCallback((code: string) => panelByHotkey(defsRef.current, code), []);

  const hotkeysEnabled = options?.hotkeys !== false;
  useEffect(() => {
    if (!hotkeysEnabled || typeof window === "undefined") return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key !== "Escape" && isEditableTarget(event.target)) return;
      const result = panelKeyAction(defsRef.current, stateRef.current, {
        code: event.code,
        key: event.key,
      });
      if (!result.handled) return;
      event.preventDefault();
      if (result.type === "closeTop") {
        const topId = topClosableOpen(stateRef.current);
        setState((s) => closeTopPanel(s));
        if (topId !== null) onCloseRef.current?.(topId);
      } else if (result.type === "toggle" && result.id !== undefined) {
        toggle(result.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hotkeysEnabled, toggle]);

  return {
    state,
    defs,
    isOpen: (id) => isPanelOpen(state, id),
    open,
    close,
    toggle,
    focus,
    move,
    byHotkey,
  };
}

/** @internal The id the next ESC would close, so the caller can fire `onClose` with it. */
function topClosableOpen(state: PanelState): string | null {
  const next = closeTopPanel(state);
  if (next === state) return null;
  for (const id of Object.keys(state.open)) {
    if (next.open[id] !== true) return id;
  }
  return null;
}

// ---- Window chrome ---------------------------------------------------------

/** @internal Own a title-bar pointer until release or interruption, streaming positions to `onMove`. */
function beginWindowDrag(
  event: ReactPointerEvent<HTMLElement>,
  origin: PanelPosition,
  onMove: (pos: PanelPosition) => void,
  onRetire: () => void,
): (() => void) | null {
  const source = event.currentTarget;
  const view = source.ownerDocument.defaultView;
  if (view === null) return null;
  const pointerId = event.pointerId;
  const startX = event.clientX;
  const startY = event.clientY;
  const base = { x: origin.x, y: origin.y };
  let active = true;
  const retire = () => {
    if (!active) return;
    active = false;
    view.removeEventListener("pointermove", onPointerMove);
    view.removeEventListener("pointerup", onEnd);
    view.removeEventListener("pointercancel", onEnd);
    detachSuspension();
    source.removeEventListener("lostpointercapture", onEnd);
    onRetire();
    if (source.hasPointerCapture(pointerId)) source.releasePointerCapture(pointerId);
  };
  const onPointerMove = (moveEvent: PointerEvent) => {
    if (moveEvent.pointerId !== pointerId) return;
    if (!source.isConnected) { retire(); return; }
    onMove({ x: base.x + (moveEvent.clientX - startX), y: base.y + (moveEvent.clientY - startY) });
  };
  const onEnd = (endEvent: PointerEvent) => {
    if (endEvent.pointerId !== pointerId || (endEvent.type === "pointerup" && endEvent.button !== 0)) return;
    retire();
  };
  view.addEventListener("pointermove", onPointerMove);
  view.addEventListener("pointerup", onEnd);
  view.addEventListener("pointercancel", onEnd);
  const detachSuspension = observeBrowserSuspension(retire, { hidden: false, pointerLockLost: false }, { window: view, document: source.ownerDocument });
  source.addEventListener("lostpointercapture", onEnd);
  source.setPointerCapture(pointerId);
  return retire;
}

const TITLEBAR_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "8px 8px 8px 12px",
  cursor: "grab",
  touchAction: "none",
  userSelect: "none",
  fontSize: hudType("sm"),
  fontWeight: 650,
  letterSpacing: 0.2,
  borderBottom: "1px solid var(--jg-edge, rgba(255,255,255,0.10))",
};

const CLOSE_BUTTON_STYLE: CSSProperties = { width: 24, height: 24, color: "inherit", opacity: 0.8 };

/** Exit-transition length for windows; matches the stylesheet's `jg-panel-out` at `--jg-motion-fast`. */
const WINDOW_EXIT_MS = 140;

/** @internal Shared, fully-controlled window view — title bar (drag + close) plus a HudFrame body. */
function WindowView({
  title,
  ariaLabel,
  open = true,
  closable,
  onClose,
  onFocus,
  onMove,
  pos,
  z,
  width,
  variation,
  shape,
  cue,
  onInteract,
  className,
  style,
  bodyStyle,
  children,
}: {
  title: ReactNode;
  open?: boolean;
  cue?: string;
  onInteract?: HudInteractListener;
  ariaLabel?: string;
  closable: boolean;
  onClose?: () => void;
  onFocus?: () => void;
  onMove?: (pos: PanelPosition) => void;
  pos: PanelPosition;
  z?: number;
  width?: number | string;
  variation?: HudFrameVariation;
  shape?: HudFrameShape;
  className?: string;
  style?: CSSProperties;
  bodyStyle?: CSSProperties;
  children?: ReactNode;
}) {
  const retireDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => retireDrag.current?.(), []);
  useEffect(() => {
    if (!open) retireDrag.current?.();
  }, [open]);
  const reduced = useReducedMotion();
  const presence = usePresence(open, reduced ? 0 : WINDOW_EXIT_MS);
  const report = useHudInteract("window", cue, onInteract);
  const reported = useRef<boolean | null>(null);
  useEffect(() => {
    if (reported.current === open) return;
    reported.current = open;
    report(open ? "open" : "close");
  }, [open, report]);
  if (presence === "unmounted") return null;

  const frameBody = (
    <>
        <div
          data-jg-window-titlebar=""
          onPointerDown={(event) => {
            if (event.button !== 0 || !event.isPrimary || retireDrag.current !== null) return;
            onFocus?.();
            if (onMove !== undefined) {
              retireDrag.current = beginWindowDrag(event, pos, onMove, () => { retireDrag.current = null; });
            }
          }}
          style={TITLEBAR_STYLE}
        >
          <span data-jg-window-title="">{title}</span>
          {closable ? (
            <HudButton
              variant="ghost"
              size="icon"
              data-jg-window-close=""
              aria-label="Close"
              cue="window-close"
              onClick={onClose}
              onPointerDown={(event) => event.stopPropagation()}
              style={CLOSE_BUTTON_STYLE}
            >
              ✕
            </HudButton>
          ) : null}
        </div>
        <div data-jg-window-body="" style={{ padding: 12, ...bodyStyle }}>
          {children}
        </div>
    </>
  );

  return (
    <div
      role="dialog"
      aria-label={ariaLabel}
      data-jg-window=""
      data-state={presence}
      data-jg-cue={cue}
      className={className}
      onPointerDown={() => onFocus?.()}
      style={{ position: "absolute", left: pos.x, top: pos.y, zIndex: z, pointerEvents: "auto", ...style }}
    >
      {variation === undefined ? (
        <HudPanel elevation="modal" padding={0} width={width} style={shape === "square" ? { borderRadius: 0 } : undefined}>
          {frameBody}
        </HudPanel>
      ) : (
        <HudFrame variation={variation} shape={shape} width={width} padding={0} interactive>
          {frameBody}
        </HudFrame>
      )}
    </div>
  );
}

/** @internal Keeps just-closed panels rendered (closing) for `exitMs` so their exit transition plays. */
function useLeavingPanels(open: readonly PanelDef[], exitMs: number): { def: PanelDef; index: number }[] {
  const previous = useRef<readonly PanelDef[]>(open);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [leaving, setLeaving] = useState<{ def: PanelDef; index: number }[]>([]);
  const openKey = open.map((def) => def.id).join("\u0000");
  useEffect(() => {
    const openIds = new Set(open.map((def) => def.id));
    const gone = exitMs <= 0 ? [] : previous.current.map((def, index) => ({ def, index })).filter(({ def }) => !openIds.has(def.id));
    previous.current = open;
    for (const id of openIds) {
      clearTimeout(timers.current.get(id));
      timers.current.delete(id);
    }
    for (const { def } of gone) {
      timers.current.set(def.id, setTimeout(() => {
        timers.current.delete(def.id);
        setLeaving((current) => current.filter((entry) => entry.def.id !== def.id));
      }, exitMs));
    }
    setLeaving((current) => {
      const kept = current.filter(({ def }) => !openIds.has(def.id) && !gone.some((g) => g.def.id === def.id));
      return kept.length === 0 && gone.length === 0 && current.length === 0 ? current : [...kept, ...gone];
    });
  }, [openKey, exitMs]);
  useEffect(() => () => {
    for (const timer of timers.current.values()) clearTimeout(timer);
  }, []);
  return leaving;
}

/** @internal Fallback cascade position for a window whose state has no override yet. */
function cascade(index: number): PanelPosition {
  return { x: 56 + index * 28, y: 56 + index * 28 };
}

/**
 * Renders the open panels of a {@link usePanels} manager as absolutely-positioned, draggable, closable
 * windows in z-order — the WoW window layer. Each window uses {@link HudFrame} chrome, is dragged by its
 * title bar, raises focus on pointer-down, and gets its content from the `render` prop (or a `panels`
 * map). Accessible: every window is a `role="dialog"` with an `aria-label` and a focusable close button;
 * ESC-close is wired by the manager. Unskinned — art-direct via `HudTheme` tokens and the `variation`.
 *
 * The host establishes its own stacking context at `zIndexBase` (default 40) so windows always paint
 * *above* the HUD (stat bars, nameplates, frames typically sit at z 10–30) — no game should have to
 * rediscover "my vitals bar bleeds through the open window" and wrap this in a `z-*` of its own. Per-
 * window focus order still resolves inside that context, so clicking a window raises it over its peers.
 * Raise `zIndexBase` to sit above a full-screen modal, or lower it to tuck windows beneath one.
 *
 * @capability panel-host render a manager's open windows as draggable, closable, z-stacked dialogs above the HUD
 */
export function PanelHost({
  manager,
  render,
  panels,
  variation,
  shape,
  width,
  zIndexBase = 40,
  className,
  windowClassName,
  windowStyle,
  bodyStyle,
  onInteract,
}: {
  manager: PanelsManager;
  /** Called as windows open and close (`cue` is `panel:<id>`) — the seam a UI sound system hooks. */
  onInteract?: HudInteractListener;
  /** Content for a panel by id. Takes precedence over `panels`. */
  render?: (id: string) => ReactNode;
  /** Static content map by panel id, used when `render` is omitted. */
  panels?: Record<string, ReactNode>;
  variation?: HudFrameVariation;
  shape?: HudFrameShape;
  /** Default window width (per-panel unless overridden by the panel content). */
  width?: number | string;
  /** z-index of the host's stacking context — the floor every window paints above. Default 40 (above the HUD). */
  zIndexBase?: number;
  className?: string;
  windowClassName?: string;
  windowStyle?: CSSProperties;
  bodyStyle?: CSSProperties;
}) {
  const open = orderedOpen(manager.state, manager.defs);
  const leaving = useLeavingPanels(open, useReducedMotion() ? 0 : WINDOW_EXIT_MS);
  const content = (id: string): ReactNode =>
    render !== undefined ? render(id) : (panels?.[id] ?? null);
  const windows = [...open.map((def, index) => ({ def, index, open: true })), ...leaving.map((entry) => ({ ...entry, open: false }))];
  return (
    <div
      data-jg-panel-host=""
      className={className}
      style={{ position: "absolute", inset: 0, zIndex: zIndexBase, pointerEvents: "none" }}
    >
      {windows.map(({ def, index, open: isOpenWindow }) => (
        <WindowView
          key={def.id}
          open={isOpenWindow}
          cue={`panel:${def.id}`}
          onInteract={onInteract}
          title={def.title ?? def.id}
          ariaLabel={def.title ?? def.id}
          closable={def.closable !== false}
          onClose={() => manager.close(def.id)}
          onFocus={() => manager.focus(def.id)}
          onMove={(pos) => manager.move(def.id, pos)}
          pos={manager.state.pos[def.id] ?? cascade(index)}
          z={manager.state.z[def.id] ?? 1}
          width={width}
          variation={variation}
          shape={shape}
          className={windowClassName}
          style={windowStyle}
          bodyStyle={bodyStyle}
        >
          {content(def.id)}
        </WindowView>
      ))}
    </div>
  );
}

/**
 * A single standalone window — title bar, close button, and title-bar drag over {@link HudFrame} chrome —
 * usable without the {@link usePanels} manager for a one-off dialog. Position is uncontrolled (seeded by
 * `x`/`y`) unless both `x`/`y` and `onMove` are supplied, in which case the caller owns placement.
 * Accessible: `role="dialog"` with an `aria-label` and a focusable close button.
 *
 * @capability window standalone draggable, closable window primitive over HudFrame — no manager required
 */
export function Window({
  title,
  ariaLabel,
  closable = true,
  onClose,
  x,
  y,
  onMove,
  z,
  width,
  variation,
  shape,
  className,
  style,
  bodyStyle,
  cue,
  onInteract,
  children,
}: {
  title: ReactNode;
  ariaLabel?: string;
  closable?: boolean;
  /** Feedback cue name, rendered as `data-jg-cue` and passed to `onInteract`. */
  cue?: string;
  /** Called with `open` when the window mounts — the seam a UI sound system hooks. */
  onInteract?: HudInteractListener;
  onClose?: () => void;
  /** Initial (uncontrolled) or current (controlled, with `onMove`) x position. Default 56. */
  x?: number;
  /** Initial (uncontrolled) or current (controlled, with `onMove`) y position. Default 56. */
  y?: number;
  onMove?: (pos: PanelPosition) => void;
  z?: number;
  width?: number | string;
  variation?: HudFrameVariation;
  shape?: HudFrameShape;
  className?: string;
  style?: CSSProperties;
  bodyStyle?: CSSProperties;
  children?: ReactNode;
}) {
  const controlled = x !== undefined && y !== undefined && onMove !== undefined;
  const [localPos, setLocalPos] = useState<PanelPosition>({ x: x ?? 56, y: y ?? 56 });
  const pos = controlled ? { x: x, y: y } : localPos;
  const handleMove = useCallback(
    (next: PanelPosition) => {
      if (!controlled) setLocalPos(next);
      onMove?.(next);
    },
    [controlled, onMove],
  );
  const label = ariaLabel ?? (typeof title === "string" ? title : undefined);
  return (
    <WindowView
      title={title}
      ariaLabel={label}
      closable={closable}
      onClose={onClose}
      onMove={handleMove}
      pos={pos}
      z={z}
      width={width}
      variation={variation}
      shape={shape}
      className={className}
      style={style}
      bodyStyle={bodyStyle}
      cue={cue}
      onInteract={onInteract}
    >
      {children}
    </WindowView>
  );
}
