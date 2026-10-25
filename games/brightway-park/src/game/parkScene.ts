import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { WorldInstanceView, WorldJobEvent, WorldModel } from "@jgengine/core/worldModel/worldModel";

import { BUILDABLES } from "./objects/catalog";
import { park, rethemeRides, repairAction } from "./park";
import { fixRide, leaveRide, serviceRide } from "./rides";
import { session } from "./session";
import { syncAmbience } from "./audio";
import { savePark } from "./persistence";
import { connectPark, relinkPark } from "./build/links";
import { groundAt } from "./build/terrain";

/**
 * Where the park's declaration meets the screen: a built structure is placed in the scene, a removed
 * one leaves it, a landed action is heard, a breakdown sends the crew, a scenario's end stops play.
 * Everything here reacts to the world; none of it keeps state of its own.
 */

export function spawnObject(ctx: GameContext, instance: WorldInstanceView): void {
  if (instance.position === null) return;
  const w = park.of(ctx);
  const rotation = (w.num(`${instance.id}.rot`) * Math.PI) / 2;
  const y = groundAt(w, instance.position[0], instance.position[1]);
  ctx.scene.object.place(instance.kind, instance.position[0], y, instance.position[1], { instanceId: instance.id, onExisting: "keep", rotation });
  rethemeRides(ctx);
  relinkPark(ctx);
}

/** Every structure the world holds goes on screen: after a load, a reset or a replicated world. */
export function spawnAll(ctx: GameContext): void {
  const w = park.of(ctx);
  // A park laid out before rides needed entrances and exits gets them, free, the first time it opens.
  if (w.num("park.netv") < 1) {
    connectPark(ctx, { free: true });
    w.set("park.netv", 1);
  }
  for (const instance of w.instances()) spawnObject(ctx, instance);
  relinkPark(ctx);
}

/** The world removed a structure (`brightway.remove`, refund already in the till): it leaves the scene. */
export function despawnObject(ctx: GameContext, id: string, refund = 0): void {
  ctx.scene.object.remove(id);
  rethemeRides(ctx);
  relinkPark(ctx);
  ctx.game.notices.push({ text: refund > 0 ? `Demolished — $${Math.round(refund).toLocaleString()} refunded` : "Demolished", tone: "info" });
  ctx.game.audio.play("sell");
  if (session.selectedObject === id) session.selectedObject = null;
  for (const guest of session.guests.values()) {
    if (guest.targetId !== id) continue;
    leaveRide(id, guest.id);
    guest.targetId = null;
    guest.target = null;
    guest.phase = "seeking";
    guest.busy = 0;
  }
  savePark(ctx);
}

/** A ride broke: mark it down in the world and send the crew if the till can pay for it. */
export function dispatchCrew(ctx: GameContext, w: WorldModel, rideId: string): void {
  const instance = w.instance(rideId);
  if (instance === null) return;
  w.set(`${rideId}.broken`, true);
  const action = repairAction(w, instance.kind);
  const refused = w.canAct(action, rideId);
  if (refused === null) {
    w.act(action, rideId);
    ctx.game.notices.push({ text: `${instance.label} has broken down - the crew is on the way`, tone: "warn" });
  } else {
    ctx.game.notices.push({ text: `${instance.label} has broken down - ${refused.message}. Click it to send the crew.`, tone: "warn" });
  }
  ctx.game.audio.play("denied");
}

/** A declared action landed: hear it, tell the ride sim when it is a repair or a service, and save. */
export function landed(ctx: GameContext, action: string, target: string | null): void {
  const w = park.of(ctx);
  const decl = w.def.actions?.[action];
  if (target !== null && (action.startsWith("repair_") || action.startsWith("quickfix_"))) fixRide(target);
  if (target !== null && action.startsWith("service_")) serviceRide(target);
  if (decl?.note !== undefined) {
    const line = w.log().at(-1);
    if (line !== undefined && line.kind === action) ctx.game.notices.push({ text: line.text, tone: action.startsWith("take_") ? "info" : "success" });
  }
  const at = target === null ? null : w.instance(target)?.position ?? null;
  if (action.startsWith("ticket_") || action.startsWith("price_") || action === "take_loan") ctx.game.audio.play("ticket");
  else if (action.startsWith("repair_") || action.startsWith("quickfix_") || action.startsWith("service_")) ctx.game.audio.play("place", at === null ? undefined : [at[0], 0, at[1]]);
  else if (action === "repay_loan") ctx.game.audio.play("sell");
  if (!action.startsWith("restock_")) savePark(ctx);
}

/** A scenario's mission finished: pause on its result and say why. */
export function scenarioEnded(ctx: GameContext, event: WorldJobEvent): void {
  if (event.kind === "job-started") return;
  const w = park.of(ctx);
  if (event.kind === "job-failed") {
    w.set("scenario.result", "failed");
    w.set("scenario.reason", event.reason);
    ctx.game.audio.play("bankrupt");
  } else {
    w.set("scenario.result", "won");
    ctx.game.audio.play("ribbon");
  }
  ctx.time.pause();
  setGamePhase(ctx, "paused");
  syncAmbience(ctx);
  savePark(ctx);
}

/** A structure's refund when it is demolished, as the world will pay it (`refund: 0.5`). */
export const refundOf = (kind: string): number => Math.round((BUILDABLES[kind]?.cost ?? 0) * 0.5);
