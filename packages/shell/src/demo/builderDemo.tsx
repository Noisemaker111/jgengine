import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";

import { defineGame } from "@jgengine/core/game/defineGame";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { Aabb } from "@jgengine/core/world/geometry";
import { noiseField } from "@jgengine/core/world/terrain";
import { createEditableTerrain, createTerraformBrush } from "@jgengine/core/world/terraform";
import {
  createPlacementController,
  type PlacementController,
  type PlacementPreview,
  type SnapMode,
} from "@jgengine/core/world/placementController";
import {
  createPlacedStructureStore,
  type PlacedStructure,
} from "@jgengine/core/world/placedStructureStore";
import type { TerraformMode } from "@jgengine/core/world/terraform";

import { createPointerService } from "../pointer/pointerService";
import { EditableGround } from "../terrain/EditableGround";
import { TerraformBrushCursor } from "../terrain/TerraformBrushCursor";
import { PlacementGhost } from "../structures/PlacementGhost";
import type { PlayableGame } from "../registry";

const BOUNDS: Aabb = { minX: -20, minZ: -20, maxX: 20, maxZ: 20 };
const FOOTPRINT = { w: 3, d: 3 };
const HUT_HEIGHT = 2.4;

const terrain = createEditableTerrain({
  bounds: BOUNDS,
  base: noiseField({ seed: "builder", amplitude: 0.6, frequency: 0.04 }),
  cellSize: 1,
});
const brush = createTerraformBrush(terrain, { radius: 3.5, strength: 0.6 });
const structures = createPlacedStructureStore();

function seedScene(): void {
  structures.clear();
  terrain.reset();
  terrain.apply({ mode: "raise", center: [8, -6], radius: 7, strength: 3 });
  terrain.apply({ mode: "flatten", center: [-6, 4], radius: 6, strength: 1, target: 0 });
  for (let i = 0; i < 6; i += 1) terrain.apply({ mode: "paint", center: [-14 + i * 3, -12 + i * 2], radius: 1.6, surface: "path" });
  structures.add({ catalogId: "hut", position: [-6, terrain.sampleHeight(-6, 4), 4], rotationY: 0 });
  structures.add({ catalogId: "hut", position: [-2, terrain.sampleHeight(-2, 6), 6], rotationY: Math.PI / 6 });
  structures.add({ catalogId: "hut", position: [2, terrain.sampleHeight(2, 3), 3], rotationY: -Math.PI / 5 });
}
seedScene();

function Hut({ structure }: { structure: PlacedStructure }) {
  return (
    <group position={[structure.position[0], structure.position[1], structure.position[2]]} rotation-y={structure.rotationY}>
      <mesh position-y={HUT_HEIGHT / 2} castShadow>
        <boxGeometry args={[FOOTPRINT.w, HUT_HEIGHT, FOOTPRINT.d]} />
        <meshStandardMaterial color="#b08968" roughness={0.85} />
      </mesh>
      <mesh position-y={HUT_HEIGHT + 0.55} rotation-y={Math.PI / 4}>
        <coneGeometry args={[FOOTPRINT.w * 0.82, 1.3, 4]} />
        <meshStandardMaterial color="#6d4c3d" roughness={0.9} />
      </mesh>
    </group>
  );
}

interface BuilderState {
  mode: "build" | "terraform";
  terraformMode: TerraformMode;
  snapMode: SnapMode;
}

function obstaclesFrom(list: readonly PlacedStructure[]) {
  return list.map((s) => ({
    id: s.id,
    aabb: {
      minX: s.position[0] - FOOTPRINT.w / 2,
      maxX: s.position[0] + FOOTPRINT.w / 2,
      minZ: s.position[2] - FOOTPRINT.d / 2,
      maxZ: s.position[2] + FOOTPRINT.d / 2,
    },
  }));
}

