import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { generateBodyPlan } from "../creatures/bodyPlan";
import { makeNamer } from "../creatures/names";
import { ALIEN_KIND, JOBS } from "../entities/aliens/catalog";
import { HABITAT_PAD_ID } from "../objects/catalog";
import { emptyNeeds } from "../needs/needs";
import { householdStore } from "../session/store";
import { createHousehold, type HouseholdState, type MemberState } from "../session/types";

const STARTER_FURNITURE: Array<{ id: string; x: number; z: number }> = [
  { id: "nutrient_font", x: -6.5, z: -6 },
  { id: "sleep_pod", x: 7, z: -5.5 },
  { id: "chat_ring", x: 0, z: 6.5 },
  { id: "holo_arcade", x: -8, z: 3.5 },
  { id: "work_console", x: 8, z: 4 },
  { id: "bloom_planter", x: 0, z: -2 },
];

const DECOR_PLACEMENTS: Array<{ id: string; x: number; z: number }> = [
  { id: "decor_spire", x: -21, z: -17 },
  { id: "decor_spire", x: 22, z: 16 },
  { id: "decor_spire", x: 17, z: -20 },
  { id: "decor_boulder", x: -17, z: 15 },
  { id: "decor_boulder", x: 15, z: -14 },
  { id: "decor_frond", x: -13, z: -6 },
  { id: "decor_frond", x: 13, z: -1 },
  { id: "decor_frond", x: -12, z: 9 },
  { id: "decor_frond", x: 11, z: 11 },
];

const MEMBER_COUNT = 4;
const SPAWN_RING = 3.5;

export function setupWorld(ctx: GameContext): void {
  const current = householdStore.read(ctx);
  if (current.order.length > 0) return;
  const state = createHousehold(current.seed);

  ctx.scene.object.place(HABITAT_PAD_ID, 0, ctx.world.groundHeightAt(0, 0) - 0.04, 0, {
    instanceId: "habitat:pad",
    onExisting: "keep",
  });

  for (const decor of DECOR_PLACEMENTS) {
    const y = ctx.world.groundHeightAt(decor.x, decor.z);
    ctx.scene.object.place(decor.id, decor.x, y, decor.z, {
      instanceId: `${decor.id}:${decor.x}:${decor.z}`,
      onExisting: "keep",
    });
  }

  for (const item of STARTER_FURNITURE) {
    const y = ctx.world.groundHeightAt(item.x, item.z);
    ctx.scene.object.place(item.id, item.x, y, item.z, {
      instanceId: `starter:${item.id}`,
      onExisting: "keep",
    });
  }

  const namer = makeNamer(state.seed);
  for (let i = 0; i < MEMBER_COUNT; i++) {
    const id = `alien:${i}`;
    const bodyPlan = generateBodyPlan(`${state.seed}:${i}`);
    const angle = (i / MEMBER_COUNT) * Math.PI * 2;
    const x = Math.cos(angle) * SPAWN_RING;
    const z = Math.sin(angle) * SPAWN_RING;
    const y = ctx.world.groundHeightAt(x, z);
    ctx.scene.entity.spawn(ALIEN_KIND, {
      id,
      position: [x, y, z],
      role: "npc",
      rotationY: angle,
      meta: { bodyPlan },
      onExisting: "replace",
    });
    const member: MemberState = {
      id,
      name: namer(),
      bodyPlan,
      job: JOBS[i % JOBS.length],
      needs: emptyNeeds(),
      action: { kind: "idle" },
      assignedByPlayer: false,
      actionUntil: 0,
    };
    state.members[id] = member;
    state.order.push(id);
  }

  seedRelationships(state);
  householdStore.write(ctx, state);
}

function seedRelationships(state: HouseholdState): void {
  for (let i = 0; i < state.order.length; i++) {
    for (let j = i + 1; j < state.order.length; j++) {
      const key = `${state.order[i]}|${state.order[j]}`;
      state.relationships[key] = 8;
    }
  }
}
