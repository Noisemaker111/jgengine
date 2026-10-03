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
const targetRegistries = new WeakMap<object, (element: HTMLElement, id: string, cellSize?: number) => () => void>();

/**
 * Pointer-owned drag state shared by cards and inventory grids. Registered DropZones are hit-tested
 * through pointer capture; release finishes once, while cancellation, blur and unmount release ownership.
 * Callers own drop policy, rotation and presentation; pointer movement paints the ghost without rerendering it.
 *
 * @capability drag-layer composable pointer-owned drag, drop targets and cancellation for custom cards and inventory UI
 */
export function useDragLayer<T>(options?: {
  onDrop?: (info: DropInfo<T>) => void;
}): DragLayer<T> {
  const [state, setState] = useState<DragState<T>>({
    payload: null, point: EMPTY_POINT, origin: EMPTY_POINT, overTarget: null, overCell: null,
  });
  const pointRef = useRef(EMPTY_POINT);
  const ghostRef = useRef<HTMLElement | null>(null);
  const payloadRef = useRef<DragPayload<T> | null>(null);
  const overRef = useRef<{ target: string | null; cell: Cell | null }>({ target: null, cell: null });
  const overElement = useRef<HTMLElement | null>(null);
  const targets = useRef(new Map<HTMLElement, { id: string; cellSize?: number }>());
  const ownerRef = useRef<{ source: HTMLElement; pointerId: number; detach: () => void } | null>(null);
  const latest = useRef(options);
  latest.current = options;

  const detach = useCallback(() => {
    const owner = ownerRef.current;
    ownerRef.current = null;
    if (owner === null) return;
    owner.detach();
    if (owner.source.hasPointerCapture(owner.pointerId)) owner.source.releasePointerCapture(owner.pointerId);
  }, []);

  useEffect(() => () => {
    detach();
    payloadRef.current = null;
    ghostRef.current = null;
  }, [detach]);

  const writeGhost = useCallback((point: { x: number; y: number }, rotation: Rotation) => {
    const el = ghostRef.current;
    if (el === null) return;
    el.style.left = `${point.x}px`;
    el.style.top = `${point.y}px`;
    el.style.transform = `translate(-50%, -50%) rotate(${rotation * 90}deg)`;
  }, []);

  const setTarget = useCallback<DragLayer<T>["setTarget"]>((target, cell = null) => {
    const previous = overRef.current;
    if (previous.target === target && previous.cell?.[0] === cell?.[0] && previous.cell?.[1] === cell?.[1]) return;
    overRef.current = { target, cell };
    setState((prev) => ({ ...prev, overTarget: target, overCell: cell, point: pointRef.current }));
  }, []);

  const resolveTarget = useCallback((document: Document, point: { x: number; y: number }) => {
    if (targets.current.size === 0) return;
    let element = document.elementFromPoint(point.x, point.y);
    while (element !== null) {
      const target = targets.current.get(element as HTMLElement);
      if (target !== undefined) {
        overElement.current = element as HTMLElement;
        const rect = element.getBoundingClientRect();
        setTarget(target.id, target.cellSize === undefined ? null
          : cellFromPoint({ x: point.x - rect.left, y: point.y - rect.top }, target.cellSize));
        return;
      }
      element = element.parentElement;
    }
    overElement.current = null;
    setTarget(null);
  }, [setTarget]);

  const reset = useCallback(() => {
    detach();
    payloadRef.current = null;
    overRef.current = { target: null, cell: null };
    overElement.current = null;
    pointRef.current = EMPTY_POINT;
    setState({ payload: null, point: EMPTY_POINT, origin: EMPTY_POINT, overTarget: null, overCell: null });
  }, [detach]);

  const endDrag = useCallback<DragLayer<T>["endDrag"]>(() => {
    const payload = payloadRef.current;
    if (payload === null) return null;
    const info: DropInfo<T> = {
      payload, target: overRef.current.target, cell: overRef.current.cell, point: pointRef.current,
    };
    reset();
    latest.current?.onDrop?.(info);
    return info;
  }, [reset]);

  const beginDrag = useCallback<DragLayer<T>["beginDrag"]>((payload, event) => {
    if (event.button !== 0 || !event.isPrimary || payloadRef.current !== null) return;
    const source = event.currentTarget as HTMLElement;
    const view = source.ownerDocument.defaultView;
    if (view === null) return;
    const point = { x: event.clientX, y: event.clientY };
    const nextPayload = { id: payload.id, value: payload.value, rotation: payload.rotation ?? 0 };
    payloadRef.current = nextPayload;
    overRef.current = { target: null, cell: null };
    pointRef.current = point;
    setState({ payload: nextPayload, point, origin: point, overTarget: null, overCell: null });
    writeGhost(point, nextPayload.rotation);
    resolveTarget(source.ownerDocument, point);
    const onMove = (move: PointerEvent) => {
      if (move.pointerId !== ownerRef.current?.pointerId || payloadRef.current === null) return;
      if (!source.isConnected) { reset(); return; }
      const next = { x: move.clientX, y: move.clientY };
      pointRef.current = next;
      writeGhost(next, payloadRef.current.rotation);
      resolveTarget(source.ownerDocument, next);
    };
    const onUp = (up: PointerEvent) => {
      if (up.pointerId !== ownerRef.current?.pointerId || up.button !== 0) return;
      if (!source.isConnected) { reset(); return; }
      pointRef.current = { x: up.clientX, y: up.clientY };
      resolveTarget(source.ownerDocument, pointRef.current);
      endDrag();
    };
    const onCancel = (cancel: PointerEvent) => { if (cancel.pointerId === ownerRef.current?.pointerId) reset(); };
    const onKey = (key: KeyboardEvent) => {
      if (key.key !== "Escape" || key.defaultPrevented) return;
      key.preventDefault();
      key.stopPropagation();
      reset();
    };
    ownerRef.current = { source, pointerId: event.pointerId, detach: () => {
      view.removeEventListener("pointermove", onMove, true);
      view.removeEventListener("pointerup", onUp, true);
      view.removeEventListener("pointercancel", onCancel, true);
      view.removeEventListener("lostpointercapture", onCancel, true);
      view.removeEventListener("blur", reset);
      view.removeEventListener("keydown", onKey, true);
    } };
    view.addEventListener("pointermove", onMove, true);
    view.addEventListener("pointerup", onUp, true);
    view.addEventListener("pointercancel", onCancel, true);
    view.addEventListener("lostpointercapture", onCancel, true);
    view.addEventListener("blur", reset);
    view.addEventListener("keydown", onKey, true);
    source.setPointerCapture(event.pointerId);
  }, [endDrag, reset, resolveTarget, writeGhost]);

  targetRegistries.set(beginDrag, (element, id, cellSize) => {
    targets.current.set(element, { id, cellSize });
    return () => {
      targets.current.delete(element);
      if (overElement.current === element) { overElement.current = null; setTarget(null); }
    };
  });

  const rotate = useCallback<DragLayer<T>["rotate"]>((quarterTurns = 1) => {
    const payload = payloadRef.current;
    if (payload === null) return;
    const rotation = (((payload.rotation + quarterTurns) % 4) + 4) % 4 as Rotation;
    const next = { ...payload, rotation };
    payloadRef.current = next;
    writeGhost(pointRef.current, rotation);
    setState((prev) => ({ ...prev, payload: next, point: pointRef.current }));
  }, [writeGhost]);

  const attachGhost = useCallback((element: HTMLElement | null) => {
    ghostRef.current = element;
    if (element !== null && payloadRef.current !== null) writeGhost(pointRef.current, payloadRef.current.rotation);
  }, [writeGhost]);

  return { state, dragging: state.payload !== null, pointRef, beginDrag, rotate, setTarget, endDrag, cancel: reset, attachGhost };
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
  const latest = useRef(layer);
  latest.current = layer;
  useEffect(() => () => {
    if (latest.current.state.payload?.id === id) latest.current.cancel();
  }, [id, layer.cancel]);
  return (
    <div
      className={className}
      data-card={id}
      data-dragging={isDragging ? "" : undefined}
      style={{ touchAction: "none" }}
      onPointerDown={(event) => {
        if (event.button !== 0 || !event.isPrimary) return;
        event.preventDefault();
        layer.beginDrag({ id, value }, event);
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
  useEffect(() => {
    const element = ref.current;
    if (element !== null) return targetRegistries.get(layer.beginDrag)?.(element, id, cellSize);
  }, [layer.beginDrag, id, cellSize]);
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
    >
      {children}
    </div>
  );
}
