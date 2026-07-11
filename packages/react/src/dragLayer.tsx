import {
  useCallback,
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
  cellFromPoint,
  type Cell,
  type Rotation,
} from "@jgengine/core/inventory/shapedGrid";

export interface DragPayload<T> {
  id: string;
  value: T;
  rotation: Rotation;
}

export interface DragState<T> {
  payload: DragPayload<T> | null;
  point: { x: number; y: number };
  origin: { x: number; y: number };
  overTarget: string | null;
  overCell: Cell | null;
}

export interface DropInfo<T> {
  payload: DragPayload<T>;
  target: string | null;
  cell: Cell | null;
  point: { x: number; y: number };
}

export interface DragLayer<T> {
  state: DragState<T>;
  dragging: boolean;
  pointRef: RefObject<{ x: number; y: number }>;
  beginDrag(payload: { id: string; value: T; rotation?: Rotation }, event: ReactPointerEvent): void;
  rotate(quarterTurns?: number): void;
  setTarget(target: string | null, cell?: Cell | null): void;
  endDrag(): DropInfo<T> | null;
  cancel(): void;
  attachGhost(element: HTMLElement | null): void;
}

const EMPTY_POINT = { x: 0, y: 0 };

export function useDragLayer<T>(options?: {
  onDrop?: (info: DropInfo<T>) => void;
}): DragLayer<T> {
  const [state, setState] = useState<DragState<T>>({
    payload: null,
    point: EMPTY_POINT,
    origin: EMPTY_POINT,
    overTarget: null,
    overCell: null,
  });
  const pointRef = useRef(EMPTY_POINT);
  const ghostRef = useRef<HTMLElement | null>(null);
  const moveRef = useRef<((event: PointerEvent) => void) | null>(null);
  const payloadRef = useRef<DragPayload<T> | null>(null);
  const overRef = useRef<{ target: string | null; cell: Cell | null }>({ target: null, cell: null });

  const detach = useCallback(() => {
    if (moveRef.current !== null) {
      window.removeEventListener("pointermove", moveRef.current);
      moveRef.current = null;
    }
  }, []);

  const writeGhost = useCallback((point: { x: number; y: number }, rotation: Rotation) => {
    const el = ghostRef.current;
    if (el === null) return;
    el.style.left = `${point.x}px`;
    el.style.top = `${point.y}px`;
    el.style.transform = `translate(-50%, -50%) rotate(${rotation * 90}deg)`;
  }, []);

  const beginDrag = useCallback<DragLayer<T>["beginDrag"]>(
    (payload, event) => {
      const point = { x: event.clientX, y: event.clientY };
      const nextPayload = { id: payload.id, value: payload.value, rotation: payload.rotation ?? 0 };
      payloadRef.current = nextPayload;
      overRef.current = { target: null, cell: null };
      pointRef.current = point;
      setState({
        payload: nextPayload,
        point,
        origin: point,
        overTarget: null,
        overCell: null,
      });
      writeGhost(point, nextPayload.rotation);
      const onMove = (moveEvent: PointerEvent) => {
        if (payloadRef.current === null) return;
        const next = { x: moveEvent.clientX, y: moveEvent.clientY };
        pointRef.current = next;
        writeGhost(next, payloadRef.current.rotation);
      };
      detach();
      moveRef.current = onMove;
      window.addEventListener("pointermove", onMove);
    },
    [detach, writeGhost],
  );

  const rotate = useCallback<DragLayer<T>["rotate"]>(
    (quarterTurns = 1) => {
      setState((prev) => {
        if (prev.payload === null) return prev;
        const rotation = (((prev.payload.rotation + quarterTurns) % 4) + 4) % 4 as Rotation;
        const payload = { ...prev.payload, rotation };
        payloadRef.current = payload;
        writeGhost(pointRef.current, rotation);
        return { ...prev, payload, point: pointRef.current };
      });
    },
    [writeGhost],
  );

  const setTarget = useCallback<DragLayer<T>["setTarget"]>((target, cell = null) => {
    overRef.current = { target, cell };
    setState((prev) => ({ ...prev, overTarget: target, overCell: cell, point: pointRef.current }));
  }, []);

  const reset = useCallback(() => {
    detach();
    payloadRef.current = null;
    overRef.current = { target: null, cell: null };
    pointRef.current = EMPTY_POINT;
    setState({
      payload: null,
      point: EMPTY_POINT,
      origin: EMPTY_POINT,
      overTarget: null,
      overCell: null,
    });
  }, [detach]);

  const endDrag = useCallback<DragLayer<T>["endDrag"]>(() => {
    const payload = payloadRef.current;
    let info: DropInfo<T> | null = null;
    if (payload !== null) {
      info = {
        payload,
        target: overRef.current.target,
        cell: overRef.current.cell,
        point: pointRef.current,
      };
      options?.onDrop?.(info);
    }
    reset();
    return info;
  }, [options, reset]);

  const attachGhost = useCallback((element: HTMLElement | null) => {
    ghostRef.current = element;
    if (element !== null && payloadRef.current !== null) {
      writeGhost(pointRef.current, payloadRef.current.rotation);
    }
  }, [writeGhost]);

  return {
    state,
    dragging: state.payload !== null,
    pointRef,
    beginDrag,
    rotate,
    setTarget,
    endDrag,
    cancel: reset,
    attachGhost,
  };
}

