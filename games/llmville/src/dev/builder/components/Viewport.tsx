import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { MOUSE, PCFShadowMap, Plane, Raycaster, Vector2, Vector3 } from "three";
import type { Camera } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { BuilderScenePrompt } from "@/dev/builder/components/BuilderScenePrompt";
import { BuilderToolStrip } from "@/dev/builder/components/BuilderToolStrip";
import { BUILDER_CSS } from "@/dev/builder/components/builderStyles";
import {
  BuilderStore,
  getBuilderSelectionBounds,
  type BuilderActivePlacement,
  type BuilderSelectionRef,
  useBuilderState,
} from "@/dev/builder/builderStore";
import { ResizeGizmo } from "@/dev/builder/components/ResizeGizmo";
import { MapDecor } from "@/world/components/MapDecor";
import { getMapGrid } from "@llmville/game/builder/document";
import { resolveMaterial } from "@/dev/builder/builderMaterials";
import { snapWorldToGrid, type GridFootprint, type MapGridSpec } from "@llmville/game/world/grid";
import { computeWallSegment } from "@llmville/game/builder/walls";
import { getModelBoundsSnapshot, subscribeModelBounds } from "@/scene/modelBoundsCache";
import { getWorldModelAsset } from "@llmville/game/world/worldModelCatalog";
import { registerBuilderOrbitControls } from "@/dev/builder/builderCameraBridge";
import {
  SceneCapture,
  useScreenshotRequestPoller,
} from "@/dev/builder/components/SceneCapture";

type BuilderPointerEvent = ThreeEvent<PointerEvent>;
type BuilderMouseEvent = ThreeEvent<MouseEvent>;
type BuilderContextMenuState = {
  x: number;
  y: number;
  ref: BuilderSelectionRef | null;
};
type CanvasDragState = { kind: "ground"; lastX: number; lastZ: number };
type FloorClickState = {
  worldX: number;
  worldZ: number;
  screenX: number;
  screenY: number;
  moved: boolean;
} | null;

const GROUND_DRAG_PLANE = new Plane(new Vector3(0, 1, 0), 0);
const GRID_PADDING = 1.5;
const ORBIT_TARGET_EPSILON_SQ = 1e-8;
const ORBIT_PIVOT_DRIFT = new Vector3();

function isClientPointInsideCanvas(clientX: number, clientY: number, canvas: HTMLCanvasElement): boolean {
  const rect = canvas.getBoundingClientRect();
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function projectClientPointToGround(
  clientX: number,
  clientY: number,
  camera: Camera,
  canvas: HTMLCanvasElement,
): [number, number] | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const pointer = new Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  const raycaster = new Raycaster();
  const point = new Vector3();
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.ray.intersectPlane(GROUND_DRAG_PLANE, point);
  return hit ? [point.x, point.z] : null;
}

function getBuilderOrbitTarget(floor: { centerX: number; centerZ: number }): [number, number, number] {
  return [floor.centerX, 0, floor.centerZ];
}

function getBuilderCameraPosition(floor: { centerX: number; centerZ: number; width: number; depth: number }): [number, number, number] {
  const span = Math.max(floor.width, floor.depth);
  const distance = Math.max(14, span * 0.42);
  return [floor.centerX + distance, distance * 0.72, floor.centerZ + distance * 1.05];
}

