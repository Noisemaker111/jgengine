import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { ALIEN_KIND } from "../entities/aliens/catalog";
import { householdStore } from "../session/store";
import { createHousehold, pairKey, type HouseholdState } from "../session/types";
import { householdBook, resetAgents, resetBook } from "../agents";
import { createHouseholdEconomy } from "./economy";
import { SCENE_PLACEMENTS } from "../../editorLayers";
import { createBoarding, createTenantMember } from "../boarding/boarding";
import { STARTING_TENANTS, SPECIES, type SpeciesId } from "../boarding/species";
import { AIRLOCK, berthPose } from "../boarding/layout";
import type { AlienBodyPlan } from "../creatures/bodyPlan";

/**
 * Opening night at NO VACANCY: four modules bolted on, Krrt and Glorp sharing a wall they should
 * not share, Sister Fog drifting in the third room, one room empty and Pip-9 still in the broom
 * cupboard hoping to be asked.
 */
const OPENING_ROOMS: Partial<Record<SpeciesId, number>> = { krrt: 0, glorp: 1, fog: 2 };

/** Spawn a tenant's body: in their room, or at the airlock when they have none. */
export function spawnTenantBody(ctx: GameContext, id: string, bodyPlan: AlienBodyPlan, slot: number | null): void {
  const at = slot === null ? { x: AIRLOCK.x + 1.5, z: AIRLOCK.z + 1.6 } : berthPose(slot);
  const y = ctx.world.groundHeightAt(at.x, at.z);
  ctx.scene.entity.spawn(ALIEN_KIND, {
    id,
    position: [at.x, y, at.z],
    role: "npc",
    rotationY: 0,
    meta: { bodyPlan },
    onExisting: "replace",
  });
}

export function setupWorld(ctx: GameContext): void {
  const current = householdStore.read(ctx);
  if (current.order.length > 0) return;
  resetAgents();
  resetBook();
  const state = createHousehold(current.seed);
  state.day = ctx.time.calendar().day;
  state.economy = createHouseholdEconomy(ctx.time.now());
  state.boarding = createBoarding(ctx.time.now());

  for (const placement of SCENE_PLACEMENTS) {
    const y = ctx.world.groundHeightAt(placement.x, placement.z);
    ctx.scene.object.place(placement.object, placement.x, y, placement.z, {
      instanceId: placement.instanceId,
      ...(placement.rotation === 0 ? {} : { rotation: placement.rotation }),
      onExisting: "keep",
    });
  }

  STARTING_TENANTS.forEach((species, i) => {
    const id = `alien:${i}`;
    const member = createTenantMember(id, species);
    const slot = OPENING_ROOMS[species] ?? null;
    spawnTenantBody(ctx, id, member.bodyPlan, slot);
    state.members[id] = member;
    state.order.push(id);
    if (slot !== null) state.boarding!.rooms[slot]!.tenantId = id;
  });
  // Glorp brought its own swamp.
  state.boarding.rooms[1]!.settings = { ...state.boarding.rooms[1]!.settings, atmosphere: "methane", climate: "hot" };
  state.boarding.rooms[2]!.settings = { ...state.boarding.rooms[2]!.settings, climate: "cold", light: "dark" };

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

export { SPECIES };
