/** @jsxImportSource @jgengine/core/ui/jsx */
import { Group, Vector3 } from "three";
import type { ReactNode } from "@jgengine/core/ui/jsx";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";
import { hashString } from "@jgengine/core/random/rng";

import { enemyById, type EnemyDef } from "../entities/enemies/catalog";
import { APPLIANCE_BY_ENEMY, APPLIANCE_COLOR, buildAppliance, type ApplianceLook } from "./applianceModel";

/**
 * How big each machine stands at enemy scale 1. Roombas are oversized on purpose: a killer robot
 * vacuum has to read at thirty metres across a lawn.
 */
const LOOK_SCALE: Record<ApplianceLook, number> = {
  roomba: 1.5,
  sprinkler: 1.15,
  fridge: 1,
  drone: 1.1,
  mower: 1.15,
  garage: 1,
  speaker: 1.1,
  ridingMower: 0.85,
  compactor: 0.9,
  hoa: 0.9,
  router: 0.8,
  blowerKing: 0.9,
};

function lookOf(def: EnemyDef): ApplianceLook | undefined {
  return APPLIANCE_BY_ENEMY[def.look ?? def.id];
}

/** One appliance's mesh and motion as an engine draw; the shell positions and turns its group. */
function applianceDraw(entity: SceneEntity, def: EnemyDef, look: ApplianceLook): EngineDraw {
  const holder = new Group();
  const body = def.plate ?? APPLIANCE_COLOR[def.look ?? def.id];
  const build = buildAppliance(look, { ...(body === undefined ? {} : { body }), elite: def.elite });
  holder.add(build.root);
  holder.scale.setScalar(def.scale * LOOK_SCALE[look]);
  const phase = (hashString(entity.id) % 628) / 100;
  let lastX = entity.position[0];
  let lastZ = entity.position[2];
  let moving = false;
  const scratch = new Vector3();
  return {
    mount(state: EngineFrameState) {
      state.scene.add(holder);
    },
    frame(state: EngineFrameState) {
      holder.getWorldPosition(scratch);
      moving = Math.hypot(scratch.x - lastX, scratch.z - lastZ) > 0.002;
      lastX = scratch.x;
      lastZ = scratch.z;
      build.animate(state.clock.elapsedTime + phase, moving);
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(holder);
      holder.clear();
      build.dispose();
    },
  };
}

function ApplianceMesh({ entity, def, look }: { entity: SceneEntity; def: EnemyDef; look: ApplianceLook }) {
  return <EngineDrawMount create={() => applianceDraw(entity, def, look)} deps={[entity.id, def.id]} />;
}

/** The shell's per-entity override: every hostile is a procedural appliance; everyone else falls back to models. */
export function renderEntity(entity: SceneEntity): ReactNode {
  const def = enemyById(entity.name);
  if (def === undefined) return null;
  const look = lookOf(def);
  if (look === undefined) return null;
  return <ApplianceMesh entity={entity} def={def} look={look} />;
}
