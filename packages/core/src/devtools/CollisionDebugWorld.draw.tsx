import { Html } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import * as THREE from "three";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { useGameContext } from "@jgengine/react/provider";

import { POSTFX_OVERLAY_USERDATA } from "@jgengine/core/postfx/postfxOverlay.draw";
import {
  aimProbeNeeded,
  anyCollisionLayerOn,
  colliderScanNeeded,
  collisionDebug,
  projectileListenNeeded,
  type CollisionDebugState,
} from "./collisionDebug";
import {
  AIM_DAMAGE_COLOR,
  AIM_LASER_COLOR,
  AIM_MISS_COLOR,
  AIM_SOLID_COLOR,
  BODY_WIRE_COLOR,
  collectDebugShapes,
  computeAimLaser,
  HITBOX_WIRE_COLOR,
  muzzleMarkerFromOrigin,
  PROJECTILE_PATH_COLOR,
  type AimEndpointKind,
  type AimLaserDebug,
  type DebugShapeEntry,
} from "./collisionDebugMath";
import { useFrameTask } from "@jgengine/core/frame/useFrameTask.draw";
import { EngineDrawMount, SceneObjectGroup } from "@jgengine/core/frame/useEngineDraw.draw";
import { type EngineDraw, type EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineHost } from "@jgengine/core/frame/engineHost.draw";
import { CAMERA_POST_FRAME_PRIORITY } from "@jgengine/core/camera/cameraRigs.draw";

function useCollisionDebugState(): CollisionDebugState {
  return useSyncExternalStore(
    collisionDebug.subscribe,
    () => collisionDebug.getState(),
    () => collisionDebug.getState(),
  );
}

/** World-space label anchor for a debug shape — matches where the old `<Html>` sat. */
function shapeLabelAnchor(entry: DebugShapeEntry): readonly [number, number, number] {
  if (entry.shape.kind === "sphere") return entry.shape.center;
  if (entry.shape.kind === "mesh") {
    return [
      entry.shape.center[0],
      entry.shape.center[1] + entry.shape.halfExtents[1] + 0.15,
      entry.shape.center[2],
    ];
  }
  return [
    entry.shape.center[0],
    entry.shape.center[1] + entry.shape.halfExtents[1] + 0.15,
    entry.shape.center[2],
  ];
}

function endpointColor(kind: AimEndpointKind): string {
  if (kind === "damage") return AIM_DAMAGE_COLOR;
  if (kind === "solid") return AIM_SOLID_COLOR;
  return AIM_MISS_COLOR;
}

interface DebugDrawInputs {
  shapes: readonly DebugShapeEntry[];
  projectilePoints: readonly { id: number; points: [THREE.Vector3, THREE.Vector3] }[];
  muzzleOrigins: readonly { id: number; origin: readonly [number, number, number] }[];
  laser: AimLaserDebug | null;
}

/**
 * All collision-debug wire geometry as one draw: collider shapes, projectile path lines,
 * muzzle markers, the aim laser and its endpoint mark. Reconciles on `update`, which the
 * React bridge calls after every commit — the old per-shape JSX did the same through renders.
 */
