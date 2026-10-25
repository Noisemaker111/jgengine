import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { createStaffAgent, forgetAgent, staffAgentOf, staffBeat, staffId } from "./agents";
import type { StaffRole } from "./objects/catalog";
import { park, parkObject, parkObjects, patrolRadius, rideObjects, type ParkObject } from "./park";
import { rideView } from "./rides";
import { groundAt } from "./build/terrain";
import { session, type StaffState } from "./session";

/**
 * Hired staff. Each hire is a post on the lot: the middle of that person's patrol area, whose
 * radius (`<post>.patrol`) the player widens or narrows. The body walks its beat inside the area and
 * does its job there:
 * - a handyman sweeps (the world's `sweep` flow, plus a little more at each beat point);
 * - a mechanic inspects every ride in the area whose wear is building and services it (the world's
 *   `service_*` action, paid from the till), and any mechanic hired makes repairs quicker;
 * - an entertainer cheers up guests in the area and makes their wait in line feel shorter;
 * - a security guard stops unhappy guests in the area from kicking over bins (extra litter).
 * What each role does to guests is read by `sim/guests` through {@link staffCover}.
 */

const STAFF_WALK_SPEED = 3.4;
const CLEAN_PER_POST = 0.6;
/** A mechanic services a ride in its area once this many cycles of wear have built up. */
const INSPECT_WEAR = 6;
/** Seconds between a mechanic's inspections. */
const INSPECT_SECONDS = 12;

/** The body each role walks in. */
export const STAFF_BODY: Record<StaffRole, string> = {
  handyman: "crew_handyman",
  mechanic: "crew_mechanic",
  entertainer: "crew_entertainer",
  security: "crew_security",
};

const posts = (ctx: GameContext): ParkObject[] => parkObjects(ctx).filter((obj) => obj.def.staff !== undefined);

/** Every post gets one person; a removed post sends its person home. */
export function syncStaff(ctx: GameContext): void {
  const all = posts(ctx);
  const live = new Set(all.map((post) => post.id));
  for (const post of all) {
    const id = staffId(post.id);
    if (session.staff.has(id)) continue;
    const agent = createStaffAgent(post, ctx.rng);
    const state: StaffState = { id, postId: post.id, agent: agent.snapshot() };
    session.staff.set(id, state);
    ctx.scene.entity.spawn(STAFF_BODY[post.def.staff!.role], { id, position: [post.x, 0, post.z], role: "npc" });
  }
  for (const [id, state] of session.staff) {
    if (live.has(state.postId)) continue;
    if (ctx.scene.entity.selection.has(id)) ctx.scene.entity.selection.remove(id);
    ctx.scene.entity.despawn(id);
    forgetAgent(id);
    session.staff.delete(id);
  }
}

function beatPoint(post: ParkObject, radius: number, place: string | null): [number, number, number] | null {
  if (place === null) return null;
  const point = staffBeat(post, radius).find((candidate) => candidate.place === place);
  return point === undefined ? null : [point.x, 0, point.z];
}

const lastInspection = new Map<string, number>();

/** A mechanic at work: the most worn ride in its area gets serviced, if the till can pay. */
function inspect(ctx: GameContext, state: StaffState, post: ParkObject, radius: number): void {
  const now = ctx.time.now();
  if (now - (lastInspection.get(state.id) ?? -Infinity) < INSPECT_SECONDS) return;
  lastInspection.set(state.id, now);
  const w = park.of(ctx);
  let worst: { obj: ParkObject; wear: number } | null = null;
  for (const ride of rideObjects(ctx)) {
    if (Math.hypot(ride.x - post.x, ride.z - post.z) > radius + ride.def.footprint / 2) continue;
    const view = rideView(ride.id);
    if (view === null || view.phase === "broken" || view.wear < INSPECT_WEAR) continue;
    if (worst === null || view.wear > worst.wear) worst = { obj: ride, wear: view.wear };
  }
  if (worst === null) return;
  const action = `service_${worst.obj.kind}`;
  if (w.canAct(action, worst.obj.id) === null) w.act(action, worst.obj.id);
}

/**
 * Staff on the clock: the agent's own work beat says which point of its patrol it should be at,
 * the body walks there, and the role does its job.
 */
export function tickStaff(ctx: GameContext, dt: number): void {
  syncStaff(ctx);
  const now = ctx.time.now();
  const w = park.of(ctx);
  for (const state of session.staff.values()) {
    const post = parkObject(ctx, state.postId);
    if (post === undefined) continue;
    const radius = patrolRadius(w, post.id);
    const agent = staffAgentOf(state, post, ctx.rng);
    const frame = agent.update({
      dt,
      now,
      targets: [
        { option: "patrol", target: state.postId },
        { option: "rest", target: "bunks" },
      ],
    });

    const working = frame.phase?.activity === "work" && frame.post !== null;
    const goal = working ? beatPoint(post, radius, frame.post) : ([0, 0, 56] as [number, number, number]);
    if (goal === null) continue;
    const next = ctx.scene.entity.moveToward(state.id, goal, { speed: STAFF_WALK_SPEED, dt, stopDistance: 0.4 });
    if (next !== null) {
      const feet: [number, number, number] = [next[0], groundAt(park.of(ctx), next[0], next[2]), next[2]];
      ctx.scene.entity.setPose(state.id, { position: feet });
    }
    if (!working) continue;
    const role = post.def.staff!.role;
    const at = ctx.scene.entity.get(state.id)?.position ?? goal;
    if (role === "handyman" && Math.hypot(at[0] - goal[0], at[2] - goal[2]) <= 0.8 && w.num("park.litter") > 0) {
      w.change({ "park.litter": -CLEAN_PER_POST });
    }
    if (role === "mechanic") inspect(ctx, state, post, radius);
  }
}

/** Which roles are on duty within reach of a point: what a guest standing there feels. */
export function staffCover(ctx: GameContext, x: number, z: number): Set<StaffRole> {
  const roles = new Set<StaffRole>();
  const w = park.of(ctx);
  for (const state of session.staff.values()) {
    const post = parkObject(ctx, state.postId);
    if (post === undefined) continue;
    if (Math.hypot(x - post.x, z - post.z) <= patrolRadius(w, post.id)) roles.add(post.def.staff!.role);
  }
  return roles;
}

/** Staff bodies the park had at save time; the agents come back from their own snapshots. */
export function restoreStaff(ctx: GameContext, states: readonly StaffState[]): void {
  for (const state of states) {
    const post = parkObject(ctx, state.postId);
    if (post === undefined || post.def.staff === undefined) continue;
    session.staff.set(state.id, state);
    ctx.scene.entity.spawn(STAFF_BODY[post.def.staff.role], { id: state.id, position: [post.x, 0, post.z], role: "npc" });
  }
}

export function resetStaffClock(): void {
  lastInspection.clear();
}
