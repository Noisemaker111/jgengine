import {
  createContext,
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
  type HudAnchor,
  type HudLayoutStore,
  type HudSize,
} from "@jgengine/core/ui/hudLayout";
import { hudScaleForViewport, overflowingPanels, resolveHudFit } from "@jgengine/core/ui/hudScale";
import { useDisplayProfile } from "./display";
import { useEngineState } from "./engineStore";
import { useHudViewport } from "./hudViewport";

const STORAGE_PREFIX = "jg:hud:";
const DRAG_THRESHOLD_PX = 4;
const PERSIST_DELAY_MS = 200;
const EDIT_BAR_Z = 100000;
const REGION_GAP = 10;
const COMPACT_HUD_SCALE = 0.85;
const HUD_ANCHORS = Object.keys(HUD_ANCHOR_FRACTIONS) as HudAnchor[];

/**
 * How a panel behaves on compact (phone-scale) displays. `keep` stays visible
 * at the global compact scale, `chip` collapses to a small tap-to-expand
 * pill, `hide` unmounts entirely.
 */
export type HudCompactMode = "keep" | "chip" | "hide";

export interface HudEditChord {
  hold: string;
  press: string;
}

export function useHudLayout(options?: {
  storageKey?: string;
  snap?: number;
  locked?: boolean;
}): HudLayoutStore {
  const storageKey = options?.storageKey;
  const snap = options?.snap;
  const locked = options?.locked;
  const layout = useMemo(() => {
    const store = createHudLayout({ snap, locked });
    if (storageKey !== undefined && typeof localStorage !== "undefined") {
      store.hydrate(localStorage.getItem(STORAGE_PREFIX + storageKey));
    }
    return store;
  }, [storageKey, snap, locked]);
  useEffect(() => {
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
  }, [layout, storageKey]);
  return layout;
}

type HudRegionElements = Partial<Record<HudAnchor, HTMLDivElement>>;

interface HudCanvasContextValue {
  layout: HudLayoutStore;
  canvasRef: RefObject<HTMLDivElement | null>;
  regions: HudRegionElements;
  compact: boolean;
}

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

const PAD_TOP = "var(--jg-hud-pad-top)";
const PAD_BOTTOM = "var(--jg-hud-pad-bottom)";
const PAD_LEFT = "var(--jg-hud-pad-left)";
const PAD_RIGHT = "var(--jg-hud-pad-right)";

const REGION_LAYOUT: Record<HudAnchor, CSSProperties> = {
  "top-left": { top: PAD_TOP, left: PAD_LEFT, alignItems: "flex-start" },
  top: { top: PAD_TOP, left: "50%", transform: "translateX(-50%)", alignItems: "center" },
  "top-right": { top: PAD_TOP, right: PAD_RIGHT, alignItems: "flex-end" },
  left: { left: PAD_LEFT, top: "50%", transform: "translateY(-50%)", alignItems: "flex-start" },
  center: { left: "50%", top: "50%", transform: "translate(-50%, -50%)", alignItems: "center" },
  right: { right: PAD_RIGHT, top: "50%", transform: "translateY(-50%)", alignItems: "flex-end" },
  "bottom-left": {
    bottom: PAD_BOTTOM,
    left: PAD_LEFT,
    flexDirection: "column-reverse",
    alignItems: "flex-start",
  },
  bottom: {
    bottom: PAD_BOTTOM,
    left: "50%",
    transform: "translateX(-50%)",
    flexDirection: "column-reverse",
    alignItems: "center",
  },
  "bottom-right": {
    bottom: PAD_BOTTOM,
    right: PAD_RIGHT,
    flexDirection: "column-reverse",
    alignItems: "flex-end",
  },
};

function edgePad(envInset: string, extra: string | null, basePx: number, scale: number): string {
  const outer = extra === null ? envInset : `${envInset} + ${extra}`;
  return scale === 1 ? `calc(${outer} + ${basePx}px)` : `calc((${outer}) / ${scale} + ${basePx}px)`;
}

/**
 * Full-viewport HUD surface. Panels declared with `HudPanel` flow into nine
 * anchor regions and stack automatically with a gap — no per-panel pixel
 * offsets, no manual clearance for sibling panels, the touch-control dock
 * (`--jg-hud-dock-clearance`), or device safe areas. On compact displays the
 * whole surface scales down and each panel applies its `compact` behavior.
 */
