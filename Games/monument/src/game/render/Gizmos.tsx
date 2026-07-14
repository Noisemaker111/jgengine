import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { useThree } from "@react-three/fiber";

import { formatDistance } from "@jgengine/core/format/distance";
import { useGame } from "@jgengine/react/hooks";

import type { Building } from "../catalog";
import { clamp } from "../city/model";
import type { BuildingControl } from "../city/applicability";
import { controlDisabledReason } from "../city/applicability";

type GizmoDrag = (dx: number, dy: number, clientX: number, clientY: number, precision: number) => void;
type GizmoStart = (clientX: number, clientY: number) => void;
type AxisFallback = "left" | "right" | "up" | "down";
type HandleShape = "box" | "sphere" | "diamond";
type Vec3 = [number, number, number];

const GROUND_Y = 0;
const SITE_LIMIT = 160;
const FORM_RAIL = { void: 0.075, taper: 0.075, break: 0.06, repeat: 0.7, branch: 0.55, crown: 0.06 } as const;

const roundTo = (value: number, step = 0.1): number => Math.round(value / step) * step;
const buildingBase = (b: Building, cap = 0.28): number => Math.min(Math.max(0, b.pilotis), Math.max(0, b.height) * cap);
const formatGizmoValue = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(1));

function makeLabel(text: string, accent: string): { texture: THREE.CanvasTexture; aspect: number } | undefined {
  if (typeof document === "undefined") return undefined;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (context === null) return undefined;
  const scale = 3;
  const fontSize = 30;
  const font = `600 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
  context.font = font;
  const width = Math.ceil(context.measureText(text).width) + 40;
  const height = fontSize + 24;
  canvas.width = width * scale;
  canvas.height = height * scale;
  context.scale(scale, scale);
  context.font = font;
  context.textBaseline = "middle";
  const radius = 10;
  context.beginPath();
  context.moveTo(radius, 0);
  context.arcTo(width, 0, width, height, radius);
  context.arcTo(width, height, 0, height, radius);
  context.arcTo(0, height, 0, 0, radius);
  context.arcTo(0, 0, width, 0, radius);
  context.closePath();
  context.fillStyle = "rgba(11,15,17,0.86)";
  context.fill();
  context.lineWidth = 2;
  context.strokeStyle = accent;
  context.stroke();
  context.fillStyle = "#f3f5f2";
  context.fillText(text, 20, height / 2 + 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, aspect: canvas.width / canvas.height };
}

function GizmoLabel({ text, accent, y }: { text: string; accent: string; y: number }): ReactNode {
  const label = useMemo(() => makeLabel(text, accent), [text, accent]);
  useEffect(() => () => label?.texture.dispose(), [label]);
  if (label === undefined) return null;
  const h = 2.6;
  return (
    <sprite position={[0, y, 0]} scale={[h * label.aspect, h, 1]} renderOrder={999} raycast={() => null}>
      <spriteMaterial map={label.texture} transparent depthTest={false} depthWrite={false} toneMapped={false} />
    </sprite>
  );
}

function GizmoHandle({
  position,
  label,
  color = "#d7ff43",
  shape = "box",
  cursor = "grab",
  onStart,
  onManipulating,
  onDrag,
}: {
  position: Vec3;
  label: string;
  color?: string;
  shape?: HandleShape;
  cursor?: string;
  onStart: GizmoStart;
  onManipulating: (active: boolean) => void;
  onDrag: GizmoDrag;
}): ReactNode {
  const domElement = useThree((state) => state.gl.domElement);
  const dragging = useRef(false);
  const pointerId = useRef<number | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const [hovered, setHovered] = useState(false);
  const [active, setActive] = useState(false);
  useEffect(() => () => cleanup.current?.(), []);

  const begin = (clientX: number, clientY: number, id: number): void => {
    if (dragging.current) return;
    dragging.current = true;
    pointerId.current = id;
    setActive(true);
    onStart(clientX, clientY);
    onManipulating(true);
    document.body.style.cursor = cursor === "grab" ? "grabbing" : cursor;
    const move = (event: PointerEvent): void => {
      if (!dragging.current) return;
      if (pointerId.current !== null && event.pointerId !== pointerId.current) return;
      onDrag(event.clientX - clientX, event.clientY - clientY, event.clientX, event.clientY, event.shiftKey ? 0.2 : 1);
    };
    const finish = (event?: Event): void => {
      if (!dragging.current) return;
      if (event instanceof PointerEvent && pointerId.current !== null && event.pointerId !== pointerId.current) return;
      dragging.current = false;
      if (pointerId.current !== null) domElement.releasePointerCapture?.(pointerId.current);
      pointerId.current = null;
      setActive(false);
      onManipulating(false);
      document.body.style.cursor = "default";
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", finish);
      cleanup.current = null;
    };
    cleanup.current = finish;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("blur", finish);
  };

  return (
    <group position={position} scale={active ? 1.22 : hovered ? 1.1 : 1}>
      <mesh
        castShadow
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          const native = e.nativeEvent;
          domElement.setPointerCapture?.(native.pointerId);
          begin(native.clientX, native.clientY, native.pointerId);
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setHovered(true);
          if (!dragging.current) document.body.style.cursor = cursor;
        }}
        onPointerOut={() => {
          setHovered(false);
          if (!dragging.current) document.body.style.cursor = "default";
        }}
      >
        {shape === "sphere" ? (
          <sphereGeometry args={[1.35, 18, 18]} />
        ) : shape === "diamond" ? (
          <octahedronGeometry args={[1.55, 0]} />
        ) : (
          <boxGeometry args={[2.15, 2.15, 2.15]} />
        )}
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 0.75 : 0.32} roughness={0.42} />
      </mesh>
      {(active || hovered) && <GizmoLabel text={label} accent={color} y={2.6} />}
    </group>
  );
}

export function MassingGizmo({ building }: { building: Building }): ReactNode {
  const b = building;
  const { commands } = useGame();
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);

  const dragStart = useRef<Building>(b);
  const dragCamera = useRef<THREE.Camera>(camera);
  const dragRect = useRef<DOMRect | null>(null);
  const moveHit = useRef<THREE.Vector3 | null>(null);
  const captured = useRef(false);
  const raycaster = useRef(new THREE.Raycaster());
  const pendingPatch = useRef<Partial<Building> | null>(null);
  const rafId = useRef<number | null>(null);

  const flushPatch = (): void => {
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    const patch = pendingPatch.current;
    pendingPatch.current = null;
    if (patch !== null && Object.keys(patch).length > 0) commands.run("building.update", { id: b.id, patch, capture: false });
  };
  useEffect(() => () => {
    if (rafId.current !== null) cancelAnimationFrame(rafId.current);
  }, []);

  const beginDrag = (): void => {
    dragStart.current = { ...b };
    camera.updateMatrixWorld(true);
    dragCamera.current = camera.clone();
    dragCamera.current.updateMatrixWorld(true);
    dragRect.current = gl.domElement.getBoundingClientRect();
    moveHit.current = null;
    captured.current = false;
  };

  const emitChange = (patch: Partial<Building>): void => {
    const start = dragStart.current;
    const changed = (Object.keys(patch) as (keyof Building)[]).some((key) => patch[key] !== start[key]);
    if (!changed) return;
    if (!captured.current) {
      captured.current = true;
      commands.run("building.update", { id: b.id, patch: {}, capture: true });
    }
    pendingPatch.current = { ...pendingPatch.current, ...patch };
    if (rafId.current === null) rafId.current = requestAnimationFrame(flushPatch);
  };

  const handleManipulating = (active: boolean): void => {
    if (active) return;
    flushPatch();
    captured.current = false;
  };

  const localToWorld = (point: Vec3, start = dragStart.current): THREE.Vector3 =>
    new THREE.Vector3(point[0], point[1], point[2])
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), (start.rotation * Math.PI) / 180)
      .add(new THREE.Vector3(start.x, GROUND_Y, start.z));

  const toScreen = (point: THREE.Vector3): THREE.Vector2 => {
    const rect = dragRect.current;
    if (rect === null) return new THREE.Vector2();
    const projected = point.clone().project(dragCamera.current);
    return new THREE.Vector2((projected.x * 0.5 + 0.5) * rect.width, (0.5 - projected.y * 0.5) * rect.height);
  };

  const worldPerPixel = (point: THREE.Vector3): number => {
    const rect = dragRect.current;
    const frozen = dragCamera.current as THREE.PerspectiveCamera;
    if (rect === null) return 0.2;
    const cameraPoint = point.clone().applyMatrix4(frozen.matrixWorldInverse);
    const depth = Math.max(0.1, Math.abs(cameraPoint.z));
    return frozen.isPerspectiveCamera
      ? (2 * depth * Math.tan(THREE.MathUtils.degToRad(frozen.fov) * 0.5)) / Math.max(1, rect.height)
      : depth * 0.0018;
  };

  const axisProjection = (
    point: Vec3,
    axis: Vec3,
    fallback: AxisFallback = "right",
  ): { screenAxis: THREE.Vector2; pixelsPerWorld: number } => {
    const start = dragStart.current;
    const origin = localToWorld(point, start);
    const worldAxis = new THREE.Vector3(axis[0], axis[1], axis[2])
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), (start.rotation * Math.PI) / 180)
      .normalize();
    const reference = 1.5;
    const screenStart = toScreen(origin.clone().addScaledVector(worldAxis, -reference * 0.5));
    const screenEnd = toScreen(origin.clone().addScaledVector(worldAxis, reference * 0.5));
    let screenAxis = screenEnd.sub(screenStart);
    let pixelsPerWorld = screenAxis.length() / reference;
    if (!Number.isFinite(pixelsPerWorld) || pixelsPerWorld < 0.65) {
      const fallbackVectors: Record<AxisFallback, THREE.Vector2> = {
        left: new THREE.Vector2(-1, 0),
        right: new THREE.Vector2(1, 0),
        up: new THREE.Vector2(0, -1),
        down: new THREE.Vector2(0, 1),
      };
      screenAxis = fallbackVectors[fallback].clone();
      pixelsPerWorld = 1 / Math.max(0.0001, worldPerPixel(origin));
    }
    screenAxis.normalize();
    return { screenAxis, pixelsPerWorld };
  };

  const axisTravel = (
    dx: number,
    dy: number,
    point: Vec3,
    axis: Vec3,
    precision = 1,
    fallback: AxisFallback = "right",
  ): number => {
    const { screenAxis, pixelsPerWorld } = axisProjection(point, axis, fallback);
    return ((dx * screenAxis.x + dy * screenAxis.y) / Math.max(0.0001, pixelsPerWorld)) * precision;
  };

  const discreteAxisValue = (
    startValue: number,
    dx: number,
    dy: number,
    point: Vec3,
    axis: Vec3,
    railStep: number,
    min: number,
    max: number,
    precision = 1,
    fallback: AxisFallback = "down",
  ): number => {
    const { screenAxis, pixelsPerWorld } = axisProjection(point, axis, fallback);
    const signedPixels = (dx * screenAxis.x + dy * screenAxis.y) * precision;
    const pixelsPerStep = clamp(pixelsPerWorld * railStep, 10, 16);
    return Math.round(clamp(startValue + signedPixels / pixelsPerStep, min, max));
  };

  const groundPoint = (clientX: number, clientY: number): THREE.Vector3 | null => {
    const rect = dragRect.current;
    if (rect === null) return null;
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    );
    raycaster.current.setFromCamera(pointer, dragCamera.current);
    const ray = raycaster.current.ray;
    if (Math.abs(ray.direction.y) < 0.12) return null;
    const distance = (GROUND_Y - ray.origin.y) / ray.direction.y;
    return distance > 0 ? ray.at(distance, new THREE.Vector3()) : null;
  };

  const beginMove: GizmoStart = (clientX, clientY) => {
    beginDrag();
    moveHit.current = groundPoint(clientX, clientY);
  };

  const moveFromDrag: GizmoDrag = (dx, dy, clientX, clientY, precision) => {
    const start = dragStart.current;
    const currentHit = groundPoint(clientX, clientY);
    let deltaX = 0;
    let deltaZ = 0;
    if (moveHit.current !== null && currentHit !== null) {
      deltaX = (currentHit.x - moveHit.current.x) * precision;
      deltaZ = (currentHit.z - moveHit.current.z) * precision;
    } else {
      const frozen = dragCamera.current;
      const right = new THREE.Vector3().setFromMatrixColumn(frozen.matrixWorld, 0);
      right.y = 0;
      const forward = new THREE.Vector3();
      frozen.getWorldDirection(forward);
      forward.y = 0;
      if (right.lengthSq() < 0.001) right.set(1, 0, 0);
      else right.normalize();
      if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
      else forward.normalize();
      const meters = worldPerPixel(new THREE.Vector3(start.x, Math.min(start.height * 0.35, 48), start.z)) * precision;
      deltaX = (right.x * dx - forward.x * dy) * meters;
      deltaZ = (right.z * dx - forward.z * dy) * meters;
    }
    emitChange({
      x: clamp(Math.round(start.x + deltaX), -SITE_LIMIT, SITE_LIMIT),
      z: clamp(Math.round(start.z + deltaZ), -SITE_LIMIT, SITE_LIMIT),
    });
  };

  const ring = Math.max(b.width, b.depth) * 0.67;
  const lowY = Math.max(2.2, buildingBase(b) * 0.45);
  const voidZ = -b.depth / 2 - 2.2 - b.voids * FORM_RAIL.void;
  const taperX = -b.width / 2 - 2.2 - b.taper * FORM_RAIL.taper;
  const breakZ = b.depth / 2 + 3 + b.articulation * FORM_RAIL.break;
  const repeatZ = b.depth / 2 + 3 + (b.moduleDensity - 1) * FORM_RAIL.repeat;
  const branchZ = b.depth / 2 + 3 + b.branches * FORM_RAIL.branch;
  const crownX = -Math.max(5, b.width * 0.18) - b.crown * FORM_RAIL.crown;

  const live = (control: BuildingControl): boolean => controlDisabledReason(b, control) === undefined;

  return (
    <group>
      <group position={[0, 0.62, 0]}>
        <mesh raycast={() => null}>
          <boxGeometry args={[Math.min(34, b.width + 8), 0.08, 0.42]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.62} />
        </mesh>
        <mesh raycast={() => null}>
          <boxGeometry args={[0.42, 0.08, Math.min(34, b.depth + 8)]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.62} />
        </mesh>
        <mesh raycast={() => null}>
          <boxGeometry args={[Math.min(22, b.width + 5), 0.07, Math.min(22, b.depth + 5)]} />
          <meshBasicMaterial color="#d7ff43" transparent opacity={0.12} />
        </mesh>
      </group>

      <GizmoHandle
        position={[0, 3.25, 0]}
        label={`MOVE ${Math.round(b.x)}, ${Math.round(b.z)}`}
        cursor="move"
        shape="box"
        color="#ffffff"
        onStart={beginMove}
        onManipulating={handleManipulating}
        onDrag={moveFromDrag}
      />

      <mesh position={[0, b.height + 1.7, 0]}>
        <cylinderGeometry args={[0.055, 0.055, 3.4, 8]} />
        <meshBasicMaterial color="#d7ff43" />
      </mesh>
      <GizmoHandle
        position={[0, b.height + 3.4, 0]}
        label={`HEIGHT ${formatDistance(b.height)}`}
        cursor="ns-resize"
        shape="diamond"
        onStart={beginDrag}
        onManipulating={handleManipulating}
        onDrag={(dx, dy, _x, _y, p) => {
          const s = dragStart.current;
          const height = roundTo(clamp(s.height + axisTravel(dx, dy, [0, s.height + 3.4, 0], [0, 1, 0], p, "up") * 1.1, 12, 160));
          emitChange({ height, cores: height > 110 ? Math.max(3, s.cores) : height > 58 ? Math.max(2, s.cores) : s.cores });
        }}
      />

      <mesh position={[b.width / 2 + 1.05, lowY, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.045, 0.045, 2.1, 8]} />
        <meshBasicMaterial color="#d7ff43" />
      </mesh>
      <GizmoHandle
        position={[b.width / 2 + 2.1, lowY, 0]}
        label={`SPAN ${formatDistance(b.width, { decimals: 1 })}`}
        color="#ffb35c"
        onStart={beginDrag}
        onManipulating={handleManipulating}
        onDrag={(dx, dy, _x, _y, p) => {
          const s = dragStart.current;
          const width = roundTo(
            clamp(s.width + axisTravel(dx, dy, [s.width / 2 + 2.1, Math.max(2.2, buildingBase(s) * 0.45), 0], [1, 0, 0], p, "right") * 2, 8, 128),
          );
          emitChange({
            width,
            cores: width > 76 ? Math.max(4, s.cores) : width > 44 ? Math.max(3, s.cores) : width > 34 ? Math.max(2, s.cores) : s.cores,
          });
        }}
      />

      <mesh position={[0, lowY, b.depth / 2 + 1.05]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 2.1, 8]} />
        <meshBasicMaterial color="#7fd9d0" />
      </mesh>
      <GizmoHandle
        position={[0, lowY, b.depth / 2 + 2.1]}
        label={`DEPTH ${formatDistance(b.depth, { decimals: 1 })}`}
        shape="sphere"
        color="#69d8d0"
        onStart={beginDrag}
        onManipulating={handleManipulating}
        onDrag={(dx, dy, _x, _y, p) => {
          const s = dragStart.current;
          emitChange({
            depth: roundTo(
              clamp(s.depth + axisTravel(dx, dy, [0, Math.max(2.2, buildingBase(s) * 0.45), s.depth / 2 + 2.1], [0, 0, 1], p, "down") * 2, 8, 96),
            ),
          });
        }}
      />

      {live("cantilever") && (
        <>
          {b.cantilever > 0.05 && (
            <mesh raycast={() => null} position={[b.width * 0.18 + b.cantilever / 2, b.height * 0.73, b.depth / 2 + 1]}>
              <boxGeometry args={[b.cantilever, 0.07, 0.07]} />
              <meshBasicMaterial color="#f18ac2" transparent opacity={0.68} />
            </mesh>
          )}
          <GizmoHandle
            position={[b.cantilever + b.width * 0.18, b.height * 0.73, b.depth / 2 + 1]}
            label={`CANTILEVER ${formatDistance(b.cantilever, { decimals: 1 })}`}
            shape="diamond"
            color="#f18ac2"
            onStart={beginDrag}
            onManipulating={handleManipulating}
            onDrag={(dx, dy, _x, _y, p) => {
              const s = dragStart.current;
              emitChange({
                cantilever: roundTo(clamp(s.cantilever + axisTravel(dx, dy, [s.cantilever + s.width * 0.18, s.height * 0.73, s.depth / 2 + 1], [1, 0, 0], p, "right"), 0, 14)),
              });
            }}
          />
        </>
      )}

      {live("voids") && (
        <>
          <mesh raycast={() => null} position={[0, b.height * 0.52, (-b.depth / 2 + voidZ) / 2]}>
            <boxGeometry args={[0.07, 0.07, Math.abs(voidZ + b.depth / 2)]} />
            <meshBasicMaterial color="#8fe083" transparent opacity={0.62} />
          </mesh>
          <GizmoHandle
            position={[0, b.height * 0.52, voidZ]}
            label={`VOID ${formatGizmoValue(b.voids)}%`}
            shape="sphere"
            color="#8fe083"
            onStart={beginDrag}
            onManipulating={handleManipulating}
            onDrag={(dx, dy, _x, _y, p) => {
              const s = dragStart.current;
              const startZ = -s.depth / 2 - 2.2 - s.voids * FORM_RAIL.void;
              emitChange({ voids: roundTo(clamp(s.voids + axisTravel(dx, dy, [0, s.height * 0.52, startZ], [0, 0, -1], p, "up") / FORM_RAIL.void, 0, 70), 0.5) });
            }}
          />
        </>
      )}

      {live("taper") && (
        <>
          <mesh raycast={() => null} position={[(-b.width / 2 + taperX) / 2, b.height * 0.82, 0]}>
            <boxGeometry args={[Math.abs(taperX + b.width / 2), 0.07, 0.07]} />
            <meshBasicMaterial color="#b8a0ff" transparent opacity={0.62} />
          </mesh>
          <GizmoHandle
            position={[taperX, b.height * 0.82, 0]}
            label={`TAPER ${formatGizmoValue(b.taper)}%`}
            shape="diamond"
            color="#b8a0ff"
            onStart={beginDrag}
            onManipulating={handleManipulating}
            onDrag={(dx, dy, _x, _y, p) => {
              const s = dragStart.current;
              const startX = -s.width / 2 - 2.2 - s.taper * FORM_RAIL.taper;
              emitChange({ taper: roundTo(clamp(s.taper + axisTravel(dx, dy, [startX, s.height * 0.82, 0], [-1, 0, 0], p, "left") / FORM_RAIL.taper, 0, 65), 0.5) });
            }}
          />
        </>
      )}

      {live("articulation") && (
        <>
          <mesh raycast={() => null} position={[-b.width * 0.28, b.height * 0.34, (b.depth / 2 + breakZ) / 2]}>
            <boxGeometry args={[0.07, 0.07, breakZ - b.depth / 2]} />
            <meshBasicMaterial color="#ff735f" transparent opacity={0.62} />
          </mesh>
          <GizmoHandle
            position={[-b.width * 0.28, b.height * 0.34, breakZ]}
            label={`BREAK ${formatGizmoValue(b.articulation)}%`}
            shape="diamond"
            color="#ff735f"
            onStart={beginDrag}
            onManipulating={handleManipulating}
            onDrag={(dx, dy, _x, _y, p) => {
              const s = dragStart.current;
              const startZ = s.depth / 2 + 3 + s.articulation * FORM_RAIL.break;
              emitChange({
                articulation: roundTo(clamp(s.articulation + axisTravel(dx, dy, [-s.width * 0.28, s.height * 0.34, startZ], [0, 0, 1], p, "down") / FORM_RAIL.break, 0, 100), 0.5),
              });
            }}
          />
        </>
      )}

      <mesh raycast={() => null} position={[0, b.height * 0.2, (b.depth / 2 + repeatZ) / 2]}>
        <boxGeometry args={[0.07, 0.07, repeatZ - b.depth / 2]} />
        <meshBasicMaterial color="#f2cf58" transparent opacity={0.62} />
      </mesh>
      <GizmoHandle
        position={[0, b.height * 0.2, repeatZ]}
        label={`REPEAT ${b.moduleDensity}`}
        shape="sphere"
        color="#f2cf58"
        onStart={beginDrag}
        onManipulating={handleManipulating}
        onDrag={(dx, dy, _x, _y, p) => {
          const s = dragStart.current;
          const startZ = s.depth / 2 + 3 + (s.moduleDensity - 1) * FORM_RAIL.repeat;
          emitChange({ moduleDensity: discreteAxisValue(s.moduleDensity, dx, dy, [0, s.height * 0.2, startZ], [0, 0, 1], FORM_RAIL.repeat, 1, 5, p, "down") });
        }}
      />

      {live("branches") && (
        <>
          <mesh raycast={() => null} position={[b.width * 0.28, b.height * 0.48, (b.depth / 2 + branchZ) / 2]}>
            <boxGeometry args={[0.07, 0.07, branchZ - b.depth / 2]} />
            <meshBasicMaterial color="#55c8ff" transparent opacity={0.62} />
          </mesh>
          <GizmoHandle
            position={[b.width * 0.28, b.height * 0.48, branchZ]}
            label={`BRANCH ${b.branches}`}
            shape="diamond"
            color="#55c8ff"
            onStart={beginDrag}
            onManipulating={handleManipulating}
            onDrag={(dx, dy, _x, _y, p) => {
              const s = dragStart.current;
              const startZ = s.depth / 2 + 3 + s.branches * FORM_RAIL.branch;
              emitChange({ branches: discreteAxisValue(s.branches, dx, dy, [s.width * 0.28, s.height * 0.48, startZ], [0, 0, 1], FORM_RAIL.branch, 0, 8, p, "down") });
            }}
          />
        </>
      )}

      {live("crown") && (
        <>
          <mesh raycast={() => null} position={[(crownX - Math.max(5, b.width * 0.18)) / 2, b.height + 3.4, 0]}>
            <boxGeometry args={[Math.abs(crownX + Math.max(5, b.width * 0.18)), 0.07, 0.07]} />
            <meshBasicMaterial color="#ff82c8" transparent opacity={0.62} />
          </mesh>
          <GizmoHandle
            position={[crownX, b.height + 3.4, 0]}
            label={`CROWN ${formatGizmoValue(b.crown)}%`}
            shape="sphere"
            color="#ff82c8"
            onStart={beginDrag}
            onManipulating={handleManipulating}
            onDrag={(dx, dy, _x, _y, p) => {
              const s = dragStart.current;
              const startX = -Math.max(5, s.width * 0.18) - s.crown * FORM_RAIL.crown;
              emitChange({ crown: roundTo(clamp(s.crown + axisTravel(dx, dy, [startX, s.height + 3.4, 0], [-1, 0, 0], p, "left") / FORM_RAIL.crown, 0, 100), 0.5) });
            }}
          />
        </>
      )}

      <group position={[0, 0.55, 0]}>
        <mesh raycast={() => null} position={[0, 0, ring]}>
          <boxGeometry args={[ring * 2, 0.08, 0.18]} />
          <meshBasicMaterial color="#d7ff43" transparent opacity={0.68} />
        </mesh>
        <mesh raycast={() => null} position={[0, 0, -ring]}>
          <boxGeometry args={[ring * 2, 0.08, 0.18]} />
          <meshBasicMaterial color="#d7ff43" transparent opacity={0.68} />
        </mesh>
        <mesh raycast={() => null} position={[ring, 0, 0]}>
          <boxGeometry args={[0.18, 0.08, ring * 2]} />
          <meshBasicMaterial color="#d7ff43" transparent opacity={0.68} />
        </mesh>
        <mesh raycast={() => null} position={[-ring, 0, 0]}>
          <boxGeometry args={[0.18, 0.08, ring * 2]} />
          <meshBasicMaterial color="#d7ff43" transparent opacity={0.68} />
        </mesh>
      </group>
      <GizmoHandle
        position={[ring, 0.58, 0]}
        label={`${Math.round(b.rotation)}°`}
        shape="sphere"
        onStart={beginDrag}
        onManipulating={handleManipulating}
        onDrag={(dx, dy, _x, _y, p) => {
          const s = dragStart.current;
          const startRing = Math.max(s.width, s.depth) * 0.67;
          const arc = axisTravel(dx, dy, [startRing, 0.58, 0], [0, 0, -1], p, "up");
          const raw = (((s.rotation + THREE.MathUtils.radToDeg(arc / Math.max(4, startRing))) % 360) + 360) % 360;
          emitChange({ rotation: (Math.round(raw / 5) * 5) % 360 });
        }}
      />
    </group>
  );
}
