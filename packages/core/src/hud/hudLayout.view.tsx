import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  HUD_ANCHOR_FRACTIONS,
  anchoredPlacement,
  createHudLayout,
  isPanelDraggable,
  registerActiveHudLayout,
  type HudAnchor,
  type HudLayoutStore,
  type HudSize,
} from "@jgengine/core/hud/hudLayout";
import {
  resizePanelSize,
  resolvePanelResize,
  type EditorUiDocument,
  type HudResizeAxes,
} from "@jgengine/core/hud/hudDocument";
import { hudScaleForViewport, overflowingPanels, resolveHudFit } from "@jgengine/core/hud/hudScale";
import type { HudOverflow } from "@jgengine/core/hud/hudScale";
import {
  detectLayoutCollisions,
  formatLayoutCollisions,
  hudBlockRegion,
  isMobileMode,
  type HudPriority,
  type LayoutCollisionPolicy,
  type LayoutRect,
  type MobileHudBehavior,
} from "@jgengine/core/hud/hudPriority";
import type { GamePhase } from "@jgengine/core/game/gamePhase";
import { useDisplayProfile } from "@jgengine/core/ui/display.view";
import { useEngineState } from "@jgengine/react/engineStore";
import { useGameLayoutMode, useGameViewportLayout, useRegisterLayoutRegion } from "@jgengine/core/ui/viewport.view";
import { useOptionalGamePhase } from "@jgengine/react/hooks";
import { arrangeHudPanels, type HudPanelClaim, type HudPanelLayout } from "./hudPanelLayout";
import { useHudLayoutPersist } from "./hudLayoutPersist.view";
import { useHudViewport } from "./hudViewport.view";
import { hudFont, hudType } from "./hudTokens";

/** Whether a HUD element opted into `showDuring` is visible in the current phase; `undefined` = always visible (default). */
export function hudVisibleInPhase(showDuring: readonly GamePhase[] | undefined, phase: GamePhase): boolean {
  return showDuring === undefined || showDuring.includes(phase);
}

const STORAGE_PREFIX = "jg:hud:";
const DRAG_THRESHOLD_PX = 4;
const PERSIST_DELAY_MS = 200;
const EDIT_BAR_Z = 100000;
const PANEL_GAP = 10;
const COMPACT_HUD_SCALE = 0.85;

/**
 * Attribute a game puts on any HUD surface it *wants* to bleed past the viewport
 * (a full-bleed backdrop, a deliberately clipped ticker), so the boundary check
 * skips it. Opt-out, on purpose: the default is that shown UI must fit on screen.
 */
const ALLOW_OVERFLOW_ATTR = "data-hud-allow-overflow";
/** Opt-in marker for a custom window mounted deeper than a direct HudCanvas child. */
const WINDOW_ATTR = "data-hud-window";

/**
 * Dev-only, prod-safe. The on-screen boundary overlay must never reach players,
 * so anything we cannot positively identify as a dev build resolves to `false`.
 *
 * `import.meta.env.DEV` is read as a literal member chain because Vite replaces
 * exactly those words at transform time; reading `env` off a cast `import.meta`
 * survives to the browser as `undefined` and every dev-only report stays dark.
 */
function isDevBuild(): boolean {
  try {
    // Literal members on purpose: Vite replaces exactly `import.meta.env.DEV`.
    // Inlined as plain `@ts-ignore` because a workspace-wide type program that
    // includes `vite/client` would otherwise fail an unused-directive check.
    // @ts-ignore -- `vite/client` types are not part of this package's own tsconfig
    if (import.meta.env.DEV === true) return true;
    // @ts-ignore -- `vite/client` types are not part of this package's own tsconfig
    if (import.meta.env.PROD === true) return false;
  } catch {
    /* import.meta.env unavailable under this bundler */
  }
  const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env?.["NODE_ENV"];
  if (typeof nodeEnv === "string") return nodeEnv !== "production";
  return false;
}

/** True unless the element (or an ancestor) is hidden, collapsed, or removed from the a11y tree. */
function isSurfaceShown(el: Element): boolean {
  if (el.closest('[aria-hidden="true"]') !== null) return false;
  const checkable = el as Element & {
    checkVisibility?: (options?: Record<string, boolean>) => boolean;
  };
  if (typeof checkable.checkVisibility === "function") {
    return checkable.checkVisibility({
      contentVisibilityAuto: true,
      opacityProperty: true,
      visibilityProperty: true,
    });
  }
  if (typeof getComputedStyle !== "function") return true;
  const style = getComputedStyle(el);
  return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) > 0.01;
}

function surfaceId(el: Element): string {
  return (
    el.getAttribute("data-hud-panel") ??
    el.getAttribute(WINDOW_ATTR) ??
    el.getAttribute("data-hud-id") ??
    el.getAttribute("aria-label") ??
    (el.id.length > 0 ? el.id : null) ??
    "<ui>"
  );
}

/**
 * Every HUD surface whose bounds we hold to the viewport: registered panels,
 * any element tagged as a window, and the game's own direct children of the
 * canvas (custom modals dropped straight into the HUD layer). Opted-out and
 * hidden surfaces are dropped here so a closed drawer never reaches the check.
 */
function collectBoundarySurfaces(canvas: HTMLElement): { id: string; el: Element }[] {
  const seen = new Set<Element>();
  const out: { id: string; el: Element }[] = [];
  const consider = (el: Element) => {
    if (seen.has(el)) return;
    seen.add(el);
    if (el.closest(`[${ALLOW_OVERFLOW_ATTR}]`) !== null) return;
    if (!isSurfaceShown(el)) return;
    out.push({ id: surfaceId(el), el });
  };
  for (const el of canvas.querySelectorAll(`[data-hud-panel],[${WINDOW_ATTR}]`)) consider(el);
  for (const el of Array.from(canvas.children)) {
    if (
      el.hasAttribute("data-hud-region") ||
      el.hasAttribute("data-hud-edit-bar") ||
      el.hasAttribute("data-hud-overflow-overlay")
    ) {
      continue;
    }
    consider(el);
  }
  return out;
}