function BuilderRoomShell({ mapData }: { mapData: ReturnType<typeof BuilderStore.getState>["mapData"] }) {
  const { environment, walls } = mapData;
  const floorMaterial = resolveMaterial(environment.floorMaterial, undefined);
  const wallColor = environment.wallColor || resolveMaterial(environment.wallMaterial, undefined).color;
  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[environment.floor.centerX, 0, environment.floor.centerZ]}
        receiveShadow
      >
        <planeGeometry args={[environment.floor.width, environment.floor.depth]} />
        <meshStandardMaterial color={floorMaterial.color} roughness={0.9} />
      </mesh>
      {walls.map((wall, index) => (
        <mesh key={`wall-${index}`} position={wall.position} castShadow receiveShadow>
          <boxGeometry args={wall.args} />
          <meshStandardMaterial color={wallColor} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

function BuilderSceneContent({
  mapData,
  editingScope,
}: {
  mapData: ReturnType<typeof BuilderStore.getState>["mapData"];
  editingScope: ReturnType<typeof BuilderStore.getState>["editingScope"];
}) {
  const grid = useMemo(() => getMapGrid(mapData), [mapData]);

  if (editingScope === "isolated") {
    return <MapDecor items={mapData.decor} grid={grid} modelLoadingFallback="none" />;
  }

  return (
    <>
      <BuilderRoomShell mapData={mapData} />
      <MapDecor items={mapData.decor} grid={grid} modelLoadingFallback="none" />
    </>
  );
}

export function Viewport({ onContextMenuRequest }: { onContextMenuRequest: (state: BuilderContextMenuState) => void }) {
  const state = useBuilderState();
  const floor = state.mapData.environment.floor;
  const showRoomShell = state.editingScope === "room";
  const showIsolatedDecor = state.editingScope === "isolated";

  const { job: screenshotJob, acknowledgeJob } = useScreenshotRequestPoller();

  const activeCapture = useMemo(() => {
    if (!screenshotJob) return null;
    return {
      key: `request-${screenshotJob.requestId}`,
      angles: screenshotJob.angles,
      requestId: screenshotJob.requestId,
      sceneVersion: screenshotJob.sceneVersion,
      onComplete: () => acknowledgeJob(screenshotJob.requestId),
    };
  }, [screenshotJob, acknowledgeJob]);

  const help = useMemo(() => {
    if (state.tool === "stamp" && state.activePlacement) {
      return `Placing ${state.activePlacement.label} · click floor for each copy · Esc to stop`;
    }
    switch (state.tool) {
      case "select":
        return "Click object to select · drag to move · red/green/blue arrows resize width/height/depth";
      case "stamp":
        return "Pick an item from the sidebar to start placing copies";
      case "wall":
        return state.wallStart
          ? "Click the floor to finish this wall · Esc to cancel"
          : "Click the floor to start a wall";
      case "primitive":
        return "Click the floor to place the active primitive or catalog item";
      case "material":
        return "Click a part to paint with the active material";
      case "delete":
        return "Click any object to remove it";
    }
  }, [state.tool, state.wallStart, state.activePlacement]);

  return (
    <div className={BUILDER_CSS.canvas} onContextMenu={(event) => event.preventDefault()}>
      <BuilderToolStrip />
      <div className={BUILDER_CSS.canvasHelp}>{help}</div>
      <BuilderScenePrompt />
      <Canvas
        camera={{ fov: 50, near: 0.1, far: 400 }}
        shadows="percentage"
        gl={{ antialias: true, stencil: false, depth: true, preserveDrawingBuffer: true }}
        onCreated={({ camera, gl }) => {
          const position = getBuilderCameraPosition(floor);
          camera.position.set(...position);
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = PCFShadowMap;
        }}
      >
        <color attach="background" args={["#111827"]} />
        <fog attach="fog" args={["#172033", 28, 70]} />
        <ambientLight intensity={0.72} />
        <hemisphereLight args={["#fff6e6", "#263238", 0.95]} />
        <spotLight position={[1, 9, 4]} angle={0.85} penumbra={0.6} intensity={130} castShadow shadow-mapSize={[1024, 1024]} color="#fff1dc" />
        <pointLight position={[-5, 3.4, 2]} intensity={20} color="#5fc2a8" />

        <Suspense fallback={null}>
          {showIsolatedDecor || showRoomShell ? (
            <BuilderSceneContent
              mapData={state.mapData}
              editingScope={state.editingScope}
            />
          ) : null}
        </Suspense>

        <BuilderCanvasTools
          onContextMenuRequest={onContextMenuRequest}
          captureActive={activeCapture !== null}
        />
        {activeCapture ? (
          <SceneCapture
            key={activeCapture.key}
            floor={floor}
            angles={activeCapture.angles}
            requestId={activeCapture.requestId}
            sceneVersion={activeCapture.sceneVersion}
            onComplete={activeCapture.onComplete}
          />
        ) : null}
      </Canvas>
    </div>
  );
}

function BuilderCanvasTools({
  onContextMenuRequest,
  captureActive,
}: {
  onContextMenuRequest: (menu: BuilderContextMenuState) => void;
  captureActive?: boolean;
}) {
  const { camera, gl } = useThree();
  const state = useBuilderState();
  const floor = state.mapData.environment.floor;
  const orbitTarget = useMemo(() => getBuilderOrbitTarget(floor), [floor.centerX, floor.centerZ]);
  const orbitTargetVector = useMemo(
    () => new Vector3(...orbitTarget),
    [orbitTarget[0], orbitTarget[1], orbitTarget[2]],
  );
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const grid = useMemo(() => getMapGrid(state.mapData), [state.mapData]);
  const [cursor, setCursor] = useState<[number, number]>([floor.centerX, floor.centerZ]);
  const [controlsEnabled, setControlsEnabled] = useState(true);
  const dragRef = useRef<CanvasDragState | null>(null);
  const dragUndoPushedRef = useRef(false);
  const floorClickRef = useRef<FloorClickState>(null);
  const modelBoundsSnapshot = useSyncExternalStore(
    subscribeModelBounds,
    getModelBoundsSnapshot,
    getModelBoundsSnapshot,
  );
  const selectionBounds = useMemo(() => {
    return getBuilderSelectionBounds(state.mapData, state.selectedRefs);
  }, [state.mapData, state.selectedRefs, modelBoundsSnapshot]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    registerBuilderOrbitControls(controls);
    return () => registerBuilderOrbitControls(null);
  }, []);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const position = getBuilderCameraPosition(floor);
    controls.object.position.set(...position);
    controls.target.copy(orbitTargetVector);
    controls.update();
    // Only reframe when switching room / isolated — not when the API syncs mapData.
  }, [state.editingScope]);

  useEffect(() => {
    const canvas = gl.domElement;

    const snapOrbitPivotForRotate = (event: MouseEvent) => {
      if (event.button !== 0 || !controlsEnabled) return;
      if (!isClientPointInsideCanvas(event.clientX, event.clientY, canvas)) return;
      const controls = controlsRef.current;
      if (!controls?.enabled) return;
      if (controls.target.distanceToSquared(orbitTargetVector) <= ORBIT_TARGET_EPSILON_SQ) return;

      // Pan moves camera and target together. Re-center orbit on the grid without changing the view.
      ORBIT_PIVOT_DRIFT.copy(controls.target).sub(orbitTargetVector);
      controls.target.copy(orbitTargetVector);
      controls.object.position.sub(ORBIT_PIVOT_DRIFT);
    };

    window.addEventListener("mousedown", snapOrbitPivotForRotate, true);
    return () => window.removeEventListener("mousedown", snapOrbitPivotForRotate, true);
  }, [controlsEnabled, gl, orbitTargetVector]);

  const stopDragging = useCallback(() => {
    dragRef.current = null;
    dragUndoPushedRef.current = false;
    floorClickRef.current = null;
    setControlsEnabled(true);
  }, []);

  const beginGroundDrag = useCallback((event: BuilderPointerEvent) => {
    captureCanvasPointer(event);
    const point = projectClientPointToGround(event.nativeEvent.clientX, event.nativeEvent.clientY, camera, gl.domElement)
      ?? [event.point.x, event.point.z];
    dragUndoPushedRef.current = false;
    dragRef.current = { kind: "ground", lastX: point[0], lastZ: point[1] };
    floorClickRef.current = null;
    setControlsEnabled(false);
  }, [camera, gl]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if ((event.buttons & 1) === 0) {
        stopDragging();
        return;
      }
      const point = projectClientPointToGround(event.clientX, event.clientY, camera, gl.domElement);
      if (!point) return;
      const [worldX, worldZ] = point;
      const dx = worldX - drag.lastX;
      const dz = worldZ - drag.lastZ;
      if (Math.abs(dx) < 0.002 && Math.abs(dz) < 0.002) return;
      if (!dragUndoPushedRef.current) {
        BuilderStore.beginUndoableEdit();
        dragUndoPushedRef.current = true;
      }
      BuilderStore.moveSelection(dx, 0, dz, false);
      setCursor([worldX, worldZ]);
      dragRef.current = { ...drag, lastX: worldX, lastZ: worldZ };
    };

    const onPointerUp = () => {
      if (dragRef.current) stopDragging();
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [camera, gl, stopDragging]);

  const handlePointerMove = useCallback((event: BuilderPointerEvent) => {
    if (dragRef.current || (event.nativeEvent.buttons & 4) === 0) {
      event.stopPropagation();
    }
    setCursor([event.point.x, event.point.z]);
    if (floorClickRef.current) {
      const dx = event.nativeEvent.clientX - floorClickRef.current.screenX;
      const dy = event.nativeEvent.clientY - floorClickRef.current.screenY;
      if (Math.hypot(dx, dy) > 4) floorClickRef.current.moved = true;
    }
  }, []);

  const handleFloorPointerDown = useCallback((event: BuilderPointerEvent) => {
    if (event.nativeEvent.button !== 0) return;
    event.stopPropagation();
    const storeState = BuilderStore.getState();
    if (
      storeState.tool === "select"
      && storeState.selectedRefs.length > 0
      && pointerTargetsSelection(
        storeState.mapData,
        storeState.selectedRefs,
        event.nativeEvent.clientX,
        event.nativeEvent.clientY,
        camera,
        gl.domElement,
        event.point.x,
        event.point.z,
      )
    ) {
      beginGroundDrag(event);
      return;
    }
    floorClickRef.current = {
      worldX: event.point.x,
      worldZ: event.point.z,
      screenX: event.nativeEvent.clientX,
      screenY: event.nativeEvent.clientY,
      moved: false,
    };
  }, [beginGroundDrag, camera, gl]);

  const handleFloorPointerUp = useCallback((event: BuilderPointerEvent) => {
    if (event.nativeEvent.button !== 0) return;
    event.stopPropagation();
    const floorClick = floorClickRef.current;
    if (floorClick && !floorClick.moved && !dragRef.current) {
      BuilderStore.handleFloorClick(floorClick.worldX, floorClick.worldZ, event.nativeEvent.shiftKey);
    }
    stopDragging();
  }, [stopDragging]);

  const handleFloorContextMenu = useCallback((event: BuilderMouseEvent) => {
    event.stopPropagation();
    event.nativeEvent.preventDefault();
    onContextMenuRequest({
      x: event.nativeEvent.clientX,
      y: event.nativeEvent.clientY,
      ref: BuilderStore.hitTest(event.point.x, event.point.z),
    });
  }, [onContextMenuRequest]);

  const handlePartPointerDown = useCallback((ref: BuilderSelectionRef, event: BuilderPointerEvent) => {
    const additive = event.nativeEvent.shiftKey;
    if (event.nativeEvent.button !== 0) return;
    event.stopPropagation();
    if (state.tool === "delete") {
      BuilderStore.deleteRef(ref);
      return;
    }
    if (state.tool === "material") {
      BuilderStore.applyMaterialToRef(ref);
      return;
    }
    if (state.tool !== "select") {
      BuilderStore.setTool("select");
    }
    const storeState = BuilderStore.getState();
    const refInSelection = hasCanvasSelectionRef(storeState.selectedRefs, ref);
    if (
      !additive
      && storeState.selectedRefs.length > 0
      && !refInSelection
      && pointerTargetsSelection(
        storeState.mapData,
        storeState.selectedRefs,
        event.nativeEvent.clientX,
        event.nativeEvent.clientY,
        camera,
        gl.domElement,
        event.point.x,
        event.point.z,
      )
    ) {
      beginGroundDrag(event);
      return;
    }
    if (!refInSelection || additive) {
      BuilderStore.selectRef(ref, additive);
    }
    beginGroundDrag(event);
  }, [beginGroundDrag, camera, gl, state.tool]);

  const handlePartContextMenu = useCallback((ref: BuilderSelectionRef, event: BuilderMouseEvent) => {
    event.stopPropagation();
    event.nativeEvent.preventDefault();
    if (!hasCanvasSelectionRef(BuilderStore.getState().selectedRefs, ref)) {
      BuilderStore.selectRef(ref, event.nativeEvent.shiftKey);
    }
    onContextMenuRequest({
      x: event.nativeEvent.clientX,
      y: event.nativeEvent.clientY,
      ref,
    });
  }, [onContextMenuRequest]);

  return (
    <>
      <mesh
        position={[floor.centerX, 0.045, floor.centerZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerMove={handlePointerMove}
        onPointerDown={handleFloorPointerDown}
        onPointerUp={handleFloorPointerUp}
        onContextMenu={handleFloorContextMenu}
      >
        <planeGeometry args={[floor.width + GRID_PADDING * 2, floor.depth + GRID_PADDING * 2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <gridHelper
        args={[
          Math.max(floor.width, floor.depth) + GRID_PADDING * 2,
          Math.max(2, Math.round((Math.max(floor.width, floor.depth) + GRID_PADDING * 2) / grid.tileSize)),
          "#475569",
          "#1e293b",
        ]}
        position={[floor.centerX, 0.035, floor.centerZ]}
      />
      <WorldOriginMarker />
      <BuilderPartHitTargets
        onPartPointerDown={handlePartPointerDown}
        onPartPointerMove={handlePointerMove}
        onPartPointerUp={stopDragging}
        onPartContextMenu={handlePartContextMenu}
      />
      <PlaceBoundsOverlay />
      <HoverHighlight />
      <SelectionBoundsMesh bounds={selectionBounds} color="#f97316" opacity={0.36} />
      <ResizeGizmo
        bounds={selectionBounds}
        grid={grid}
        onDragActiveChange={setControlsEnabled}
      />
      <WallPreview cursor={cursor} />
      <PlacementGhost cursor={cursor} />
      <OrbitControls
        ref={controlsRef}
        enableDamping={false}
        enablePan
        enableZoom
        enableRotate
        enabled={controlsEnabled && !captureActive}
        screenSpacePanning
        mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.PAN, RIGHT: undefined }}
      />
    </>
  );
}

function WorldOriginMarker() {
  const arm = 0.55;
  const thickness = 0.045;

  return (
    <group position={[0, 0.042, 0]}>
      <mesh>
        <sphereGeometry args={[0.07, 14, 14]} />
        <meshBasicMaterial color="#5fc2a8" depthWrite={false} />
      </mesh>
      <mesh position={[arm / 2, 0, 0]}>
        <boxGeometry args={[arm, thickness, thickness]} />
        <meshBasicMaterial color="#ec8f78" depthWrite={false} />
      </mesh>
      <mesh position={[0, 0, arm / 2]}>
        <boxGeometry args={[thickness, thickness, arm]} />
        <meshBasicMaterial color="#5fc2a8" depthWrite={false} />
      </mesh>
    </group>
  );
}

function PlaceBoundsOverlay() {
  const state = useBuilderState();
  const floor = state.mapData.environment.floor;
  const isolated = state.editingScope === "isolated";
  return (
    <group position={[floor.centerX, 0.05, floor.centerZ]}>
      {!isolated ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[floor.width, floor.depth]} />
          <meshBasicMaterial color="#5fc2a8" transparent opacity={0.1} depthWrite={false} />
        </mesh>
      ) : null}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[floor.width, floor.depth]} />
        <meshBasicMaterial
          color="#5fc2a8"
          wireframe
          transparent
          opacity={isolated ? 0.35 : 0.7}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function pointerTargetsSelection(
  mapData: ReturnType<typeof BuilderStore.getState>["mapData"],
  selectedRefs: readonly BuilderSelectionRef[],
  clientX: number,
  clientY: number,
  camera: Camera,
  canvas: HTMLCanvasElement,
  fallbackX: number,
  fallbackZ: number,
): boolean {
  if (selectedRefs.length === 0) return false;
  const bounds = getBuilderSelectionBounds(mapData, selectedRefs);
  if (!bounds) return false;
  const ground = projectClientPointToGround(clientX, clientY, camera, canvas);
  const x = ground?.[0] ?? fallbackX;
  const z = ground?.[1] ?? fallbackZ;
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

function BuilderPartHitTargets({
  onPartPointerDown,
  onPartPointerMove,
  onPartPointerUp,
  onPartContextMenu,
}: {
  onPartPointerDown: (ref: BuilderSelectionRef, event: BuilderPointerEvent) => void;
  onPartPointerMove: (event: BuilderPointerEvent) => void;
  onPartPointerUp: () => void;
  onPartContextMenu: (ref: BuilderSelectionRef, event: BuilderMouseEvent) => void;
}) {
  const state = useBuilderState();
  const showRoomShell = state.editingScope === "room";
  return (
    <>
      {showRoomShell && state.mapData.walls.map((wall, index) => {
        const ref: BuilderSelectionRef = { kind: "wall", index };
        return (
          <mesh
            key={`wall-hit-${index}`}
            position={wall.position}
            onPointerDown={(event) => onPartPointerDown(ref, event)}
            onPointerMove={onPartPointerMove}
            onPointerUp={onPartPointerUp}
            onContextMenu={(event) => onPartContextMenu(ref, event)}
            onPointerOver={() => BuilderStore.setHoverRef(ref)}
            onPointerOut={() => BuilderStore.setHoverRef(null)}
          >
            <boxGeometry args={[
              Math.max(0.16, wall.args[0]),
              Math.max(0.16, wall.args[1]),
              Math.max(0.16, wall.args[2]),
            ]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        );
      })}
      {state.mapData.decor.map((item) => {
        if (!item.id) return null;
        const ref: BuilderSelectionRef = { kind: "decor", id: item.id };
        const bounds = getBuilderSelectionBounds(state.mapData, [ref]);
        if (!bounds) return null;
        return (
          <mesh
            key={`decor-hit-${item.id}`}
            position={boundsCenter(bounds)}
            onPointerDown={(event) => onPartPointerDown(ref, event)}
            onPointerMove={onPartPointerMove}
            onPointerUp={onPartPointerUp}
            onContextMenu={(event) => onPartContextMenu(ref, event)}
            onPointerOver={() => BuilderStore.setHoverRef(ref)}
            onPointerOut={() => BuilderStore.setHoverRef(null)}
          >
            <boxGeometry args={boundsArgs(bounds, 0.16)} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        );
      })}
    </>
  );
}

function HoverHighlight() {
  const state = useBuilderState();
  const hoverBounds = state.hoverRef && !hasCanvasSelectionRef(state.selectedRefs, state.hoverRef)
    ? getBuilderSelectionBounds(state.mapData, [state.hoverRef])
    : null;
  return <SelectionBoundsMesh bounds={hoverBounds} color="#38bdf8" opacity={0.42} grow={0.05} />;
}

function SelectionBoundsMesh({
  bounds,
  color = "#f59e0b",
  opacity = 0.45,
  grow = 0,
}: {
  bounds: ReturnType<typeof getBuilderSelectionBounds>;
  color?: string;
  opacity?: number;
  grow?: number;
}) {
  if (!bounds) return null;
  const [width, height, depth] = boundsArgs(bounds, grow);
  return (
    <mesh position={boundsCenter(bounds)}>
      <boxGeometry args={[width, height, depth]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} wireframe />
    </mesh>
  );
}

function WallPreview({ cursor }: { cursor: [number, number] }) {
  const state = useBuilderState();
  if (state.tool !== "wall" || !state.wallStart) return null;
  const grid = getMapGrid(state.mapData);
  const snapped = snapWorldToGrid(grid, cursor[0], cursor[1]);
  const { args, position } = computeWallSegment(
    state.mapData.environment.wallHeight,
    state.mapData.environment.wallThickness,
    grid,
    state.wallStart,
    [snapped.worldX, snapped.worldZ],
  );
  return (
    <mesh position={position}>
      <boxGeometry args={args} />
      <meshStandardMaterial color="#6366f1" transparent opacity={0.38} emissive="#6366f1" emissiveIntensity={0.25} />
    </mesh>
  );
}

function StampPlacementGhost({
  cursor,
  placement,
}: {
  cursor: [number, number];
  placement: BuilderActivePlacement;
}) {
  const state = useBuilderState();
  const grid = getMapGrid(state.mapData);
  const footprint = stampGhostFootprint(state, placement, grid);
  const snapped = snapWorldToGrid(grid, cursor[0], cursor[1], footprint);
  const size = [footprint.width * grid.tileSize, 1, footprint.depth * grid.tileSize] as [number, number, number];
  return (
    <mesh position={[snapped.worldX, size[1] / 2, snapped.worldZ]}>
      <boxGeometry args={size} />
      <meshStandardMaterial color="#34d399" transparent opacity={0.34} emissive="#34d399" emissiveIntensity={0.18} wireframe />
    </mesh>
  );
}

function stampGhostFootprint(
  state: ReturnType<typeof BuilderStore.getState>,
  placement: BuilderActivePlacement,
  grid: MapGridSpec,
): GridFootprint {
  if (placement.kind === "catalog") {
    return getWorldModelAsset(placement.modelKey)?.footprint ?? { width: 1, depth: 1 };
  }
  if (placement.kind === "recent") {
    const recent = state.recentGeneratedAssets.find((entry) => entry.id === placement.recentId);
    const decor = recent?.decor;
    if (decor?.footprint) return decor.footprint;
    if (decor?.type === "plane" && decor.args) {
      return {
        width: Math.max(1, Math.ceil((decor.args[0] ?? 1) / grid.tileSize)),
        depth: Math.max(1, Math.ceil((decor.args[1] ?? 1) / grid.tileSize)),
      };
    }
    return { width: 1, depth: 1 };
  }
  const template = placement.template;
  if (template.footprint) return template.footprint;
  if (template.type === "plane" && template.args) {
    return {
      width: Math.max(1, Math.ceil((template.args[0] ?? 1) / grid.tileSize)),
      depth: Math.max(1, Math.ceil((template.args[1] ?? 1) / grid.tileSize)),
    };
  }
  return { width: 1, depth: 1 };
}

function PlacementGhost({ cursor }: { cursor: [number, number] }) {
  const state = useBuilderState();
  if (state.tool === "stamp" && state.activePlacement) {
    return <StampPlacementGhost cursor={cursor} placement={state.activePlacement} />;
  }
  if (state.tool !== "primitive") return null;
  const grid = getMapGrid(state.mapData);
  const footprint = getActiveFootprint(state, grid);
  const snapped = snapWorldToGrid(grid, cursor[0], cursor[1], footprint);
  const args = getGhostBoxArgs(state, grid, footprint);
  if (state.placementSource === "primitive" && state.primitive.kind === "sphere") {
    return (
      <mesh position={[snapped.worldX, state.primitive.radius, snapped.worldZ]}>
        <sphereGeometry args={[state.primitive.radius, state.primitive.segments, Math.max(12, Math.floor(state.primitive.segments / 2))]} />
        <meshStandardMaterial color="#34d399" transparent opacity={0.42} emissive="#34d399" emissiveIntensity={0.22} />
      </mesh>
    );
  }
  if (state.placementSource === "primitive" && state.primitive.kind === "cylinder") {
    return (
      <mesh position={[snapped.worldX, state.primitive.height / 2, snapped.worldZ]}>
        <cylinderGeometry args={[state.primitive.radius, state.primitive.radius, state.primitive.height, state.primitive.segments]} />
        <meshStandardMaterial color="#34d399" transparent opacity={0.42} emissive="#34d399" emissiveIntensity={0.22} />
      </mesh>
    );
  }
  return (
    <mesh position={[snapped.worldX, args[1] / 2, snapped.worldZ]}>
      <boxGeometry args={args} />
      <meshStandardMaterial color="#34d399" transparent opacity={0.34} emissive="#34d399" emissiveIntensity={0.18} wireframe={state.placementSource === "catalog"} />
    </mesh>
  );
}

function getActiveFootprint(state: ReturnType<typeof BuilderStore.getState>, grid: MapGridSpec): GridFootprint {
  if (state.placementSource === "catalog") {
    return getWorldModelAsset(state.selectedCatalogModelKey)?.footprint ?? { width: 1, depth: 1 };
  }
  if (state.primitive.kind === "box" || state.primitive.kind === "plane") {
    return {
      width: Math.max(1, Math.ceil(state.primitive.width / grid.tileSize)),
      depth: Math.max(1, Math.ceil(state.primitive.depth / grid.tileSize)),
    };
  }
  return {
    width: Math.max(1, Math.ceil((state.primitive.radius * 2) / grid.tileSize)),
    depth: Math.max(1, Math.ceil((state.primitive.radius * 2) / grid.tileSize)),
  };
}

function getGhostBoxArgs(
  state: ReturnType<typeof BuilderStore.getState>,
  grid: MapGridSpec,
  footprint: GridFootprint,
): [number, number, number] {
  if (state.placementSource === "catalog") {
    return [footprint.width * grid.tileSize, 1, footprint.depth * grid.tileSize];
  }
  if (state.primitive.kind === "plane") {
    return [state.primitive.width, 0.04, state.primitive.depth];
  }
  return [state.primitive.width, state.primitive.height, state.primitive.depth];
}

function boundsCenter(bounds: NonNullable<ReturnType<typeof getBuilderSelectionBounds>>): [number, number, number] {
  return [
    (bounds.minX + bounds.maxX) / 2,
    (bounds.minY + bounds.maxY) / 2,
    (bounds.minZ + bounds.maxZ) / 2,
  ];
}

function boundsArgs(bounds: NonNullable<ReturnType<typeof getBuilderSelectionBounds>>, grow: number): [number, number, number] {
  return [
    Math.max(0.05, bounds.maxX - bounds.minX + grow),
    Math.max(0.12, bounds.maxY - bounds.minY + grow),
    Math.max(0.05, bounds.maxZ - bounds.minZ + grow),
  ];
}

function captureCanvasPointer(event: BuilderPointerEvent) {
  const target = event.target as EventTarget & { setPointerCapture?: (pointerId: number) => void };
  target.setPointerCapture?.(event.nativeEvent.pointerId);
}

export function hasCanvasSelectionRef(refs: readonly BuilderSelectionRef[], ref: BuilderSelectionRef): boolean {
  return refs.some((candidate) => selectionRefKey(candidate) === selectionRefKey(ref));
}

export function selectionRefKey(ref: BuilderSelectionRef): string {
  return ref.kind === "decor" ? `decor:${ref.id}` : `wall:${ref.index}`;
}

export function selectionRefLabel(ref: BuilderSelectionRef): string {
  return ref.kind === "decor" ? `Decor ${ref.id}` : `Wall ${ref.index + 1}`;
}
