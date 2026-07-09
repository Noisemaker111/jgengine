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
  type HudAnchor,
  type HudLayoutStore,
} from "@jgengine/core/ui/hudLayout";
import { useEngineState } from "./engineStore";

const STORAGE_PREFIX = "jg:hud:";
const DRAG_THRESHOLD_PX = 4;
const PERSIST_DELAY_MS = 200;

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

export function HudCanvas({
  layout,
  className,
  style,
  children,
}: {
  layout: HudLayoutStore;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const value = useMemo(() => ({ layout, canvasRef }), [layout]);
  return (
    <HudCanvasContext.Provider value={value}>
      <div
        ref={canvasRef}
        data-hud-canvas=""
        className={className}
        style={{ position: "absolute", inset: 0, pointerEvents: "none", ...style }}
      >
        {children}
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
  const draggable = locked !== true && !layoutState.locked;

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
        left: `calc(${fx * 100}% + ${panel.placement.dx}px)`,
        top: `calc(${fy * 100}% + ${panel.placement.dy}px)`,
        transform: `translate(${-fx * 100}%, ${-fy * 100}%)`,
        zIndex: panel.z,
        pointerEvents: "auto",
        touchAction: draggable ? "none" : undefined,
        userSelect: dragging ? "none" : undefined,
        cursor: dragging ? "grabbing" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