export function DragGhost<T>({
  layer,
  className,
  style,
  children,
}: {
  layer: DragLayer<T>;
  className?: string;
  style?: CSSProperties;
  children?: (payload: DragPayload<T>) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    layer.attachGhost(ref.current);
    return () => layer.attachGhost(null);
  }, [layer, layer.state.payload]);

  if (layer.state.payload === null) return null;
  const { x, y } = layer.pointRef.current;
  return (
    <div
      ref={ref}
      className={className}
      data-drag-ghost=""
      style={{
        position: "fixed",
        left: x,
        top: y,
        transform: `translate(-50%, -50%) rotate(${layer.state.payload.rotation * 90}deg)`,
        pointerEvents: "none",
        zIndex: 1000,
        ...style,
      }}
    >
      {children?.(layer.state.payload)}
    </div>
  );
}

export function DraggableCard<T>({
  id,
  value,
  layer,
  className,
  children,
  onRotate,
}: {
  id: string;
  value: T;
  layer: DragLayer<T>;
  className?: string;
  children?: ReactNode;
  onRotate?: boolean;
}) {
  const isDragging = layer.state.payload?.id === id;
  return (
    <div
      className={className}
      data-card={id}
      data-dragging={isDragging ? "" : undefined}
      onPointerDown={(event) => {
        event.preventDefault();
        layer.beginDrag({ id, value }, event);
      }}
      onPointerUp={() => {
        if (layer.dragging) layer.endDrag();
      }}
      onContextMenu={(event) => {
        if (onRotate === false) return;
        event.preventDefault();
        if (layer.dragging) layer.rotate(1);
      }}
    >
      {children}
    </div>
  );
}

export function DropZone<T>({
  id,
  layer,
  className,
  activeClassName,
  cellSize,
  children,
}: {
  id: string;
  layer: DragLayer<T>;
  className?: string;
  activeClassName?: string;
  cellSize?: number;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const active = layer.state.overTarget === id && layer.dragging;
  const resolveCell = useCallback(
    (event: ReactPointerEvent): Cell | null => {
      if (cellSize === undefined || ref.current === null) return null;
      const rect = ref.current.getBoundingClientRect();
      return cellFromPoint({ x: event.clientX - rect.left, y: event.clientY - rect.top }, cellSize);
    },
    [cellSize],
  );
  const composed = useMemo(
    () => [className, active ? activeClassName : undefined].filter(Boolean).join(" ") || undefined,
    [className, active, activeClassName],
  );
  return (
    <div
      ref={ref}
      className={composed}
      data-dropzone={id}
      data-active={active ? "" : undefined}
      onPointerEnter={(event) => {
        if (layer.dragging) layer.setTarget(id, resolveCell(event));
      }}
      onPointerMove={(event) => {
        if (layer.dragging && layer.state.overTarget === id) layer.setTarget(id, resolveCell(event));
      }}
      onPointerLeave={() => {
        if (layer.dragging && layer.state.overTarget === id) layer.setTarget(null, null);
      }}
      onPointerUp={() => {
        if (layer.dragging) layer.endDrag();
      }}
    >
      {children}
    </div>
  );
}
