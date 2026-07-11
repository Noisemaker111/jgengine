import { Html, Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import * as THREE from "three";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { useGameContext } from "@jgengine/react/provider";
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

function useCollisionDebugState(): CollisionDebugState {
  return useSyncExternalStore(
    collisionDebug.subscribe,
    () => collisionDebug.getState(),
    () => collisionDebug.getState(),
  );
}

function WireSphere({
  center,
  radius,
  color,
  label,
}: {
  center: readonly [number, number, number];
  radius: number;
  color: string;
  label: string;
}) {
  return (
    <group position={[center[0], center[1], center[2]]}>
      <mesh>
        <sphereGeometry args={[radius, 16, 12]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.85} depthTest={false} />
      </mesh>
      <Html center distanceFactor={14} zIndexRange={[25, 0]} style={{ pointerEvents: "none" }}>
        <span className="rounded bg-black/70 px-1 text-[9px] font-medium text-white/90">{label}</span>
      </Html>
    </group>
  );
}

function WireAabb({
  center,
  halfExtents,
  rotationY,
  color,
  label,
}: {
  center: readonly [number, number, number];
  halfExtents: readonly [number, number, number];
  rotationY: number;
  color: string;
  label: string;
}) {
  return (
    <group position={[center[0], center[1], center[2]]} rotation={[0, rotationY, 0]}>
      <mesh>
        <boxGeometry args={[halfExtents[0] * 2, halfExtents[1] * 2, halfExtents[2] * 2]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.85} depthTest={false} />
      </mesh>
      <Html
        position={[0, halfExtents[1] + 0.15, 0]}
        center
        distanceFactor={14}
        zIndexRange={[25, 0]}
        style={{ pointerEvents: "none" }}
      >
        <span className="rounded bg-black/70 px-1 text-[9px] font-medium text-white/90">{label}</span>
      </Html>
    </group>
  );
}

function ColliderShapeMesh({ entry }: { entry: DebugShapeEntry }) {
  const color = entry.style === "hitbox" ? HITBOX_WIRE_COLOR : BODY_WIRE_COLOR;
  if (entry.shape.kind === "sphere") {
    return (
      <WireSphere
        center={entry.shape.center}
        radius={entry.shape.radius}
        color={color}
        label={entry.label}
      />
    );
  }
  return (
    <WireAabb
      center={entry.shape.center}
      halfExtents={entry.shape.halfExtents}
      rotationY={entry.rotationY}
      color={color}
      label={entry.label}
    />
  );
}

function endpointColor(kind: AimEndpointKind): string {
  if (kind === "damage") return AIM_DAMAGE_COLOR;
  if (kind === "solid") return AIM_SOLID_COLOR;
  return AIM_MISS_COLOR;
}

function AimEndpointMark({
  point,
  kind,
}: {
  point: readonly [number, number, number];
  kind: AimEndpointKind;
}) {
  const color = endpointColor(kind);
  if (kind === "damage") {
    const s = 0.14;
    return (
      <group position={[point[0], point[1], point[2]]}>
        <Line
          points={[
            new THREE.Vector3(-s, -s, 0),
            new THREE.Vector3(s, s, 0),
          ]}
          color={color}
          lineWidth={2}
          depthTest={false}
        />
        <Line
          points={[
            new THREE.Vector3(-s, s, 0),
            new THREE.Vector3(s, -s, 0),
          ]}
          color={color}
          lineWidth={2}
          depthTest={false}
        />
      </group>
    );
  }
  if (kind === "solid") {
    return (
      <mesh position={[point[0], point[1], point[2]]}>
        <sphereGeometry args={[0.1, 12, 10]} />
        <meshBasicMaterial color={color} wireframe depthTest={false} />
      </mesh>
    );
  }
  return (
    <mesh position={[point[0], point[1], point[2]]}>
      <sphereGeometry args={[0.06, 8, 8]} />
      <meshBasicMaterial color={color} transparent opacity={0.55} depthTest={false} />
    </mesh>
  );
}

function MuzzleMark({ origin }: { origin: readonly [number, number, number] }) {
  const mark = muzzleMarkerFromOrigin([origin[0], origin[1], origin[2]]);
  return (
    <mesh position={[mark.center[0], mark.center[1], mark.center[2]]}>
      <sphereGeometry args={[mark.radius, 12, 10]} />
      <meshBasicMaterial color={mark.color} depthTest={false} />
    </mesh>
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

  useFrame(() => {
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

  if (!anyCollisionLayerOn(state.layers)) return null;

  return (
    <group>
      {shapes.map((entry) => (
        <ColliderShapeMesh key={entry.key} entry={entry} />
      ))}
      {projectilePoints.map((path) => (
        <Line
          key={path.id}
          points={path.points}
          color={PROJECTILE_PATH_COLOR}
          lineWidth={2}
          transparent
          opacity={0.9}
          depthTest={false}
        />
      ))}
      {muzzleOrigins.map((entry) => (
        <MuzzleMark key={`muzzle-${entry.id}`} origin={entry.origin} />
      ))}
      {laser !== null ? (
        <>
          <Line
            points={[
              new THREE.Vector3(laser.origin[0], laser.origin[1], laser.origin[2]),
              new THREE.Vector3(laser.end[0], laser.end[1], laser.end[2]),
            ]}
            color={AIM_LASER_COLOR}
            lineWidth={1.5}
            transparent
            opacity={0.95}
            depthTest={false}
          />
          <AimEndpointMark point={laser.end} kind={laser.kind} />
        </>
      ) : null}
    </group>
  );
}