function BuilderScene() {
  const three = useThree();
  const pointer = useMemo(() => createPointerService(), []);
  const controller = useRef<PlacementController>(
    createPlacementController({ footprint: FOOTPRINT, snapMode: "grid", grid: 1, rules: { bounds: BOUNDS } }),
  );
  const [preview, setPreview] = useState<PlacementPreview | null>(null);
  const [brushCenter, setBrushCenter] = useState<readonly [number, number] | null>([8, -6]);
  const [placed, setPlaced] = useState<readonly PlacedStructure[]>(structures.list());
  const [version, setVersion] = useState(0);
  const stateRef = useRef<BuilderState>({ mode: "build", terraformMode: "raise", snapMode: "grid" });

  useEffect(() => structures.subscribe(() => setPlaced(structures.list())), []);

  useEffect(() => {
    const seed: PlacementPreview = controller.current.hover({ point: [-6, terrain.sampleHeight(-6, -4), -4], normal: [0, 1, 0] });
    setPreview(seed);
  }, []);

  useEffect(() => {
    const dom = three.gl.domElement;
    const onMove = (event: PointerEvent) => {
      const rect = dom.getBoundingClientRect();
      const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      pointer.setCursor(ndcX, ndcY, true);
      pointer.bind({ camera: three.camera, scene: three.scene, width: rect.width, height: rect.height });
      const hit = pointer.worldHit();
      if (hit === null) return;
      const st = stateRef.current;
      if (st.mode === "build") {
        controller.current.setRules({ bounds: BOUNDS, obstacles: obstaclesFrom(structures.list()) });
        setPreview(controller.current.hover({ point: hit.point, normal: hit.normal }));
      } else {
        setBrushCenter([hit.point[0], hit.point[2]]);
      }
    };
    const onLeave = () => pointer.setCursor(0, 0, false);
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const st = stateRef.current;
      if (st.mode === "build") {
        const commit = controller.current.commit();
        if (commit === null) return;
        structures.add({
          catalogId: "hut",
          position: [commit.center[0], terrain.sampleHeight(commit.center[0], commit.center[1]), commit.center[1]],
          rotationY: commit.rotationY,
        });
      } else {
        const center = brushCenter;
        if (center === null) return;
        if (st.terraformMode === "raise") brush.raise(center);
        else if (st.terraformMode === "lower") brush.lower(center);
        else if (st.terraformMode === "flatten") brush.flatten(center);
        else brush.paint(center, "gravel");
        setVersion((v) => v + 1);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      const st = stateRef.current;
      if (event.code === "KeyB") st.mode = "build";
      else if (event.code === "KeyT") st.mode = "terraform";
      else if (event.code === "KeyR") setPreview(controller.current.rotate());
      else if (event.code === "KeyG") {
        st.snapMode = controller.current.cycleSnapMode();
        setPreview(controller.current.current());
      } else if (event.code === "Digit1") st.terraformMode = "raise";
      else if (event.code === "Digit2") st.terraformMode = "lower";
      else if (event.code === "Digit3") st.terraformMode = "flatten";
      else if (event.code === "Digit4") st.terraformMode = "paint";
    };
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerleave", onLeave);
    dom.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerleave", onLeave);
      dom.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [pointer, three, brushCenter]);

  const invalidGhost = useMemo<PlacementPreview>(() => {
    const c = createPlacementController({ footprint: FOOTPRINT, snapMode: "free", rules: { bounds: BOUNDS, obstacles: obstaclesFrom(structures.list()) } });
    return c.hover({ point: [-6, terrain.sampleHeight(-6, 4) + 0.05, 4], normal: [0, 1, 0] });
  }, [placed]);

  return (
    <>
      <hemisphereLight args={["#cfe8ff", "#3a3320", 0.8]} />
      <EditableGround terrain={terrain} bounds={BOUNDS} version={version} baseColor="#4b7f3f" />
      {placed.map((structure) => (
        <Hut key={structure.id} structure={structure} />
      ))}
      <PlacementGhost preview={preview} height={HUT_HEIGHT} />
      <PlacementGhost preview={invalidGhost} height={HUT_HEIGHT} />
      <TerraformBrushCursor center={brushCenter} radius={brush.config().radius} mode="raise" />
    </>
  );
}

const game = defineGame({
  name: "builder-sandbox",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: {
    moveForward: ["KeyW"],
    moveBack: ["KeyS"],
    moveLeft: ["KeyA"],
    moveRight: ["KeyD"],
  },
});

function onInit(_ctx: GameContext): void {
  seedScene();
}
function onNewPlayer(_ctx: GameContext): void {}
function onTick(_ctx: GameContext, _dt: number): void {}

function BuilderUI() {
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div className="absolute left-4 top-4 rounded-lg border border-amber-300/25 bg-neutral-900/80 px-4 py-3 shadow-xl backdrop-blur-sm">
        <h1 className="text-sm font-semibold tracking-wide text-amber-200">Build & Terraform Sandbox</h1>
        <p className="text-xs text-white/60">Ghost placement · valid/invalid tint · terraform brush</p>
      </div>
      <div className="absolute bottom-4 left-4 w-72 rounded-lg border border-white/15 bg-neutral-900/80 p-3 text-[13px] leading-6 shadow-xl backdrop-blur-sm">
        <div className="mb-1 border-b border-white/10 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/45">
          Tools
        </div>
        <ul className="text-white/80">
          <li><span className="text-amber-300">B</span> — build mode · <span className="text-amber-300">Left-click</span> place hut</li>
          <li><span className="text-amber-300">R</span> — rotate ghost · <span className="text-amber-300">G</span> — grid/free/surface snap</li>
          <li><span className="text-amber-300">T</span> — terraform · <span className="text-amber-300">1-4</span> raise/lower/flatten/paint</li>
          <li><span className="text-emerald-300">Green ghost</span> valid · <span className="text-red-300">Red ghost</span> blocked</li>
        </ul>
      </div>
    </div>
  );
}

export const builderDemoGame: PlayableGame = {
  game,
  content: {},
  loop: { onInit, onNewPlayer, onTick },
  GameUI: BuilderUI,
  environment: BuilderScene,
  camera: {
    perspective: "third",
    followEnabled: false,
    initialDistance: 46,
    initialHeight: 40,
    minDistance: 14,
    maxDistance: 120,
    targetHeight: 1,
    targetOffset: { x: 0, z: -2 },
    maxPolarAngle: 1.15,
  },
};
