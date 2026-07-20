import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import {
  createWaypointTracker,
  type Waypoint,
  type WaypointTracker,
} from "@jgengine/core/ui/screenMarkers";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { WaypointMarkers } from "@jgengine/react/waypointMarkers";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import { useWorldProjection } from "@jgengine/shell/world/WorldEntityFrames";
import type { PlayableGame } from "@jgengine/shell/registry";

const HERO = "hero";

// Free-string kinds the game owns — the model never interprets these.
const KIND_COLORS: Record<string, string> = {
  objective: "#fbbf24",
  loot: "#4ade80",
  ally: "#38bdf8",
  extraction: "#f472b6",
};

// The shared tracker the world overlay renders. Waypoints are spread around and
// well behind the camera so some project on-screen (pins) and some off-screen
// (edge arrows with distances).
const waypoints: WaypointTracker = createWaypointTracker();
waypoints.set({ id: "obj", position: [4, 1.5, -6], kind: "objective", label: "Objective" });
waypoints.set({ id: "loot", position: [-9, 1, 4], kind: "loot", label: "Supply cache" });
waypoints.set({ id: "ally", position: [46, 1, -38], kind: "ally", label: "Ally" });
waypoints.set({ id: "extract", position: [8, 1, 90], kind: "extraction", label: "Extraction" });

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 120, d: 120 }, height: 2.5, frequency: 0.03, seed: "waypoints" }),
  vegetation: grass({ area: { w: 104, d: 104 }, density: 3, colors: ["#26401a", "#7fb04a"], seed: "waypoints" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [HERO]: { movement: { walkSpeed: 6 }, role: "player" },
};

const game = defineGameDefinition({
  name: "waypoint-markers",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(HERO, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
}

/** Pins the fullscreen `<Html>` overlay at the viewport center (like WorldEntityFrames). */
function pinToCenter(
  _el: THREE.Object3D,
  _camera: THREE.Camera,
  size: { width: number; height: number },
): [number, number] {
  return [size.width / 2, size.height / 2];
}

/**
 * In-scene overlay: samples the live R3F camera each frame, projects every
 * waypoint through the shell world projection, and renders the screen-space
 * {@link WaypointMarkers}. Distance is the 3D camera→waypoint distance.
 */
function WaypointOverlay({ tracker }: { tracker: WaypointTracker }): ReactNode {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const project = useWorldProjection();
  const [, setTick] = useState(0);
  useFrame(() => setTick((n) => (n + 1) % 1_000_000));

  const scratch = useRef(new THREE.Vector3());
  const distanceOf = useCallback(
    (waypoint: Waypoint) =>
      camera.position.distanceTo(
        scratch.current.set(waypoint.position[0], waypoint.position[1], waypoint.position[2]),
      ),
    [camera],
  );

  return (
    <Html fullscreen calculatePosition={pinToCenter} zIndexRange={[30, 0]} style={{ pointerEvents: "none" }}>
      <WaypointMarkers
        entries={tracker}
        project={project}
        viewport={{ width: size.width, height: size.height }}
        distanceOf={distanceOf}
        kindColors={KIND_COLORS}
        margin={34}
      />
    </Html>
  );
}

function WaypointUI(): ReactNode {
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div className="absolute left-4 top-4 rounded-lg border border-cyan-300/25 bg-neutral-900/80 px-4 py-3 shadow-xl backdrop-blur-sm">
        <h1 className="text-sm font-semibold tracking-wide text-cyan-200">Waypoint Markers</h1>
        <p className="max-w-xs text-xs text-white/60">
          On-screen objectives show a pin; off-screen ones become an edge arrow that points the way,
          with the distance. Orbit the camera and the arrows swing to follow.
        </p>
      </div>
    </div>
  );
}

export const waypointMarkersDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit: () => {}, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: WaypointUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  WorldOverlay: () => <WaypointOverlay tracker={waypoints} />,
  camera: { initialDistance: 20, initialHeight: 12, minDistance: 8, maxDistance: 60, targetHeight: 1, maxPolarAngle: 1.35 },
};