export interface HudEditChord {
  hold: string;
  press: string;
}

/**
 * The nearest ancestor that actually has a box. `HudThemeRoot` is
 * `display: contents`, so `canvas.parentElement` can be a layout-free element
 * whose rect is 0x0 — measuring it would silently disable every check below.
 */
function measurableHost(canvas: HTMLElement): HTMLElement {
  let element = canvas.parentElement;
  while (element !== null) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return element;
    element = element.parentElement;
  }
  return canvas;
}

function sizeStyle(panel: { width?: number | undefined; height?: number | undefined } | undefined): CSSProperties {
  if (panel === undefined) return {};
  return {
    ...(panel.width === undefined ? {} : { width: panel.width }),
    ...(panel.height === undefined ? {} : { height: panel.height }),
  };
}

function ResizeHandles({
  axes,
  onResizeStart,
}: {
  axes: HudResizeAxes;
  onResizeStart: (edge: "e" | "s" | "se", event: ReactPointerEvent) => void;
}) {
  if (axes === "none") return null;
  const handle = (edge: "e" | "s" | "se", cursor: string, style: CSSProperties) => (
    <div
      key={edge}
      data-hud-resize={edge}
      onPointerDown={(event) => {
        event.stopPropagation();
        onResizeStart(edge, event);
      }}
      style={{
        position: "absolute",
        zIndex: 3,
        pointerEvents: "auto",
        background: "rgba(255, 255, 255, 0.85)",
        cursor,
        ...style,
      }}
    />
  );
  return (
    <>
      {axes === "x" || axes === "both"
        ? handle("e", "ew-resize", { top: 4, bottom: 4, right: -3, width: 6 })
        : null}
      {axes === "y" || axes === "both"
        ? handle("s", "ns-resize", { left: 4, right: 4, bottom: -3, height: 6 })
        : null}
      {axes === "both" ? handle("se", "nwse-resize", { right: -4, bottom: -4, width: 10, height: 10 }) : null}
    </>
  );
}

/**
 * Layout state for `HudCanvas` — panel placements, edit-mode drag/resize, and per-game persistence.
 *
 * @capability hud-layout persistent, live-editable HUD panel layout state for `HudCanvas`
 */
export function useHudLayout(options?: {
  storageKey?: string;
  snap?: number;
  locked?: boolean;
  /**
   * Scene-document `ui` section — source of truth for panel placement/size.
   * When provided, hydrates the layout store (and wins over legacy localStorage).
   */
  documentUi?: EditorUiDocument;
  /**
   * When true (default), canvas moves/resizes invoke the injected {@link HudLayoutPersist}
   * port (`HudLayoutPersistProvider` / `onPanelCommit`). No-op when no host has provided one.
   */
  documentPatches?: boolean;
}): HudLayoutStore {
  const storageKey = options?.storageKey;
  const snap = options?.snap;
  const locked = options?.locked;
  const documentUi = options?.documentUi;
  const documentPatches = options?.documentPatches !== false;
  const onPanelCommit = useHudLayoutPersist();
  const onPanelCommitRef = useRef(onPanelCommit);
  onPanelCommitRef.current = onPanelCommit;
  const layout = useMemo(() => {
    const store = createHudLayout({
      snap,
      locked,
      onDocumentPatch: documentPatches
        ? (id, panel) => {
            onPanelCommitRef.current?.(id, panel);
          }
        : undefined,
    });
    if (documentUi !== undefined) {
      store.applyDocumentUi(documentUi);
    } else if (storageKey !== undefined && typeof localStorage !== "undefined") {
      store.hydrate(localStorage.getItem(STORAGE_PREFIX + storageKey));
    }
    return store;
  }, [storageKey, snap, locked, documentPatches]);
  useEffect(() => {
    if (documentUi !== undefined) {
      layout.applyDocumentUi(documentUi);
    }
  }, [layout, documentUi]);
  useEffect(() => {
    if (documentUi !== undefined) return;
    if (storageKey === undefined || typeof localStorage === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = layout.subscribe(() => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        localStorage.setItem(STORAGE_PREFIX + storageKey, layout.serialize());
      }, PERSIST_DELAY_MS);
    });
    return () => {
      unsubscribe();
      if (timer !== null) {
        clearTimeout(timer);
        localStorage.setItem(STORAGE_PREFIX + storageKey, layout.serialize());
      }
    };
  }, [layout, storageKey, documentUi]);
  return layout;
}

interface HudCanvasContextValue {
  layout: HudLayoutStore;
  canvasRef: RefObject<HTMLDivElement | null>;
  /** Element flowing panels portal into; `null` until the canvas has committed it. */
  layer: HTMLDivElement | null;
  /** The HUD's own size in HUD pixels, once measured. */
  frame: HudSize | null;
  placements: HudPanelLayout;
  declarePanel: (claim: PanelDeclaration) => void;
  removePanel: (id: string) => void;
  reportPanelSize: (id: string, size: HudSize, collapsed: boolean) => void;
}

/** A flowing panel's claim before it has been measured. */
interface PanelDeclaration {
  id: string;
  anchor: HudAnchor;
  order?: number | undefined;
  priority?: HudPriority | undefined;
  /** Toggle label, for sizing the toggle before it has been drawn. */
  chip: string;
}

const EMPTY_PLACEMENTS: HudPanelLayout = { scale: 1, rects: {}, collapsed: [], overlapping: [] };

const HudCanvasContext = createContext<HudCanvasContextValue | null>(null);

