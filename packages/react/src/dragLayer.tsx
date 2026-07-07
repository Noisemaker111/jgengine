import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
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
  beginDrag(payload: { id: string; value: T; rotation?: Rotation }, event: ReactPointerEvent): void;
  rotate(quarterTurns?: number): void;
  setTarget(target: string | null, cell?: Cell | null): void;
  endDrag(): DropInfo<T> | null;
  cancel(): void;
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
  const moveRef = useRef<((event: PointerEvent) => void) | null>(null);

  const detach = useCallback(() => {
    if (moveRef.current !== null) {
      window.removeEventListener("pointermove", moveRef.current);
      moveRef.current = null;
    }
  }, []);

  const beginDrag = useCallback<DragLayer<T>["beginDrag"]>(
    (payload, event) => {
      const point = { x: event.clientX, y: event.clientY };
      setState({
        payload: { id: payload.id, value: payload.value, rotation: payload.rotation ?? 0 },
        point,
        origin: point,
        overTarget: null,
        overCell: null,
      });
      const onMove = (moveEvent: PointerEvent) => {
        setState((prev) =>
          prev.payload === null
            ? prev
            : { ...prev, point: { x: moveEvent.clientX, y: moveEvent.clientY } },
        );
      };
      detach();
      moveRef.current = onMove;
      window.addEventListener("pointermove", onMove);
    },
    [detach],
  );

  const rotate = useCallback<DragLayer<T>["rotate"]>((quarterTurns = 1) => {
    setState((prev) =>
      prev.payload === null
        ? prev
        : {
            ...prev,
            payload: {
              ...prev.payload,
              rotation: (((prev.payload.rotation + quarterTurns) % 4) + 4) % 4 as Rotation,
            },
          },
    );
  }, []);

  const setTarget = useCallback<DragLayer<T>["setTarget"]>((target, cell = null) => {
    setState((prev) => ({ ...prev, overTarget: target, overCell: cell }));
  }, []);

  const reset = useCallback(() => {
    detach();
    setState({
      payload: null,
      point: EMPTY_POINT,
      origin: EMPTY_POINT,
      overTarget: null,
      overCell: null,
    });
  }, [detach]);

  const endDrag = useCallback<DragLayer<T>["endDrag"]>(() => {
    let info: DropInfo<T> | null = null;
    setState((prev) => {
      if (prev.payload !== null) {
        info = {
          payload: prev.payload,
          target: prev.overTarget,
          cell: prev.overCell,
          point: prev.point,
        };
      }
      return prev;
    });
    if (info !== null) options?.onDrop?.(info);
    reset();
    return info;
  }, [options, reset]);

  return {
    state,
    dragging: state.payload !== null,
    beginDrag,
    rotate,
    setTarget,
    endDrag,
    cancel: reset,
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
  if (layer.state.payload === null) return null;
  const { x, y } = layer.state.point;
  return (
    <div
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
