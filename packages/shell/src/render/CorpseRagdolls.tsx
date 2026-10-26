import { deathRemovesEntity } from "@jgengine/core/combat/death";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

import { devtools } from "@jgengine/core/devtools/devtools";
import { mapRigToStandard, RIG_SCHEMES, type SkeletonMap } from "@jgengine/core/anim/skeletonStandard";
import { PhysicsWorld } from "@jgengine/core/physics/physicsWorld";
import { useGameContext } from "@jgengine/react/provider";

import { useTerrainQuality } from "@jgengine/core/terrain/terrainQuality.draw";
import { useRagdoll } from "./useRagdoll";

const bodies = new Map<string, THREE.Object3D>();

/**
 * Register the drawn body of `instanceId`, so when it dies its last pose can fall as a ragdoll after
 * the entity itself is gone. Returns the cleanup. @internal
 */
export function registerEntityBody(instanceId: string, scene: THREE.Object3D): () => void {
  bodies.set(instanceId, scene);
  return () => {
    if (bodies.get(instanceId) === scene) bodies.delete(instanceId);
  };
}

/** Fewest mapped bones a rig needs to fall as a body rather than a few loose boxes. */
const MIN_RAGDOLL_SLOTS = 6;

/** The standard bone map that fits this rig best across the known naming schemes, or null. Exported for tests. @internal */
export function bestRigMap(scene: THREE.Object3D): SkeletonMap | null {
  const names: string[] = [];
  scene.traverse((object) => {
    if ((object as THREE.Bone).isBone === true) names.push(object.name);
  });
  if (names.length === 0) return null;
  let best: SkeletonMap | null = null;
  let bestCount = 0;
  for (const scheme of Object.values(RIG_SCHEMES)) {
    const map = mapRigToStandard(names, scheme);
    const count = Object.keys(map.slots).length;
    if (count > bestCount) {
      best = map;
      bestCount = count;
    }
  }
  return bestCount >= MIN_RAGDOLL_SLOTS ? best : null;
}

interface Corpse {
  key: number;
  body: THREE.Object3D;
  map: SkeletonMap;
  world: PhysicsWorld;
  height: number;
  born: number;
}

const stats = { deaths: 0, corpses: 0, skippedNoBody: 0, skippedNoRig: 0, skippedKept: 0 };

function CorpseBody({ corpse, lifeS, sinkS }: { corpse: Corpse; lifeS: number; sinkS: number }) {
  useRagdoll(corpse.body, { map: corpse.map, world: corpse.world, active: true, height: corpse.height });
  const restY = useRef<number | null>(null);
  useFrame(() => {
    const age = performance.now() / 1000 - corpse.born;
    if (age < lifeS) return;
    // Sink the settled body into the ground instead of popping it out.
    restY.current ??= corpse.body.position.y;
    corpse.body.position.y = restY.current - ((age - lifeS) / sinkS) * corpse.height * 0.6;
  });
  return <primitive object={corpse.body} />;
}

/**
 * Bodies fall when they die: a killed rigged character's last drawn pose is copied and dropped as a
 * physics ragdoll in its own small world, lies there `lifeS` seconds, then sinks away. A game that
 * keeps its dead entity in the scene (its own death clip) is left alone. At most `max` bodies at once;
 * off on the low graphics tier. @internal
 */
export function CorpseRagdolls({ max = 6, lifeS = 5, sinkS = 1.5 }: { max?: number; lifeS?: number; sinkS?: number }) {
  const ctx = useGameContext();
  const quality = useTerrainQuality();
  const [corpses, setCorpses] = useState<Corpse[]>([]);
  const key = useRef(0);
  const timers = useMemo(() => new Set<ReturnType<typeof setTimeout>>(), []);

  useEffect(() => {
    if (quality === "low") return;
    const offProbe = devtools.probes.registerSystem("render/ragdolls", {
      counters: () => ({ ...stats, bodies: bodies.size }),
      state: () => `${stats.corpses} bodies dropped · ${stats.skippedNoRig} without a rig · ${stats.skippedKept} kept by the game`,
    });
    const off = ctx.game.events.on("entity.died", (event) => {
      if (!deathRemovesEntity(event)) return;
      stats.deaths += 1;
      const source = bodies.get(event.instanceId);
      if (source === undefined) {
        stats.skippedNoBody += 1;
        return;
      }
      const map = bestRigMap(source);
      if (map === null) {
        stats.skippedNoRig += 1;
        return;
      }
      source.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(source);
      const height = Math.max(0.4, box.max.y - box.min.y);
      const body = cloneSkinned(source);
      source.matrixWorld.decompose(body.position, body.quaternion, body.scale);
      body.traverse((object) => {
        object.frustumCulled = false;
      });
      const center = box.getCenter(new THREE.Vector3());
      const floor = box.min.y;
      const world = new PhysicsWorld({
        capacity: 48,
        bounds: { min: [center.x - 12, floor, center.z - 12], max: [center.x + 12, floor + Math.max(6, height * 3), center.z + 12] },
      });
      const corpse: Corpse = { key: key.current++, body, map, world, height, born: performance.now() / 1000 };
      // Wait a beat: a game that keeps its dead entity (and plays its own death clip) gets no copy.
      const check = setTimeout(() => {
        timers.delete(check);
        if (ctx.scene.entity.get(event.instanceId) !== null) {
          stats.skippedKept += 1;
          return;
        }
        stats.corpses += 1;
        setCorpses((list) => [...list, corpse].slice(-max));
        const done = setTimeout(() => {
          timers.delete(done);
          setCorpses((list) => list.filter((item) => item.key !== corpse.key));
        }, (lifeS + sinkS) * 1000);
        timers.add(done);
      }, 0);
      timers.add(check);
    });
    return () => {
      off();
      offProbe();
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      setCorpses([]);
    };
  }, [ctx, quality, max, lifeS, sinkS, timers]);

  return (
    <>
      {corpses.map((corpse) => (
        <CorpseBody key={corpse.key} corpse={corpse} lifeS={lifeS} sinkS={sinkS} />
      ))}
    </>
  );
}