function HudEditBar({ layout }: { layout: HudLayoutStore }) {
  return (
    <div
      data-hud-edit-bar=""
      style={{
        position: "absolute",
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: EDIT_BAR_Z,
        pointerEvents: "auto",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 12px",
        borderRadius: 999,
        background: "rgba(10, 10, 14, 0.92)",
        border: "1px solid rgba(255, 255, 255, 0.25)",
        color: "rgba(255, 255, 255, 0.92)",
        font: "12px/1.4 system-ui, sans-serif",
        whiteSpace: "nowrap",
      }}
    >
      <span>HUD layout — drag panels to rearrange</span>
      <button
        type="button"
        onClick={() => layout.reset()}
        style={{
          padding: "2px 10px",
          borderRadius: 999,
          border: "1px solid rgba(255, 255, 255, 0.3)",
          background: "transparent",
          color: "inherit",
          font: "inherit",
          cursor: "pointer",
        }}
      >
        Reset
      </button>
      <button
        type="button"
        onClick={() => layout.setEditing(false)}
        style={{
          padding: "2px 10px",
          borderRadius: 999,
          border: "1px solid transparent",
          background: "rgba(255, 255, 255, 0.92)",
          color: "rgb(10, 10, 14)",
          font: "inherit",
          cursor: "pointer",
        }}
      >
        Done
      </button>
    </div>
  );
}

/**
 * An element's size in the HUD's own CSS pixels. Panels are placed in that space, inside the canvas zoom,
 * so they are measured there too; `getBoundingClientRect` reports on-screen pixels, already shrunk by the
 * zoom.
 */
function localSize(element: HTMLElement): HudSize {
  return { width: element.offsetWidth, height: element.offsetHeight };
}

/** The HUD host's top-left corner on screen; control zones are measured on screen and placed relative to it. */
interface HostOrigin {
  left: number;
  top: number;
}

const ORIGIN: HostOrigin = { left: 0, top: 0 };

/**
 * Every touch control and system control on screen, as rectangles in the HUD host's own on-screen pixels.
 * Any element registered with `useRegisterLayoutRegion` as kind `control` or `system` counts, so the
 * engine dock and a game's own touch pads are kept clear the same way.
 */
function controlObstacles(zones: readonly LayoutRect[], origin: HostOrigin, viewport: HudSize): LayoutRect[] {
  const obstacles: LayoutRect[] = [];
  for (const zone of zones) {
    const left = Math.max(0, zone.left - origin.left);
    const top = Math.max(0, zone.top - origin.top);
    const right = Math.min(viewport.width, zone.right - origin.left);
    const bottom = Math.min(viewport.height, zone.bottom - origin.top);
    if (right - left > 0 && bottom - top > 0) obstacles.push({ left, top, right, bottom });
  }
  return obstacles;
}

/** A toggle's size before it has been drawn: the label's letters plus the pill's padding and caret. */
function estimateChipSize(label: string): HudSize {
  return { width: Math.round(label.length * 8 + 44), height: 26 };
}

/**
 * Full-viewport HUD surface. Each `HudPanel` names an anchor and a priority; the canvas measures every
 * panel and places them all at once so none lands on another, at any screen size. Panels sharing an
 * anchor stack outward from that edge; a panel that would cover a neighbour slides along its edge to
 * the nearest free spot; when the screen is too small, the lowest-priority panels fold into a toggle,
 * and only then does the whole HUD shrink. Device safe areas and every touch control (any region
 * registered as kind `control` or `system`) are kept clear. Games declare panels, never place them per size.
  *
 * @capability hud-canvas the HUD root surface — design-resolution scaling plus live panel-placement editing (F2+C)
 */