function collisionDebugDraw(getInputs: () => DebugDrawInputs): EngineDraw {
  const group = new THREE.Group();
  const shapes = new Map<string, THREE.Object3D>();
  const paths = new Map<number, THREE.Line>();
  const muzzles = new Map<number, THREE.Mesh>();
  let laserGroup: THREE.Group | null = null;
  const materials = new Map<string, THREE.Material>();

  const material = (color: string, wireframe: boolean, opacity = 0.85) => {
    const key = `${color}:${wireframe}:${opacity}`;
    let found = materials.get(key);
    if (found === undefined) {
      found = new THREE.MeshBasicMaterial({
        color,
        wireframe,
        transparent: opacity < 1,
        opacity,
        depthTest: false,
      });
      materials.set(key, found);
    }
    return found as THREE.MeshBasicMaterial;
  };

  const lineMaterial = (color: string, opacity: number) => {
    const key = `line:${color}:${opacity}`;
    let found = materials.get(key);
    if (found === undefined) {
      found = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false });
      materials.set(key, found);
    }
    return found as THREE.LineBasicMaterial;
  };

  const disposeObject = (object: THREE.Object3D) => {
    object.traverse((node) => {
      if (node instanceof THREE.Mesh || node instanceof THREE.Line) {
        node.geometry.dispose();
      }
    });
    group.remove(object);
  };

  const buildShape = (entry: DebugShapeEntry): THREE.Object3D => {
    const color = entry.style === "hitbox" ? HITBOX_WIRE_COLOR : BODY_WIRE_COLOR;
    if (entry.shape.kind === "sphere") {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(entry.shape.radius, 16, 12),
        material(color, true),
      );
      mesh.position.set(entry.shape.center[0], entry.shape.center[1], entry.shape.center[2]);
      return mesh;
    }
    if (entry.shape.kind === "mesh") {
      const outer = new THREE.Group();
      outer.position.set(entry.position[0], entry.position[1], entry.position[2]);
      outer.rotation.y = entry.rotationY;
      const inner = new THREE.Group();
      inner.position.set(
        entry.shape.meshTranslate[0],
        entry.shape.meshTranslate[1],
        entry.shape.meshTranslate[2],
      );
      inner.scale.setScalar(entry.shape.meshScale);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(entry.shape.mesh.positions, 3));
      geometry.setIndex(new THREE.BufferAttribute(entry.shape.mesh.indices, 1));
      const mesh = new THREE.Mesh(geometry, material(color, true));
      inner.add(mesh);
      outer.add(inner);
      return outer;
    }
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        entry.shape.halfExtents[0] * 2,
        entry.shape.halfExtents[1] * 2,
        entry.shape.halfExtents[2] * 2,
      ),
      material(color, true),
    );
    mesh.position.set(entry.shape.center[0], entry.shape.center[1], entry.shape.center[2]);
    mesh.rotation.y = entry.rotationY;
    return mesh;
  };

  const buildLaser = (laser: AimLaserDebug): THREE.Group => {
    const outer = new THREE.Group();
    const beamGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(laser.origin[0], laser.origin[1], laser.origin[2]),
      new THREE.Vector3(laser.end[0], laser.end[1], laser.end[2]),
    ]);
    outer.add(new THREE.Line(beamGeometry, lineMaterial(AIM_LASER_COLOR, 0.95)));
    const [px, py, pz] = laser.end;
    const color = endpointColor(laser.kind);
    if (laser.kind === "damage") {
      const s = 0.14;
      for (const [a, b] of [
        [[-s, -s, 0], [s, s, 0]],
        [[-s, s, 0], [s, -s, 0]],
      ] as const) {
        const geometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(px + a[0], py + a[1], pz + a[2]),
          new THREE.Vector3(px + b[0], py + b[1], pz + b[2]),
        ]);
        outer.add(new THREE.Line(geometry, lineMaterial(color, 1)));
      }
    } else {
      const radius = laser.kind === "solid" ? 0.1 : 0.06;
      const opacity = laser.kind === "solid" ? 1 : 0.55;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(radius, laser.kind === "solid" ? 12 : 8, laser.kind === "solid" ? 10 : 8),
        material(color, laser.kind === "solid", opacity),
      );
      mesh.position.set(px, py, pz);
      outer.add(mesh);
    }
    return outer;
  };

  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
    },
    update(_state: EngineFrameState) {
      const inputs = getInputs();
      const wantedShapes = new Set(inputs.shapes.map((entry) => entry.key));
      for (const [key, object] of shapes) {
        if (!wantedShapes.has(key)) {
          disposeObject(object);
          shapes.delete(key);
        }
      }
      for (const entry of inputs.shapes) {
        if (!shapes.has(entry.key)) {
          const object = buildShape(entry);
          shapes.set(entry.key, object);
          group.add(object);
        }
      }
      const wantedPaths = new Set(inputs.projectilePoints.map((path) => path.id));
      for (const [id, line] of paths) {
        if (!wantedPaths.has(id)) {
          group.remove(line);
          line.geometry.dispose();
          paths.delete(id);
        }
      }
      for (const path of inputs.projectilePoints) {
        if (paths.has(path.id)) continue;
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(path.points),
          lineMaterial(PROJECTILE_PATH_COLOR, 0.9),
        );
        paths.set(path.id, line);
        group.add(line);
      }
      const wantedMuzzles = new Set(inputs.muzzleOrigins.map((entry) => entry.id));
      for (const [id, mesh] of muzzles) {
        if (!wantedMuzzles.has(id)) {
          group.remove(mesh);
          mesh.geometry.dispose();
          muzzles.delete(id);
        }
      }
      for (const entry of inputs.muzzleOrigins) {
        if (muzzles.has(entry.id)) continue;
        const mark = muzzleMarkerFromOrigin([entry.origin[0], entry.origin[1], entry.origin[2]]);
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(mark.radius, 12, 10),
          material(mark.color, false),
        );
        mesh.position.set(mark.center[0], mark.center[1], mark.center[2]);
        muzzles.set(entry.id, mesh);
        group.add(mesh);
      }
      if (laserGroup !== null) {
        disposeObject(laserGroup);
        laserGroup = null;
      }
      if (inputs.laser !== null) {
        laserGroup = buildLaser(inputs.laser);
        group.add(laserGroup);
      }
    },
    dispose(state: EngineFrameState) {
      for (const object of [...shapes.values(), ...paths.values(), ...muzzles.values()]) {
        disposeObject(object);
      }
      shapes.clear();
      paths.clear();
      muzzles.clear();
      if (laserGroup !== null) disposeObject(laserGroup);
      laserGroup = null;
      for (const mat of materials.values()) mat.dispose();
      materials.clear();
      state.scene.remove(group);
    },
  };
}

