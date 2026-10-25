import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { generateBodyPlan } from "../creatures/bodyPlan";
import { makeNamer } from "../creatures/names";
import { ALIEN_KIND } from "../entities/aliens/catalog";
import { type CareerId } from "../careers";
import { householdStore } from "../session/store";
import { createHousehold, pairKey, type HouseholdState, type Lifestyle, type MemberState } from "../session/types";
import { emptyNeeds } from "../needs/needs";
import { householdBook, resetAgents, resetBook, syncBook } from "../agents";
import { rollTraits } from "../traits";
import { createHouseholdEconomy } from "./economy";
import { SCENE_PLACEMENTS } from "../../editorLayers";

const MEMBER_COUNT = 4;
const SPAWN_RING = 3.5;

/** Starting posts alternate within each rhythm, so the household opens with both ladders in use. */
const STARTING_POSTS: Record<Lifestyle, readonly CareerId[]> = {
  yield: ["Signal-keeper", "Tinkerer"],
  bloom: ["Botanist", "Forager"],
};

export function setupWorld(ctx: GameContext): void {
  const current = householdStore.read(ctx);
  if (current.order.length > 0) return;
  resetAgents();
  resetBook();
  const state = createHousehold(current.seed);
  state.day = ctx.time.calendar().day;
  state.economy = createHouseholdEconomy(ctx.time.now());

  for (const placement of SCENE_PLACEMENTS) {
    const y = ctx.world.groundHeightAt(placement.x, placement.z);
    ctx.scene.object.place(placement.object, placement.x, y, placement.z, {
      instanceId: placement.instanceId,
      ...(placement.rotation === 0 ? {} : { rotation: placement.rotation }),
      onExisting: "keep",
    });
  }

  const namer = makeNamer(state.seed);
  for (let i = 0; i < MEMBER_COUNT; i++) {
    const id = `alien:${i}`;
    const lifestyle: Lifestyle = i % 2 === 0 ? "yield" : "bloom";
    const posts = STARTING_POSTS[lifestyle];
    const job = posts[Math.floor(i / 2) % posts.length]!;
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
      job,
      needs: emptyNeeds(),
      action: { kind: "idle" },
      assignedByPlayer: false,
      actionUntil: 0,
      lifestyle,
      stress: 0,
      recovering: false,
      workToday: 0,
      harvestToday: 0,
      shiftProgress: 0,
      shiftDay: -1,
      completedShifts: 0,
      missedShifts: 0,
      concern: null,
      traits: rollTraits(`${state.seed}:${i}`),
    };
    state.members[id] = member;
    state.order.push(id);
  }

  seedRelationships(state);
  householdStore.write(ctx, state);
}

function seedRelationships(state: HouseholdState): void {
  const book = householdBook(state);
  for (let i = 0; i < state.order.length; i++) {
    for (let j = i + 1; j < state.order.length; j++) {
      const a = state.order[i]!;
      const b = state.order[j]!;
      state.relationships[pairKey(a, b)] = 8;
      state.familiarity[pairKey(a, b)] = 0.3;
      book.socialise(a, b, { opinion: 8, familiarity: 0.3 });
    }
  }
}