export function HudCanvas({
  layout,
  editChord,
  showDuring,
  className,
  style,
  children,
}: {
  layout: HudLayoutStore;
  editChord?: HudEditChord | false;
  /** Opt-in play-phase gate: render the HUD only during these phases (e.g. `["playing"]`). Omit for always-visible (default). */
  showDuring?: readonly GamePhase[];
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const phase = useOptionalGamePhase();
  const { compact } = useDisplayProfile();
  const { safeArea, controlZones } = useGameViewportLayout();
  const hudViewport = useHudViewport();
  const fitEnabled = hudViewport?.fitEnabled === true;
  const [viewport, setViewport] = useState<HudSize | null>(null);
  const [origin, setOrigin] = useState<HostOrigin>(ORIGIN);
  const [offenders, setOffenders] = useState<(HudOverflow & { x: number; y: number; width: number; height: number })[]>([]);
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const [revision, setRevision] = useState(0);
  const declarations = useRef(new Map<string, PanelDeclaration & { index: number }>());
  const declaredCount = useRef(0);
  const fullSizes = useRef(new Map<string, HudSize>());
  const chipSizes = useRef(new Map<string, HudSize>());
  const declarePanel = useCallback((claim: PanelDeclaration) => {
    const previous = declarations.current.get(claim.id);
    if (
      previous !== undefined &&
      previous.anchor === claim.anchor &&
      previous.order === claim.order &&
      previous.priority === claim.priority &&
      previous.chip === claim.chip
    ) {
      return;
    }
    declarations.current.set(claim.id, { ...claim, index: previous?.index ?? declaredCount.current++ });
    setRevision((value) => value + 1);
  }, []);
  const removePanel = useCallback((id: string) => {
    if (!declarations.current.delete(id)) return;
    fullSizes.current.delete(id);
    chipSizes.current.delete(id);
    setRevision((value) => value + 1);
  }, []);
  const reportPanelSize = useCallback((id: string, size: HudSize, collapsed: boolean) => {
    const sizes = collapsed ? chipSizes.current : fullSizes.current;
    const previous = sizes.get(id);
    if (previous !== undefined && Math.abs(previous.width - size.width) < 0.5 && Math.abs(previous.height - size.height) < 0.5) return;
    sizes.set(id, size);
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const host = measurableHost(canvas);
    const measure = () => {
      const rect = host.getBoundingClientRect();
      const next = { width: Math.round(rect.width), height: Math.round(rect.height) };
      setViewport((prev) => (prev !== null && prev.width === next.width && prev.height === next.height ? prev : next));
      setOrigin((prev) => (prev.left === rect.left && prev.top === rect.top ? prev : { left: rect.left, top: rect.top }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const fit = fitEnabled ? resolveHudFit(hudViewport?.config, compact) : null;
  const baseScale = fit !== null && viewport !== null ? hudScaleForViewport(fit, viewport) : compact ? COMPACT_HUD_SCALE : 1;
  const preferredScale = baseScale * (hudViewport?.userScale ?? 1);
  const edgePad = compact ? 10 : 16;

  const placements = useMemo(() => {
    if (viewport === null || viewport.width <= 0 || viewport.height <= 0) return { ...EMPTY_PLACEMENTS, scale: preferredScale };
    const claims: HudPanelClaim[] = [];
    const ordered = [...declarations.current.values()].sort((a, b) => a.index - b.index);
    for (const declaration of ordered) {
      const size = fullSizes.current.get(declaration.id);
      if (size === undefined) continue;
      claims.push({
        id: declaration.id,
        anchor: declaration.anchor,
        order: declaration.order,
        priority: declaration.priority,
        size,
        chipSize: chipSizes.current.get(declaration.id) ?? estimateChipSize(declaration.chip),
      });
    }
    const reserved = controlObstacles(controlZones, origin, viewport);
    return arrangeHudPanels(claims, { viewport, scale: preferredScale, insets: safeArea, edgePad, gap: PANEL_GAP, reserved });
    // `revision` stands for the declaration and size maps, which are refs.
  }, [viewport, revision, preferredScale, safeArea, controlZones, origin, edgePad]);
  const scale = placements.scale;
  const frame = useMemo(() => (viewport === null ? null : { width: viewport.width / scale, height: viewport.height / scale }), [viewport, scale]);

  const value = useMemo(
    () => ({ layout, canvasRef, layer, frame, placements, declarePanel, removePanel, reportPanelSize }),
    [layout, layer, frame, placements, declarePanel, removePanel, reportPanelSize],
  );
  const editing = useEngineState(layout).editing;
  useEffect(() => registerActiveHudLayout(layout), [layout]);
  const chordEnabled = editChord !== false;
  const hold = editChord === false ? undefined : (editChord?.hold ?? "F2");
  const press = editChord === false ? undefined : (editChord?.press ?? "KeyC");

  useEffect(() => {
    if (!chordEnabled || hold === undefined || press === undefined) return;
    if (typeof window === "undefined") return;
    let holding = false;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === hold) {
        holding = true;
        return;
      }
      if (event.code === press && holding) {
        event.preventDefault();
        layout.setEditing(!layout.getState().editing);
        return;
      }
      if (event.code === "Escape" && layout.getState().editing) {
        layout.setEditing(false);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === hold) holding = false;
    };
    const onBlur = () => {
      holding = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [layout, chordEnabled, hold, press]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const host = measurableHost(canvas);
    if (typeof requestAnimationFrame !== "function") return;
    let frame = 0;
    let lastReport = "";
    let lastOverlapReport = "";
    const dev = isDevBuild();
    const check = () => {
      frame = 0;
      const hostRect = host.getBoundingClientRect();
      if (hostRect.width <= 0 || hostRect.height <= 0) return;
      const viewportSize = { width: hostRect.width, height: hostRect.height };
      const surfaces: {
        id: string;
        rect: { x: number; y: number; width: number; height: number };
      }[] = [];
      for (const surface of collectBoundarySurfaces(canvas)) {
        const rect = surface.el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        surfaces.push({
          id: surface.id,
          rect: {
            x: rect.left - hostRect.left,
            y: rect.top - hostRect.top,
            width: rect.width,
            height: rect.height,
          },
        });
      }
      // overflowingPanels reports only surfaces that are partly on screen *and*
      // cross an edge — a closed/parked/off-screen menu is never an offender.
      const escaped = overflowingPanels(surfaces, viewportSize);
      const report = escaped.length === 0 ? "" : JSON.stringify(escaped);
      if (report !== lastReport) {
        lastReport = report;
        if (report === "") {
          canvas.removeAttribute("data-hud-overflow");
        } else {
          canvas.setAttribute("data-hud-overflow", report);
          console.warn(
            `[jgengine] HUD UI escapes the ${Math.round(hostRect.width)}x${Math.round(hostRect.height)} viewport: ${report}`,
          );
        }
        if (dev) {
          setOffenders(
            escaped.map((overflow) => {
              const rect = surfaces.find((s) => s.id === overflow.id)?.rect;
              return { ...overflow, x: rect?.x ?? 0, y: rect?.y ?? 0, width: rect?.width ?? 0, height: rect?.height ?? 0 };
            }),
          );
        }
      }
      const blocks = [...canvas.querySelectorAll("[data-hud-panel]")]
        .filter((el) => isSurfaceShown(el))
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            id: surfaceId(el),
            rect: {
              x: rect.left - hostRect.left,
              y: rect.top - hostRect.top,
              width: rect.width,
              height: rect.height,
            },
          };
        });
      const overlapReport = dev
        ? formatLayoutCollisions(detectLayoutCollisions(blocks.map((block) => hudBlockRegion(block.id, block.rect)), { minArea: 1 }), viewportSize)
        : "";
      if (overlapReport !== lastOverlapReport) {
        lastOverlapReport = overlapReport;
        if (overlapReport === "") {
          canvas.removeAttribute("data-hud-overlap");
        } else {
          canvas.setAttribute("data-hud-overlap", overlapReport);
          console.warn(`[jgengine] ${overlapReport}`);
        }
      }
    };
    const schedule = () => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(check);
    };
    const settle = setTimeout(schedule, 400);
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    resizeObserver?.observe(host);
    const mutationObserver =
      typeof MutationObserver === "undefined" ? null : new MutationObserver(schedule);
    mutationObserver?.observe(canvas, { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] });
    return () => {
      clearTimeout(settle);
      if (frame !== 0) cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, []);

  const canvasStyle = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    zoom: scale === 1 ? undefined : scale,
    ...style,
  } as CSSProperties;

  if (!hudVisibleInPhase(showDuring, phase)) return null;

  return (
    <HudCanvasContext.Provider value={value}>
      <div
        ref={canvasRef}
        data-hud-canvas=""
        data-hud-editing={editing ? "" : undefined}
        data-hud-scale={scale === preferredScale ? undefined : scale.toFixed(2)}
        className={className}
        style={canvasStyle}
      >
        <div ref={setLayer} data-hud-flow-layer="" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1 }} />
        {children}
        {offenders.length > 0 ? (
          <div
            data-hud-overflow-overlay=""
            style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: EDIT_BAR_Z - 1 }}
          >
            {offenders.map((o) => (
              <div
                key={o.id}
                style={{
                  position: "absolute",
                  left: o.x / scale,
                  top: o.y / scale,
                  width: o.width / scale,
                  height: o.height / scale,
                  border: "2px solid rgba(255, 64, 64, 0.95)",
                  boxShadow: "0 0 0 2px rgba(255, 64, 64, 0.3)",
                  boxSizing: "border-box",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    bottom: "100%",
                    marginBottom: 2,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: "rgba(180, 20, 20, 0.95)",
                    color: "#fff",
                    font: `600 ${hudType("xs")}/1.4 ${hudFont.body}`,
                    whiteSpace: "nowrap",
                  }}
                >
                  ⚠ {o.id} escapes viewport ({overflowEdges(o)})
                </span>
              </div>
            ))}
          </div>
        ) : null}
        {editing ? <HudEditBar layout={layout} /> : null}
      </div>
    </HudCanvasContext.Provider>
  );
}