export function HudCanvas({
  layout,
  editChord,
  compactScale,
  className,
  style,
  children,
}: {
  layout: HudLayoutStore;
  editChord?: HudEditChord | false;
  /** Zoom applied to the whole HUD on compact displays. Default 0.85. */
  compactScale?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const { compact } = useDisplayProfile();
  const hudViewport = useHudViewport();
  const fitEnabled = hudViewport?.fitEnabled === true;
  const [viewport, setViewport] = useState<HudSize | null>(null);
  const [regions, setRegions] = useState<HudRegionElements>({});
  const regionRefs = useMemo(() => {
    const refs = {} as Record<HudAnchor, (el: HTMLDivElement | null) => void>;
    for (const anchor of HUD_ANCHORS) {
      refs[anchor] = (el) => {
        setRegions((prev) => {
          if (el === null) {
            if (prev[anchor] === undefined) return prev;
            const next = { ...prev };
            delete next[anchor];
            return next;
          }
          return prev[anchor] === el ? prev : { ...prev, [anchor]: el };
        });
      };
    }
    return refs;
  }, []);
  const value = useMemo(
    () => ({ layout, canvasRef, regions, compact }),
    [layout, regions, compact],
  );
  const editing = useEngineState(layout).editing;
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
    if (!fitEnabled) return;
    const host = canvasRef.current?.parentElement;
    if (host === undefined || host === null || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const rect = host.getBoundingClientRect();
      const next = { width: Math.round(rect.width), height: Math.round(rect.height) };
      setViewport((prev) =>
        prev !== null && prev.width === next.width && prev.height === next.height ? prev : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [fitEnabled]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (canvas === null || canvas === undefined || host === undefined || host === null) return;
    if (typeof requestAnimationFrame !== "function") return;
    let frame = 0;
    let lastReport = "";
    const check = () => {
      frame = 0;
      const hostRect = host.getBoundingClientRect();
      if (hostRect.width <= 0 || hostRect.height <= 0) return;
      const panels: { id: string; rect: { x: number; y: number; width: number; height: number } }[] = [];
      for (const el of canvas.querySelectorAll("[data-hud-panel]")) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        panels.push({
          id: el.getAttribute("data-hud-panel") ?? "?",
          rect: {
            x: rect.left - hostRect.left,
            y: rect.top - hostRect.top,
            width: rect.width,
            height: rect.height,
          },
        });
      }
      const offenders = overflowingPanels(panels, { width: hostRect.width, height: hostRect.height });
      const report = offenders.length === 0 ? "" : JSON.stringify(offenders);
      if (report === lastReport) return;
      lastReport = report;
      if (report === "") {
        canvas.removeAttribute("data-hud-overflow");
      } else {
        canvas.setAttribute("data-hud-overflow", report);
        console.warn(
          `[jgengine] HUD panels overflow the ${Math.round(hostRect.width)}x${Math.round(hostRect.height)} viewport: ${report}`,
        );
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
    mutationObserver?.observe(canvas, { childList: true, subtree: true });
    return () => {
      clearTimeout(settle);
      if (frame !== 0) cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, []);

  const fit = fitEnabled ? resolveHudFit(hudViewport?.config, compact) : null;
  const baseScale =
    fit !== null && viewport !== null
      ? hudScaleForViewport(fit, viewport)
      : compact
        ? (compactScale ?? COMPACT_HUD_SCALE)
        : 1;
  const scale = baseScale * (hudViewport?.userScale ?? 1);
  const basePad = compact ? 10 : 16;
  const canvasStyle = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    zoom: scale === 1 ? undefined : scale,
    "--jg-hud-pad-top": edgePad("env(safe-area-inset-top, 0px)", null, basePad, scale),
    "--jg-hud-pad-bottom": edgePad(
      "env(safe-area-inset-bottom, 0px)",
      "var(--jg-hud-dock-clearance, 0px)",
      basePad,
      scale,
    ),
    "--jg-hud-pad-left": edgePad("env(safe-area-inset-left, 0px)", null, basePad, scale),
    "--jg-hud-pad-right": edgePad("env(safe-area-inset-right, 0px)", null, basePad, scale),
    ...style,
  } as CSSProperties;

  return (
    <HudCanvasContext.Provider value={value}>
      <div
        ref={canvasRef}
        data-hud-canvas=""
        data-hud-editing={editing ? "" : undefined}
        className={className}
        style={canvasStyle}
      >
        {HUD_ANCHORS.map((anchor) => (
          <div
            key={anchor}
            ref={regionRefs[anchor]}
            data-hud-region={anchor}
            style={{
              position: "absolute",
              display: "flex",
              flexDirection: "column",
              gap: REGION_GAP,
              pointerEvents: "none",
              ...REGION_LAYOUT[anchor],
            }}
          />
        ))}
        {children}
        {editing ? <HudEditBar layout={layout} /> : null}
      </div>
    </HudCanvasContext.Provider>
  );
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

function chipAlignment(anchor: HudAnchor): CSSProperties["alignItems"] {
  if (anchor.endsWith("right")) return "flex-end";
  if (anchor.endsWith("left")) return "flex-start";
  return "center";
}

function HudChip({
  label,
  anchor,
  children,
}: {
  label: string;
  anchor: HudAnchor;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        alignItems: chipAlignment(anchor),
      }}
    >
      <button
        type="button"
        data-hud-chip=""
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
          font: "600 11px/1.2 system-ui, sans-serif",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        <span>{label}</span>
        <span aria-hidden>{open ? "▾" : "▸"}</span>
      </button>
      {open ? children : null}
    </div>
  );
}

/**
 * A HUD block that lives in one of the nine anchor regions. Panels sharing a
 * region stack outward from the screen edge in ascending `order`. On fine
 * pointers panels stay draggable through the edit chord; a dragged panel
 * leaves the flow and keeps its custom placement. On compact displays custom
 * placements are ignored and the `compact` behavior applies.
 */
export function HudPanel({
  id,
  anchor = "top-left",
  order,
  compact: compactMode = "keep",
  chip,
  interactive,
  inset,
  locked,
  className,
  style,
  children,
}: {
  id: string;
  anchor?: HudAnchor;
  /** Stack position within the region, ascending outward from the screen edge. Default 0. */
  order?: number;
  /** Behavior on compact displays. Default `"keep"`. */
  compact?: HudCompactMode;
  /** Chip label when `compact="chip"`. Defaults to the panel id. */
  chip?: string;
  /** `false` lets pointer events pass through to the game (read-only panels). Default true. */
  interactive?: boolean;
  /** Legacy pixel inset from the anchor; only used as the reset placement for dragged panels. */
  inset?: { x: number; y: number };
  locked?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const ctx = useContext(HudCanvasContext);
  if (ctx === null) throw new Error("HudPanel must be rendered inside a HudCanvas");
  const { layout, canvasRef, regions, compact } = ctx;
  const registeredOnRef = useRef<HudLayoutStore | null>(null);
  if (registeredOnRef.current !== layout) {
    registeredOnRef.current = layout;
    layout.register(id, anchoredPlacement(anchor, inset ?? { x: 16, y: 16 }));
  }

  const layoutState = useEngineState(layout);
  const panel = layoutState.panels[id];
  const draggable = !compact && locked !== true && isPanelDraggable(layoutState, id);
  const editing = layoutState.editing && draggable;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<PanelDrag | null>(null);
  const suppressClickRef = useRef(false);
  const detachRef = useRef<(() => void) | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => () => detachRef.current?.(), []);

  const onPointerDown = (event: ReactPointerEvent) => {
    if (!draggable || event.button !== 0) return;
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
          font: "10px/1.5 system-ui, sans-serif",
          whiteSpace: "nowrap",
        }}
      >
        {id}
      </div>
    </>
  ) : null;

  if (panel === undefined) return null;
  if (compact && compactMode === "hide") return null;

  const flow = compact || !panel.moved;
  if (flow) {
    const regionEl = regions[compact ? anchor : panel.placement.anchor];
    if (regionEl === undefined) return null;
    const chipped = compact && compactMode === "chip";
    const passThrough = interactive === false && !editing && !chipped;
    return createPortal(
      <div
        ref={rootRef}
        data-hud-panel={id}
        data-dragging={dragging ? "" : undefined}
        className={className}
        onPointerDown={onPointerDown}
        onClickCapture={onClickCapture}
        style={{
          position: "relative",
          order: order ?? 0,
          pointerEvents: passThrough ? "none" : "auto",
          touchAction: draggable ? "none" : undefined,
          userSelect: editing || dragging ? "none" : undefined,
          cursor: dragging ? "grabbing" : editing ? "grab" : undefined,
          outline: editing ? "1px dashed rgba(255, 255, 255, 0.6)" : undefined,
          outlineOffset: editing ? 2 : undefined,
          ...style,
        }}
      >
        {chipped ? (
          <HudChip label={chip ?? id} anchor={anchor}>
            {children}
          </HudChip>
        ) : (
          children
        )}
        {editingChrome}
      </div>,
      regionEl,
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
        ...style,
      }}
    >
      {children}
      {editingChrome}
    </div>
  );
}
