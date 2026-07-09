import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  HUD_ANCHOR_FRACTIONS,
  anchoredPlacement,
  createHudLayout,
  isPanelDraggable,
  type HudAnchor,
  type HudLayoutStore,
} from "@jgengine/core/ui/hudLayout";
import { useEngineState } from "./engineStore";

const STORAGE_PREFIX = "jg:hud:";
const DRAG_THRESHOLD_PX = 4;
const PERSIST_DELAY_MS = 200;
const EDIT_BAR_Z = 100000;

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

interface HudCanvasContextValue {
  layout: HudLayoutStore;
  canvasRef: RefObject<HTMLDivElement | null>;
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

export function HudCanvas({
  layout,
  editChord,
  className,
  style,
  children,
}: {
  layout: HudLayoutStore;
  editChord?: HudEditChord | false;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const value = useMemo(() => ({ layout, canvasRef }), [layout]);
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

  return (
    <HudCanvasContext.Provider value={value}>
      <div
        ref={canvasRef}
        data-hud-canvas=""
        data-hud-editing={editing ? "" : undefined}
        className={className}
        style={{ position: "absolute", inset: 0, pointerEvents: "none", ...style }}
      >
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

export function HudPanel({
  id,
  anchor = "top-left",
  inset,
  locked,
  className,
  style,
  children,
}: {
  id: string;
  anchor?: HudAnchor;
  inset?: { x: number; y: number };
  locked?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const ctx = useContext(HudCanvasContext);
  if (ctx === null) throw new Error("HudPanel must be rendered inside a HudCanvas");
  const { layout, canvasRef } = ctx;
  const registeredOnRef = useRef<HudLayoutStore | null>(null);
  if (registeredOnRef.current !== layout) {
    registeredOnRef.current = layout;
    layout.register(id, anchoredPlacement(anchor, inset ?? { x: 16, y: 16 }));
  }

  const layoutState = useEngineState(layout);
  const panel = layoutState.panels[id];
  const draggable = locked !== true && isPanelDraggable(layoutState, id);
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

  if (panel === undefined) return null;
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
      onClickCapture={(event) => {
        if (!suppressClickRef.current) return;
        suppressClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
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
      {editing ? (
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
      ) : null}
    </div>
  );
}