/** Human-readable edge list for the dev boundary badge, e.g. `right +260 · bottom +56`. */
function overflowEdges(overflow: HudOverflow): string {
  const parts: string[] = [];
  if (overflow.left > 0) parts.push(`left +${overflow.left}`);
  if (overflow.top > 0) parts.push(`top +${overflow.top}`);
  if (overflow.right > 0) parts.push(`right +${overflow.right}`);
  if (overflow.bottom > 0) parts.push(`bottom +${overflow.bottom}`);
  return parts.length > 0 ? parts.join(" · ") : "edge";
}

interface PanelDrag {
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  width: number;
  height: number;
  active: boolean;
}

/**
 * A panel folded into a toggle because the screen had no room for it. Opening it shows the panel as a
 * popover beside the toggle, on the side with more room; the toggle alone holds the panel's place.
 */
function HudChip({
  label,
  openUp,
  alignRight,
  children,
}: {
  label: string;
  openUp: boolean;
  alignRight: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        data-hud-chip=""
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        style={{
          pointerEvents: "auto",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          borderRadius: 999,
          background: "rgba(10, 10, 14, 0.72)",
          border: "1px solid rgba(255, 255, 255, 0.22)",
          color: "rgba(255, 255, 255, 0.92)",
          font: `600 ${hudType("xs")}/1.2 ${hudFont.body}`,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        <span>{label}</span>
        <span aria-hidden>{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <div
          data-hud-chip-popover=""
          style={{
            position: "absolute",
            zIndex: 2,
            pointerEvents: "auto",
            ...(openUp ? { bottom: "100%", marginBottom: 6 } : { top: "100%", marginTop: 6 }),
            ...(alignRight ? { right: 0 } : { left: 0 }),
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A HUD block anchored to a corner, edge or the centre. `HudCanvas` places every panel together: panels
 * sharing an anchor stack outward from the screen edge in ascending `order`, and a panel that would
 * cover another slides to the nearest free spot. When the screen is too small, lower-`priority` panels
 * fold into a toggle first. On fine pointers panels stay draggable through the edit chord; a dragged
 * panel leaves the flow and keeps its custom placement.
  *
 * @capability hud-panel anchored HUD slot — drop any widget in a named, player-movable panel
 */
export function HudPanel({
  id,
  anchor = "top-left",
  order,
  chip,
  interactive,
  inset,
  locked,
  showDuring,
  priority,
  mobileBehavior,
  allowOverlapWith,
  collisionGroup,
  region = true,
  width,
  height,
  type,
  className,
  style,
  children,
}: {
  id: string;
  anchor?: HudAnchor;
  /** Stack position within the anchor, ascending outward from the screen edge. Default 0. */
  order?: number;
  /** Label of the toggle the panel folds into when the screen has no room for it. Defaults to the panel id. */
  chip?: string;
  /** `false` lets pointer events pass through to the game (read-only panels). Default true. */
  interactive?: boolean;
  /**
   * Fallback pixel inset from the anchor when the scene document has no `ui.panels[id]`.
   * Document layout is the source of truth once authored; TSX props are fallback-only.
   */
  inset?: { x: number; y: number };
  locked?: boolean;
  /** Opt-in play-phase gate: render this panel only during these phases. Omit for always-visible (default). */
  showDuring?: readonly GamePhase[];
  /**
   * How much the panel matters when the screen is short of room. `critical` panels never fold and place
   * first; `secondary` (the default) and then `tertiary` panels fold into a toggle when nothing else fits.
   */
  priority?: HudPriority;
  /** How the panel adapts on mobile. `"hidden"` unmounts on phones; `"transient"` softens its collision policy; others tag the element for game CSS. */
  mobileBehavior?: MobileHudBehavior;
  /** Region ids this panel may overlap without a forbidden-collision report. */
  allowOverlapWith?: readonly string[];
  /** Regions sharing a non-empty group never collide with each other. */
  collisionGroup?: string;
  /** Register this panel as a collision-tracked layout region. Default true. */
  region?: boolean;
  /** Fallback width when the document has not authored a size. */
  width?: number;
  /** Fallback height when the document has not authored a size. */
  height?: number;
  /** Panel type id ({@link registerHudPanelType}) — drives resize axes + ParamSchema. */
  type?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const ctx = useContext(HudCanvasContext);
  const phase = useOptionalGamePhase();
  const layoutMode = useGameLayoutMode();
  if (ctx === null) throw new Error("HudPanel must be rendered inside a HudCanvas");
  const { layout, canvasRef, layer, frame, placements, declarePanel, removePanel, reportPanelSize } = ctx;
  const { compact } = useDisplayProfile();
  const onMobile = isMobileMode(layoutMode);
  const registeredOnRef = useRef<HudLayoutStore | null>(null);
  if (registeredOnRef.current !== layout) {
    registeredOnRef.current = layout;
    layout.register(id, anchoredPlacement(anchor, inset ?? { x: 16, y: 16 }), {
      width,
      height,
      type,
    });
  }

  const layoutState = useEngineState(layout);
  const panel = layoutState.panels[id];
  const draggable = !compact && locked !== true && isPanelDraggable(layoutState, id);
  const editing = layoutState.editing && draggable;
  const resizeSpec = resolvePanelResize(panel?.type ?? type);
  const resizable = editing && resizeSpec.axes !== "none";

  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<PanelDrag | null>(null);
  const suppressClickRef = useRef(false);
  const detachRef = useRef<(() => void) | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => () => detachRef.current?.(), []);

  const hidden =
    panel === undefined ||
    panel.visible === false ||
    (onMobile && mobileBehavior === "hidden") ||
    !hudVisibleInPhase(showDuring, phase);
  // Touch displays ignore a dragged placement: the player cannot drag there to fix it.
  const flowing = !hidden && panel !== undefined && (compact || !panel.moved);
  const label = chip ?? id;
  useEffect(() => {
    if (!flowing) return;
    declarePanel({ id, anchor, order, priority, chip: label });
  }, [flowing, declarePanel, id, anchor, order, priority, label]);
  useEffect(() => {
    if (!flowing) return;
    return () => removePanel(id);
  }, [flowing, removePanel, id]);

  const placed = flowing ? placements.rects[id] : undefined;
  const collapsed = flowing && placements.collapsed.includes(id);
  const flowMounted = flowing && layer !== null;
  useEffect(() => {
    if (!flowMounted) return;
    const element = rootRef.current;
    if (element === null) return;
    const measure = () => {
      const size = localSize(element);
      if (size.width <= 0 && size.height <= 0) return;
      reportPanelSize(id, size, collapsed);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [flowMounted, collapsed, id, reportPanelSize]);

  const regionSpec = useMemo(
    () => ({
      id,
      kind: "hud" as const,
      collisionPolicy: (mobileBehavior === "transient" ? "warn" : "forbid") as LayoutCollisionPolicy,
      priority,
      allowOverlapWith,
      collisionGroup,
    }),
    [id, mobileBehavior, priority, allowOverlapWith, collisionGroup],
  );
  const placedKey = placed === undefined ? "" : `${placed.x},${placed.y},${collapsed ? "chip" : "full"}`;
  useRegisterLayoutRegion(regionSpec, rootRef, region && !hidden && (!flowing || placed !== undefined), placedKey);

  const onPointerDown = (event: ReactPointerEvent) => {
    if (!draggable || event.button !== 0) return;
    if ((event.target as HTMLElement | null)?.closest?.("[data-hud-resize]") != null) return;
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (root === null || canvas === null) return;
    const canvasRect = canvas.getBoundingClientRect();
    const rect = root.getBoundingClientRect();
    suppressClickRef.current = false;
    const drag: PanelDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: rect.left - canvasRect.left,
      y: rect.top - canvasRect.top,
      width: rect.width,
      height: rect.height,
      active: false,
    };
    dragRef.current = drag;
    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== drag.pointerId) return;
      const dx = moveEvent.clientX - drag.startX;
      const dy = moveEvent.clientY - drag.startY;
      if (!drag.active) {
        if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
        drag.active = true;
        suppressClickRef.current = true;
        layout.bringToFront(id);
        setDragging(true);
      }
      const liveCanvas = canvasRef.current;
      if (liveCanvas === null) return;
      const liveRect = liveCanvas.getBoundingClientRect();
      layout.move(
        id,
        { x: drag.x + dx, y: drag.y + dy, width: drag.width, height: drag.height },
        { width: liveRect.width, height: liveRect.height },
      );
    };
    const onEnd = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== drag.pointerId) return;
      detachRef.current?.();
      dragRef.current = null;
      setDragging(false);
    };
    detachRef.current?.();
    const detach = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      detachRef.current = null;
    };
    detachRef.current = detach;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  };

  const onResizeStart = (edge: "e" | "s" | "se", event: ReactPointerEvent) => {
    if (!resizable || event.button !== 0) return;
    const root = rootRef.current;
    if (root === null) return;
    const startWidth = panel?.width ?? root.getBoundingClientRect().width;
    const startHeight = panel?.height ?? root.getBoundingClientRect().height;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    suppressClickRef.current = true;
    layout.bringToFront(id);
    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const dw = edge === "s" ? 0 : moveEvent.clientX - startX;
      const dh = edge === "e" ? 0 : moveEvent.clientY - startY;
      const next = resizePanelSize(
        { width: startWidth, height: startHeight },
        { dw, dh },
        resizeSpec.axes,
        resizeSpec,
      );
      layout.resize(id, next);
    };
    const onEnd = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== pointerId) return;
      detachRef.current?.();
    };
    detachRef.current?.();
    const detach = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      detachRef.current = null;
    };
    detachRef.current = detach;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  };

  const onClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const editingChrome = editing ? (
    <>
      <div
        data-hud-panel-shield=""
        style={{ position: "absolute", inset: 0, zIndex: 1, cursor: "inherit" }}
      />
      <div
        data-hud-panel-label=""
        style={{
          position: "absolute",
          top: -20,
          left: 0,
          zIndex: 2,
          pointerEvents: "none",
          padding: "1px 6px",
          borderRadius: 4,
          background: "rgba(10, 10, 14, 0.85)",
          color: "rgba(255, 255, 255, 0.9)",
          font: `${hudType("xs")}/1.5 ${hudFont.body}`,
          whiteSpace: "nowrap",
        }}
      >
        {id}
      </div>
      {resizable ? <ResizeHandles axes={resizeSpec.axes} onResizeStart={onResizeStart} /> : null}
    </>
  ) : null;

  if (hidden || panel === undefined) return null;

  const authoredSize = sizeStyle({ width: panel.width ?? width, height: panel.height ?? height });
  if (flowing) {
    if (layer === null) return null;
    const passThrough = interactive === false && !editing && !collapsed;
    const midX = frame === null || placed === undefined ? 0 : placed.x + placed.width / 2 - frame.width / 2;
    const midY = frame === null || placed === undefined ? 0 : placed.y + placed.height / 2 - frame.height / 2;
    return createPortal(
      <div
        ref={rootRef}
        data-hud-panel={id}
        data-hud-anchor={anchor}
        data-hud-collapsed={collapsed ? "" : undefined}
        data-dragging={dragging ? "" : undefined}
        data-hud-priority={priority}
        data-hud-mobile-behavior={mobileBehavior}
        data-hud-type={panel.type ?? type}
        className={className}
        onPointerDown={onPointerDown}
        onClickCapture={onClickCapture}
        style={{
          position: "absolute",
          left: placed?.x ?? 0,
          top: placed?.y ?? 0,
          visibility: placed === undefined ? "hidden" : undefined,
          pointerEvents: passThrough ? "none" : "auto",
          touchAction: draggable ? "none" : undefined,
          userSelect: editing || dragging ? "none" : undefined,
          cursor: dragging ? "grabbing" : editing ? "grab" : undefined,
          outline: editing ? "1px dashed rgba(255, 255, 255, 0.6)" : undefined,
          outlineOffset: editing ? 2 : undefined,
          boxSizing: "border-box",
          ...(collapsed ? {} : authoredSize),
          ...style,
        }}
      >
        {collapsed ? (
          <HudChip label={label} openUp={midY > 0} alignRight={midX > 0}>
            <div style={{ position: "relative", boxSizing: "border-box", ...authoredSize }}>{children}</div>
          </HudChip>
        ) : (
          children
        )}
        {editingChrome}
      </div>,
      layer,
    );
  }

  const { fx, fy } = HUD_ANCHOR_FRACTIONS[panel.placement.anchor];
  const position: CSSProperties = {};
  if (fx === 0) position.left = panel.placement.dx;
  else if (fx === 1) position.right = -panel.placement.dx;
  else position.left = `calc(50% + ${panel.placement.dx}px)`;
  if (fy === 0) position.top = panel.placement.dy;
  else if (fy === 1) position.bottom = -panel.placement.dy;
  else position.top = `calc(50% + ${panel.placement.dy}px)`;
  if (fx === 0.5 || fy === 0.5) {
    position.transform = `translate(${fx === 0.5 ? "-50%" : "0"}, ${fy === 0.5 ? "-50%" : "0"})`;
  }
  return (
    <div
      ref={rootRef}
      data-hud-panel={id}
      data-dragging={dragging ? "" : undefined}
      data-hud-type={panel.type ?? type}
      className={className}
      onPointerDown={onPointerDown}
      onClickCapture={onClickCapture}
      style={{
        position: "absolute",
        ...position,
        zIndex: panel.z,
        pointerEvents: "auto",
        touchAction: draggable ? "none" : undefined,
        userSelect: editing || dragging ? "none" : undefined,
        cursor: dragging ? "grabbing" : editing ? "grab" : undefined,
        outline: editing ? "1px dashed rgba(255, 255, 255, 0.6)" : undefined,
        outlineOffset: editing ? 2 : undefined,
        boxSizing: "border-box",
        ...sizeStyle(panel),
        ...style,
      }}
    >
      {children}
      {editingChrome}
    </div>
  );
}

