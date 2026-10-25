import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Camera } from "three";
import { Vector2, Vector3 } from "three";

import {
  BuilderStore,
  getBuilderSelectionBounds,
  type BuilderBounds3d,
  type BuilderResizeAxis,
  type BuilderResizeEdge,
  type BuilderSelectionRef,
} from "@/dev/builder/builderStore";
import {
  clampTargetBoundsForEdgeDrag,
  createResizeSnapshot,
  resizeArrowRotation,
  resizeHandlePosition,
  type BuilderResizeSnapshot,
} from "@llmville/game/builder/resize";
import { projectPointerOntoAxis } from "@/dev/builder/components/resizePointer";
import type { MapGridSpec } from "@llmville/game/world/grid";

type BuilderPointerEvent = ThreeEvent<PointerEvent>;
type ResizeHandleId = `${BuilderResizeAxis}-${BuilderResizeEdge}`;

/** Standard editor axis colors — both ends of an axis share the same hue. */
export const RESIZE_AXIS_COLORS: Record<BuilderResizeAxis, string> = {
  x: "#ff3b3b",
  y: "#3dff6a",
  z: "#3d9dff",
};

const ARROW_SCALE = 1.3;
const CONE_RADIUS = 0.19;
const CONE_HEIGHT = 0.44;
const SHAFT_RADIUS_TOP = 0.055;
const SHAFT_RADIUS_BOTTOM = 0.075;
const SHAFT_HEIGHT = 0.38;
const CONE_CENTER_Y = 0.4;
const SHAFT_CENTER_Y = 0.11;
/** Tight pick volume — slightly larger than visible geometry, not the old 0.55×1×0.55 slab. */
const PICK_RADIUS_TOP = 0.17;
const PICK_RADIUS_BOTTOM = 0.2;
const PICK_HEIGHT = 0.72;
const PICK_CENTER_Y = 0.34;

function handleId(axis: BuilderResizeAxis, edge: BuilderResizeEdge): ResizeHandleId {
  return `${axis}-${edge}`;
}

function ResizeArrowMaterial({
  color,
  state,
}: {
  color: string;
  state: "idle" | "hover" | "active" | "dimmed";
}) {
  const emissiveIntensity = state === "active" ? 4.2 : state === "hover" ? 3 : state === "dimmed" ? 0.7 : 1.6;
  const opacity = state === "active" ? 1 : state === "hover" ? 0.92 : state === "dimmed" ? 0.28 : 0.78;

  return (
    <meshStandardMaterial
      color={color}
      emissive={color}
      emissiveIntensity={emissiveIntensity}
      transparent
      opacity={opacity}
      roughness={0.05}
      metalness={0.45}
      depthTest={false}
      toneMapped={false}
    />
  );
}

