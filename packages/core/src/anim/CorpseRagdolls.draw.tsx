import { useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

import { deathRemovesEntity } from "@jgengine/core/combat/death";
import type { EntityDiedEvent } from "@jgengine/core/game/events";
import { devtools } from "@jgengine/core/devtools/devtools";
import { mapRigToStandard, RIG_SCHEMES, type SkeletonMap } from "@jgengine/core/anim/skeletonStandard";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { joinFrameTask } from "@jgengine/core/frame/frameBoard.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";
import { PhysicsWorld } from "@jgengine/core/physics/physicsWorld";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { GraphicsQuality } from "@jgengine/core/settings/settingsModel";
import { useGameContext } from "@jgengine/react/provider";
import { useTerrainQuality } from "@jgengine/core/terrain/terrainQuality.draw";

import { ragdollDraw, type RagdollOptions } from "./useRagdoll.draw";

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
  instanceId: string;
  body: THREE.Object3D;
  map: SkeletonMap;
  world: PhysicsWorld;
  height: number;
  born: number;
  restY: number | null;
  options: RagdollOptions;
  ragdoll: EngineDraw | null;
  ragdollLeave: (() => void) | null;
  live: boolean;
}

const stats = { deaths: 0, corpses: 0, skippedNoBody: 0, skippedNoRig: 0, skippedKept: 0 };

export interface CorpseRagdollsDrawProps {
  max: number;
  lifeS: number;
  sinkS: number;
  quality: GraphicsQuality;
}

/**
 * Bodies fall when they die: a killed rigged character's last drawn pose is copied and dropped as a
 * physics ragdoll in its own small world, lies there `lifeS` seconds, then sinks away. A game that
 * keeps its dead entity in the scene (its own death clip) is left alone. At most `max` bodies at once;
 * off on the low graphics tier. @internal
 */
export function corpseRagdollsDraw(ctx: GameContext, getProps: () => CorpseRagdollsDrawProps): EngineDraw {
  const corpses: Corpse[] = [];
  let key = 0;
  let unsubscribe: (() => void) | null = null;
  let offProbe: (() => void) | null = null;
  let mountState: EngineFrameState | null = null;

  const dropCorpse = (corpse: Corpse) => {
    corpse.ragdollLeave?.();
    const state = mountState;
    if (state !== null) corpse.ragdoll?.dispose?.(state);
    corpse.body.parent?.remove(corpse.body);
  };

  const removeCorpse = (corpse: Corpse) => {
    const index = corpses.indexOf(corpse);
    if (index >= 0) corpses.splice(index, 1);
    dropCorpse(corpse);
  };

  const mountRagdoll = (corpse: Corpse) => {
    if (mountState === null) return;
    const draw = ragdollDraw(corpse.body, () => corpse.options);
    draw.mount?.(mountState);
    const leave = draw.frame === undefined ? () => {} : joinFrameTask(draw.priority ?? 0, (state, delta) => draw.frame?.(state, delta));
    corpse.ragdoll = draw;
    corpse.ragdollLeave = leave;
  };

  const onDied = (event: EntityDiedEvent) => {
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
    corpses.push({
      key: key++,
      instanceId: event.instanceId,
      body,
      map,
      world,
      height,
      born: performance.now() / 1000,
      restY: null,
      options: { map, world, active: true, height },
      ragdoll: null,
      ragdollLeave: null,
      live: false,
    });
  };

  const running = () => unsubscribe !== null;

  const syncSubscription = () => {
    const enabled = getProps().quality !== "low";
    if (enabled && !running()) {
      offProbe = devtools.probes.registerSystem("render/ragdolls", {
        counters: () => ({ ...stats, bodies: bodies.size }),
        state: () => `${stats.corpses} bodies dropped · ${stats.skippedNoRig} without a rig · ${stats.skippedKept} kept by the game`,
      });
      unsubscribe = ctx.game.events.on("entity.died", onDied);
    } else if (!enabled && running()) {
      unsubscribe?.();
      unsubscribe = null;
      offProbe?.();
      offProbe = null;
      while (corpses.length > 0) {
        const corpse = corpses.pop();
        if (corpse !== undefined) dropCorpse(corpse);
      }
    }
  };

  return {
    mount(state) {
      mountState = state;
      syncSubscription();
    },
    update() {
      syncSubscription();
    },
    frame() {
      syncSubscription();
      if (!running() || mountState === null) return;
      const props = getProps();
      const now = performance.now() / 1000;
      const scene = mountState.scene;
      for (let index = corpses.length - 1; index >= 0; index -= 1) {
        const corpse = corpses[index]!;
        if (!corpse.live) {
          // The original checked one tick after the death so a game that revives or keeps its
          // dead entity never pays for a copy; the next rendered frame is that tick.
          if (ctx.scene.entity.get(corpse.instanceId) !== null) {
            stats.skippedKept += 1;
            removeCorpse(corpse);
            continue;
          }
          stats.corpses += 1;
          corpse.live = true;
          scene.add(corpse.body);
          mountRagdoll(corpse);
        }
        const age = now - corpse.born;
        if (age < props.lifeS) continue;
        corpse.restY ??= corpse.body.position.y;
        corpse.body.position.y = corpse.restY - ((age - props.lifeS) / props.sinkS) * corpse.height * 0.6;
        if (age >= props.lifeS + props.sinkS) removeCorpse(corpse);
      }
      let live = 0;
      for (const corpse of corpses) if (corpse.live) live += 1;
      for (let index = 0; index < corpses.length && live > props.max; index += 1) {
        const corpse = corpses[index]!;
        if (!corpse.live) continue;
        live -= 1;
        removeCorpse(corpse);
        index -= 1;
      }
    },
    dispose() {
      syncSubscription();
      if (running()) {
        unsubscribe?.();
        unsubscribe = null;
        offProbe?.();
        offProbe = null;
      }
      while (corpses.length > 0) {
        const corpse = corpses.pop();
        if (corpse !== undefined) dropCorpse(corpse);
      }
      mountState = null;
    },
  };
}

/**
 * @capability animation turn a killed rigged character into a physics ragdoll on death
 */
export function CorpseRagdolls({ max = 6, lifeS = 5, sinkS = 1.5 }: { max?: number; lifeS?: number; sinkS?: number }) {
  const ctx = useGameContext();
  const quality = useTerrainQuality();
  const latest = useRef<CorpseRagdollsDrawProps>({ max, lifeS, sinkS, quality });
  latest.current.max = max;
  latest.current.lifeS = lifeS;
  latest.current.sinkS = sinkS;
  latest.current.quality = quality;
  return <EngineDrawMount create={() => corpseRagdollsDraw(ctx, () => latest.current)} deps={[ctx]} />;
}