/**
 * DOM name labels for the debug shapes — the old per-shape `<Html>` overlays projected each
 * frame with the same `distanceFactor` scaling (14).
 */
function DebugLabelOverlay({ latest }: { latest: { current: DebugDrawInputs } }) {
  const host = useEngineHost();
  const nodesRef = useRef(new Map<string, HTMLDivElement>());
  const worldRef = useRef(new THREE.Vector3());
  const cameraRef = useRef(new THREE.Vector3());
  const entries = latest.current.shapes;
  useFrameTask(() => {
    if (host.r3f) return;
    const { camera, size } = host.frame;
    camera.updateMatrixWorld();
    for (const entry of entries) {
      const node = nodesRef.current.get(entry.key);
      if (node === undefined) continue;
      const [ax, ay, az] = shapeLabelAnchor(entry);
      worldRef.current.set(ax, ay, az);
      const dist = camera.getWorldPosition(cameraRef.current).distanceTo(worldRef.current);
      worldRef.current.project(camera);
      const x = (worldRef.current.x * 0.5 + 0.5) * size.width;
      const y = (-worldRef.current.y * 0.5 + 0.5) * size.height;
      const scale =
        camera instanceof THREE.OrthographicCamera
          ? camera.zoom * 14
          : camera instanceof THREE.PerspectiveCamera
            ? 14 / (2 * Math.tan((camera.fov * Math.PI) / 360) * Math.max(dist, 0.001))
            : 14;
      node.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale})`;
    }
  }, CAMERA_POST_FRAME_PRIORITY + 0.02);
  if (host.r3f) {
    // The SceneObjectGroup sits at the origin, so world anchors are local Html positions.
    return (
      <>
        {entries.map((entry) => {
          const [ax, ay, az] = shapeLabelAnchor(entry);
          return (
            <Html
              key={entry.key}
              position={[ax, ay, az]}
              center
              distanceFactor={14}
              zIndexRange={[25, 0]}
              style={{ pointerEvents: "none" }}
            >
              <span className="rounded bg-black/70 px-1 text-[9px] font-medium text-white/90">
                {entry.label}
              </span>
            </Html>
          );
        })}
      </>
    );
  }
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 25, pointerEvents: "none" }}>
      {entries.map((entry) => (
        <div
          key={entry.key}
          ref={(node) => {
            if (node === null) nodesRef.current.delete(entry.key);
            else nodesRef.current.set(entry.key, node);
          }}
          style={{ position: "absolute", left: 0, top: 0 }}
          className="rounded bg-black/70 px-1 text-[9px] font-medium text-white/90"
        >
          {entry.label}
        </div>
      ))}
    </div>
  );
}

function collectFromContext(ctx: GameContext, layers: CollisionDebugState["layers"]): DebugShapeEntry[] {
  return collectDebugShapes({
    layers,
    entities: ctx.scene.entity.list().map((entity) => ({
      id: entity.id,
      position: entity.position,
      rotationY: entity.rotationY,
      name: entity.name,
    })),
    objects: ctx.scene.object.list().map((object) => ({
      instanceId: object.instanceId,
      catalogId: object.catalogId,
      position: object.position,
      rotationY: object.rotationY,
    })),
    entityCollidersOf: (id) => ctx.scene.entity.collidersOf(id),
    objectCollidersOf: (id) => ctx.scene.object.collidersOf(id),
    objectHalfExtentsOf: (catalogId) => {
      for (const object of ctx.scene.object.list()) {
        if (object.catalogId !== catalogId) continue;
        const half = ctx.scene.object.catalog(object.instanceId)?.halfExtents;
        if (half === undefined) return null;
        return [half[0], half[1], half[2]];
      }
      return null;
    },
  });
}

/**
 * World-space collision debugger. Performs zero scene scans and zero raycasts
 * when every layer is off. Mount only when shell devtools are enabled.
 */
export function CollisionDebugWorld() {
  const ctx = useGameContext();
  const state = useCollisionDebugState();
  const [shapes, setShapes] = useState<DebugShapeEntry[]>([]);
  const [laser, setLaser] = useState<AimLaserDebug | null>(null);
  const frameCounter = useRef(0);

  useEffect(() => {
    if (!projectileListenNeeded(state.layers)) return;
    return ctx.game.events.on("projectile.settled", (event) => {
      collisionDebug.pushProjectileTrace({
        origin: event.origin,
        at: event.at,
        hit: event.hit,
        nowMs: performance.now(),
      });
    });
  }, [ctx, state.layers.projectiles, state.layers.muzzles]);

  useFrameTask(() => {
    if (!anyCollisionLayerOn(state.layers)) {
      if (shapes.length > 0) setShapes([]);
      if (laser !== null) setLaser(null);
      return;
    }
    frameCounter.current += 1;
    const now = performance.now();
    if (projectileListenNeeded(state.layers)) {
      collisionDebug.pruneProjectileTraces(now);
    }

    if (colliderScanNeeded(state.layers) && frameCounter.current % 2 === 0) {
      setShapes(collectFromContext(ctx, state.layers));
    } else if (!colliderScanNeeded(state.layers) && shapes.length > 0) {
      setShapes([]);
    }

    if (aimProbeNeeded(state.layers)) {
      const probe = collisionDebug.getAimProbe();
      if (probe === null) {
        if (laser !== null) setLaser(null);
      } else {
        const next = computeAimLaser({
          layers: state.layers,
          sceneRaycast: {
            raycast: (input) => ctx.scene.raycast(input),
            raycastAll: (input) => [...ctx.scene.raycastAll(input)],
          },
          positionOf: (id) => ctx.scene.entity.get(id)?.position,
          rotationYOf: (id) => ctx.scene.entity.get(id)?.rotationY,
          collidersOf: (id) => ctx.scene.entity.collidersOf(id),
          from: probe.from,
          aim: probe.aim,
          originPolicy: probe.originPolicy,
          maxDistance: probe.maxDistance ?? 100,
        });
        setLaser(next);
      }
    } else if (laser !== null) {
      setLaser(null);
    }
  });

  const projectilePoints = useMemo(() => {
    if (!state.layers.projectiles) return [];
    return state.projectileTraces.map((trace) => ({
      id: trace.id,
      points: [
        new THREE.Vector3(trace.origin[0], trace.origin[1], trace.origin[2]),
        new THREE.Vector3(trace.at[0], trace.at[1], trace.at[2]),
      ] as [THREE.Vector3, THREE.Vector3],
    }));
  }, [state.layers.projectiles, state.projectileTraces]);

  const muzzleOrigins = useMemo(() => {
    if (!state.layers.muzzles) return [];
    const origins = state.projectileTraces.map((trace) => ({
      id: trace.id,
      origin: trace.origin,
    }));
    if (laser !== null && state.layers.aimLaser) {
      origins.push({ id: -1, origin: laser.origin });
    }
    return origins;
  }, [state.layers.muzzles, state.layers.aimLaser, state.projectileTraces, laser]);

  const latest = useRef<DebugDrawInputs>({
    shapes,
    projectilePoints,
    muzzleOrigins,
    laser,
  });
  latest.current = { shapes, projectilePoints, muzzleOrigins, laser };

  if (!anyCollisionLayerOn(state.layers)) return null;

  return (
    <SceneObjectGroup userData={POSTFX_OVERLAY_USERDATA}>
      <EngineDrawMount create={() => collisionDebugDraw(() => latest.current)} deps={[latest]} />
      <DebugLabelOverlay latest={latest} />
    </SceneObjectGroup>
  );
}