function ResizeArrow({
  axis,
  edge,
  position,
  visualState,
  onDragStart,
  onHoverChange,
}: {
  axis: BuilderResizeAxis;
  edge: BuilderResizeEdge;
  position: [number, number, number];
  visualState: "idle" | "hover" | "active" | "dimmed";
  onDragStart: (event: BuilderPointerEvent) => void;
  onHoverChange: (hovering: boolean) => void;
}) {
  const color = RESIZE_AXIS_COLORS[axis];
  const rotation = resizeArrowRotation(axis, edge);
  const scale = visualState === "active" ? 1.12 : visualState === "hover" ? 1.06 : 1;
  const showGlow = visualState === "active" || visualState === "hover";

  const handlePointerDown = useCallback((event: BuilderPointerEvent) => {
    event.stopPropagation();
    onDragStart(event);
  }, [onDragStart]);

  const handlePointerOver = useCallback((event: BuilderPointerEvent) => {
    event.stopPropagation();
    onHoverChange(true);
    document.body.style.cursor = "pointer";
  }, [onHoverChange]);

  const handlePointerOut = useCallback((event: BuilderPointerEvent) => {
    event.stopPropagation();
    onHoverChange(false);
    document.body.style.cursor = "";
  }, [onHoverChange]);

  return (
    <group position={position} rotation={rotation} scale={ARROW_SCALE * scale}>
      <group
        onPointerDown={handlePointerDown}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        {showGlow ? (
          <mesh position={[0, PICK_CENTER_Y, 0]} renderOrder={19}>
            <cylinderGeometry args={[PICK_RADIUS_BOTTOM * 1.18, PICK_RADIUS_TOP * 1.22, PICK_HEIGHT * 1.06, 14]} />
            <meshBasicMaterial color={color} transparent opacity={visualState === "active" ? 0.34 : 0.18} depthTest={false} toneMapped={false} />
          </mesh>
        ) : null}
        <mesh position={[0, CONE_CENTER_Y, 0]} renderOrder={20}>
          <coneGeometry args={[CONE_RADIUS, CONE_HEIGHT, 16]} />
          <ResizeArrowMaterial color={color} state={visualState} />
        </mesh>
        <mesh position={[0, SHAFT_CENTER_Y, 0]} renderOrder={20}>
          <cylinderGeometry args={[SHAFT_RADIUS_TOP, SHAFT_RADIUS_BOTTOM, SHAFT_HEIGHT, 12]} />
          <ResizeArrowMaterial color={color} state={visualState} />
        </mesh>
        <mesh position={[0, PICK_CENTER_Y, 0]} renderOrder={21}>
          <cylinderGeometry args={[PICK_RADIUS_TOP, PICK_RADIUS_BOTTOM, PICK_HEIGHT, 10]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

function captureCanvasPointer(event: BuilderPointerEvent) {
  const target = event.target as EventTarget & { setPointerCapture?: (pointerId: number) => void };
  target.setPointerCapture?.(event.nativeEvent.pointerId);
}

export function ResizeGizmo({
  bounds,
  grid,
  onDragActiveChange,
}: {
  bounds: BuilderBounds3d | null;
  grid: MapGridSpec;
  onDragActiveChange: (enabled: boolean) => void;
}) {
  const { camera, gl } = useThree();
  const [hoverHandle, setHoverHandle] = useState<ResizeHandleId | null>(null);
  const [activeHandle, setActiveHandle] = useState<ResizeHandleId | null>(null);
  const dragRef = useRef<{
    axis: BuilderResizeAxis;
    edge: BuilderResizeEdge;
    axisPoint: Vector3;
    fromBounds: BuilderBounds3d;
    snapshot: BuilderResizeSnapshot;
    refs: BuilderSelectionRef[];
    grid: MapGridSpec;
    pendingWorldValue: number | null;
    rafId: number | null;
    lastTargetBounds: BuilderBounds3d;
  } | null>(null);

  const applyResizeFrame = useCallback((drag: NonNullable<typeof dragRef.current>, worldValue: number) => {
    const target = clampTargetBoundsForEdgeDrag(drag.fromBounds, worldValue, drag.axis, drag.edge);
    drag.lastTargetBounds = target;
    BuilderStore.resizeSelectionBounds(target, {
      fromBounds: drag.fromBounds,
      snapshot: drag.snapshot,
      refs: drag.refs,
      axis: drag.axis,
      edge: drag.edge,
    });
  }, []);

  const scheduleResizeFrame = useCallback((worldValue: number) => {
    const drag = dragRef.current;
    if (!drag) return;
    drag.pendingWorldValue = worldValue;
    if (drag.rafId !== null) return;
    drag.rafId = requestAnimationFrame(() => {
      const activeDrag = dragRef.current;
      if (!activeDrag) return;
      activeDrag.rafId = null;
      if (activeDrag.pendingWorldValue !== null) {
        applyResizeFrame(activeDrag, activeDrag.pendingWorldValue);
        activeDrag.pendingWorldValue = null;
      }
    });
  }, [applyResizeFrame]);

  const stopDrag = useCallback(() => {
    const drag = dragRef.current;
    if (drag) {
      if (drag.rafId !== null) cancelAnimationFrame(drag.rafId);
      if (drag.pendingWorldValue !== null) {
        applyResizeFrame(drag, drag.pendingWorldValue);
      }
    }
    dragRef.current = null;
    setActiveHandle(null);
    document.body.style.cursor = "";
    onDragActiveChange(true);
  }, [applyResizeFrame, onDragActiveChange]);

  const beginDrag = useCallback((axis: BuilderResizeAxis, edge: BuilderResizeEdge, event: BuilderPointerEvent) => {
    const state = BuilderStore.getState();
    const fromBounds = getBuilderSelectionBounds(state.mapData, state.selectedRefs);
    if (!fromBounds || state.selectedRefs.length === 0) return;
    const refs = [...state.selectedRefs];
    const snapshot = createResizeSnapshot(state.mapData, refs);
    const axisPoint = new Vector3(
      axis === "x" ? (edge === "min" ? fromBounds.minX : fromBounds.maxX) : (fromBounds.minX + fromBounds.maxX) / 2,
      axis === "y" ? (edge === "min" ? fromBounds.minY : fromBounds.maxY) : (fromBounds.minY + fromBounds.maxY) / 2,
      axis === "z" ? (edge === "min" ? fromBounds.minZ : fromBounds.maxZ) : (fromBounds.minZ + fromBounds.maxZ) / 2,
    );
    dragRef.current = {
      axis,
      edge,
      axisPoint,
      fromBounds,
      snapshot,
      refs,
      grid,
      pendingWorldValue: null,
      rafId: null,
      lastTargetBounds: fromBounds,
    };
    setActiveHandle(handleId(axis, edge));
    onDragActiveChange(false);
    captureCanvasPointer(event);
  }, [grid, onDragActiveChange]);

  useEffect(() => {
    const pointer = new Vector2();

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if ((event.buttons & 1) === 0) {
        stopDrag();
        return;
      }
      const rect = gl.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const worldValue = projectPointerOntoAxis(pointer, camera as Camera, drag.axis, drag.axisPoint);
      if (worldValue === null) return;
      scheduleResizeFrame(worldValue);
    };

    const onPointerUp = () => stopDrag();
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [camera, gl, scheduleResizeFrame, stopDrag]);

  useEffect(() => () => {
    const drag = dragRef.current;
    if (drag?.rafId !== null && drag?.rafId !== undefined) cancelAnimationFrame(drag.rafId);
    dragRef.current = null;
    document.body.style.cursor = "";
  }, []);

  if (!bounds) return null;

  const handles: { axis: BuilderResizeAxis; edge: BuilderResizeEdge; position: [number, number, number] }[] = [
    { axis: "x", edge: "min", position: resizeHandlePosition(bounds, "x", "min") },
    { axis: "x", edge: "max", position: resizeHandlePosition(bounds, "x", "max") },
    { axis: "y", edge: "min", position: resizeHandlePosition(bounds, "y", "min") },
    { axis: "y", edge: "max", position: resizeHandlePosition(bounds, "y", "max") },
    { axis: "z", edge: "min", position: resizeHandlePosition(bounds, "z", "min") },
    { axis: "z", edge: "max", position: resizeHandlePosition(bounds, "z", "max") },
  ];

  return (
    <>
      {handles.map((handle) => {
        const id = handleId(handle.axis, handle.edge);
        const isActive = activeHandle === id;
        const isHovered = hoverHandle === id;
        const visualState = isActive
          ? "active"
          : isHovered
            ? "hover"
            : activeHandle !== null
              ? "dimmed"
              : "idle";

        return (
          <ResizeArrow
            key={id}
            axis={handle.axis}
            edge={handle.edge}
            position={handle.position}
            visualState={visualState}
            onDragStart={(event) => beginDrag(handle.axis, handle.edge, event)}
            onHoverChange={(hovering) => {
              setHoverHandle(hovering ? id : (prev) => (prev === id ? null : prev));
            }}
          />
        );
      })}
    </>
  );
}