/** Props for {@link HudFade}. */
export interface HudFadeProps {
  /**
   * Values the group shows. When any changes (health drops, cash comes in, ammo is spent) the group
   * comes back to full strength, then fades again after `idleMs`.
   */
  watch: readonly unknown[];
  /** Quiet time before fading, in ms. Default 3500. */
  idleMs?: number;
  /** Opacity once faded; 0 hides it entirely. Default 0.18. */
  dimTo?: number;
  /** Keep it at full strength (in combat, low health, aiming, a menu open). */
  hold?: boolean;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * Whether a HUD group should be at full strength: true for `idleMs` after any watched value
 * changes, and whenever `hold` is set.
 *
 * @capability hud-idle true while a HUD group's values are changing, false once they sit still
 */
export function useHudAwake(watch: readonly unknown[], idleMs = 3500, hold = false): boolean {
  const [awake, setAwake] = useState(true);
  const first = useRef(true);
  const key = JSON.stringify(watch, (_, value: unknown) => (typeof value === "number" ? Math.round(value * 100) / 100 : value));
  useEffect(() => {
    if (hold) {
      setAwake(true);
      return;
    }
    if (!first.current) setAwake(true);
    first.current = false;
    const timer = setTimeout(() => setAwake(false), idleMs);
    return () => clearTimeout(timer);
  }, [key, idleMs, hold]);
  return awake || hold;
}

/**
 * A HUD group that steps back when nothing is happening: it fades after a quiet spell and comes back
 * the moment a watched value changes, so the world fills the screen and the HUD speaks only when it
 * has news. Hovering it also brings it back.
 *
 * ```tsx
 * <HudFade watch={[health, armour]} hold={health < 30}>
 *   <KitMeter value={hp} max={100} />
 * </HudFade>
 * ```
 *
 * @capability hud-fade HUD group that fades when idle and returns when its values change
 */
export function HudFade({ watch, idleMs = 3500, dimTo = 0.18, hold = false, children, className, style }: HudFadeProps): ReactNode {
  const [hovered, setHovered] = useState(false);
  const awake = useHudAwake(watch, idleMs, hold || hovered);
  return (
    <div
      data-jg-hud-fade={awake ? "awake" : "idle"}
      className={className}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{
        opacity: awake ? 1 : dimTo,
        transition: `opacity calc(${awake ? 160 : 900}ms * var(--jg-motion-scale, 1)) ease`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** The eight edge slots of {@link HudSlots}. */
export type HudSlot = "topLeft" | "top" | "topRight" | "left" | "right" | "bottomLeft" | "bottom" | "bottomRight";

const HUD_SLOT_ANCHORS: Record<HudSlot, { anchor: HudAnchor; inset: { x: number; y: number } }> = {
  topLeft: { anchor: "top-left", inset: { x: 16, y: 16 } },
  top: { anchor: "top", inset: { x: 0, y: 14 } },
  topRight: { anchor: "top-right", inset: { x: 16, y: 16 } },
  left: { anchor: "left", inset: { x: 16, y: 0 } },
  right: { anchor: "right", inset: { x: 16, y: 0 } },
  bottomLeft: { anchor: "bottom-left", inset: { x: 16, y: 16 } },
  bottom: { anchor: "bottom", inset: { x: 0, y: 16 } },
  bottomRight: { anchor: "bottom-right", inset: { x: 16, y: 16 } },
};

const HUD_SLOT_ORDER = Object.keys(HUD_SLOT_ANCHORS) as HudSlot[];

/** The widest a corner card draws, at the 1600x900 design size the HUD scales from. */
export const HUD_CORNER_WIDTH = 248;

/**
 * A panel inside a {@link HudSlots} slot, for a slot that holds more than one or needs panel options.
 * `id` is the key the player's moved position is remembered under.
 */
export interface HudSlotPanel {
  id: string;
  content: ReactNode;
  /** Stacking within the slot, ascending outward from the edge. */
  order?: number;
  /** Which panels fold into a toggle first on a small screen. */
  priority?: HudPriority;
  /** `false` lets clicks pass through to the world. */
  interactive?: boolean;
  /** Label of the toggle this panel folds into on a small screen. */
  chip?: string;
}

/** Props for {@link HudSlots}. */
export interface HudSlotsProps {
  /** Remembers the player's moved panels under this key (the game's id). */
  storageKey: string;
  /** What sits at each edge; unset or `null` slots draw nothing. */
  slots?: Partial<Record<HudSlot, ReactNode>>;
  /** Several panels at one edge, each with its own id and options; drawn after that edge's `slots` entry. */
  panels?: Partial<Record<HudSlot, readonly HudSlotPanel[]>>;
  /** Drawn over the slots (an end card, a centred moment). */
  overlay?: ReactNode;
  /** Phases the HUD shows in. Default playing and ended; `null` shows it in every phase. */
  showDuring?: readonly GamePhase[] | null;
  /** Class on the HUD root, for the game's own skin. */
  className?: string;
}

const DEFAULT_SLOT_PHASES: readonly GamePhase[] = ["playing", "ended"];

/**
 * The play HUD in one line: a few small panels pinned to the screen's edges, scaled from a 1600x900
 * design to any window and movable by the player (the layout is remembered per `storageKey`). Keep
 * it to a handful of slots; the world is the picture.
 *
 * ```tsx
 * <HudSlots storageKey={idea.id} slots={{ topLeft: <Vitals />, top: <WaveClock />, bottom: <BuildBar /> }} overlay={<Ending />} />
 * ```
 *
 * @capability hud-slots a play HUD of edge-pinned, player-movable panels in one component
 */
export function HudSlots({ storageKey, slots = {}, panels = {}, overlay, showDuring = DEFAULT_SLOT_PHASES, className }: HudSlotsProps): ReactNode {
  const layout = useHudLayout({ storageKey });
  return (
    <HudCanvas layout={layout} {...(showDuring === null ? {} : { showDuring })} {...(className === undefined ? {} : { className })}>
      {HUD_SLOT_ORDER.map((slot) => {
        const place = HUD_SLOT_ANCHORS[slot];
        const single = slots[slot];
        return (
          <Fragment key={slot}>
            {single === undefined || single === null ? null : (
              <HudPanel id={slot} anchor={place.anchor} inset={place.inset}>
                {single}
              </HudPanel>
            )}
            {(panels[slot] ?? []).map((panel) => (
              <HudPanel
                key={panel.id}
                id={panel.id}
                anchor={place.anchor}
                inset={place.inset}
                {...(panel.order === undefined ? {} : { order: panel.order })}
                {...(panel.priority === undefined ? {} : { priority: panel.priority })}
                {...(panel.interactive === undefined ? {} : { interactive: panel.interactive })}
                {...(panel.chip === undefined ? {} : { chip: panel.chip })}
              >
                {panel.content}
              </HudPanel>
            ))}
          </Fragment>
        );
      })}
      {overlay}
    </HudCanvas>
  );
}
