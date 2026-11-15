import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { vec3 } from "@jgengine/core/world/vec3";

import { editorLayers } from "../../editorLayers";
import { creepDef, type CreepDef } from "../entities/enemies/catalog";
import { towerDef, voiceLine } from "../entities/towers/catalog";
import { keep, towerStats } from "../keep";
import { say, session, type CreepRuntime } from "../session";
import { speak } from "./towerAI";
import { tip } from "../tips";
import { campaign } from "../campaign";
import { distractionShare, unionReach } from "../union";

/**
 * Technology fights back without shooting. Phones, watches, speakers and chatbots fire
 * notifications at workers; a hit worker is Distracted (looking down at a phone) and stops working
 * until it wears off or a Teacher snaps them out of it. A Librarian's SHHH kills notifications in
 * her reach, coming or going; a Monk's offline aura makes the workers near him immune. A Flock
 * camera Spots one worker, and every notification goes for a spotted worker first, for longer.
 */

/** A spotted worker stays distracted this much longer. */
export const SPOTTED_DISTRACTION = 1.5;

interface Worker {
  id: string;
  kind: string;
  position: EntityPosition;
}

function workersOnField(ctx: GameContext): Worker[] {
  const out: Worker[] = [];
  for (const tower of keep.of(ctx).instances()) {
    if (!tower.ready) continue;
    const position = ctx.scene.entity.get(tower.id)?.position;
    if (position !== undefined) out.push({ id: tower.id, kind: tower.kind, position });
  }
  return out;
}

/** Whether any worker of `job` reaches `at` with their own range. */
function coveredBy(ctx: GameContext, job: string, at: EntityPosition): boolean {
  const world = keep.of(ctx);
  for (const worker of workersOnField(ctx)) {
    if (towerDef(worker.kind, editorLayers).job !== job || session.workers.has(worker.id, "distracted")) continue;
    if (vec3.distance(worker.position, at) <= towerStats(world, worker.id).range + unionReach(campaign.read(ctx), worker.kind)) return true;
  }
  return false;
}

/** A Librarian's SHHH covers this spot: no notification goes out from it or lands in it. */
export function isHushed(ctx: GameContext, at: EntityPosition): boolean {
  return coveredBy(ctx, "librarian", at);
}

/** A Monk's offline aura covers this spot: no worker in it can be distracted. */
export function isOffline(ctx: GameContext, at: EntityPosition): boolean {
  return coveredBy(ctx, "monk", at);
}

/** Distract one worker for `seconds` (longer if spotted), unless a Monk keeps them present. Returns whether it landed. */
export function distract(ctx: GameContext, worker: Worker, seconds: number, ping: string): boolean {
  if (isOffline(ctx, worker.position)) {
    ctx.scene.entity.floatText({ instanceId: worker.id, text: "Offline.", element: "holy", scale: 0.8 });
    return false;
  }
  if (isHushed(ctx, worker.position)) {
    ctx.scene.entity.floatText({ instanceId: worker.id, text: "Shhh!", element: "arcane", scale: 0.8 });
    return false;
  }
  const scale = (session.workers.has(worker.id, "spotted") ? SPOTTED_DISTRACTION : 1) * distractionShare(campaign.read(ctx));
  const already = session.workers.has(worker.id, "distracted");
  session.workers.apply(worker.id, "distracted", { durationScale: seconds * scale });
  ctx.scene.entity.floatText({ instanceId: worker.id, text: ping, element: "frost" });
  if (!already) {
    speak(ctx, worker.id, worker.kind, "distracted");
    ctx.game.playEntityAnimation(worker.id, "phone");
  }
  tip(ctx, "distracted");
  return true;
}

/** The worker a notification goes for: a spotted one in range first, else the nearest. */
function pickTarget(workers: readonly Worker[], at: EntityPosition, range: number): Worker | null {
  let best: Worker | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const worker of workers) {
    const gap = vec3.distance(worker.position, at);
    if (gap > range) continue;
    const score = gap - (session.workers.has(worker.id, "spotted") ? 1000 : 0) + (session.workers.has(worker.id, "distracted") ? 500 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = worker;
    }
  }
  return best;
}

/**
 * A chatbot's reply: the worker's own line, confidently restated with the meaning sanded off.
 * "Extra hot, for here." comes back as "Great question! Extra hot, for here… as an AI?"
 */
export function chatbotEcho(kind: string, seed: number): string {
  const line = voiceLine(kind, "fire", seed).replace(/[.!?…]+$/, "");
  const frames = ["Great question! %s… as an AI?", "So what I'm hearing is: %s?", "Let me rephrase: %s, but worse", "%s! (citation needed)"];
  return frames[seed % frames.length]!.replace("%s", line);
}

/** Fire one notification (or a "Hey—" at everyone in reach). Returns how many workers it distracted. */
export function sendNotification(ctx: GameContext, creep: CreepRuntime, def: CreepDef = creepDef(creep.catalogId)): number {
  const notify = def.notify;
  const at = ctx.scene.entity.get(creep.instanceId)?.position;
  if (notify === undefined || at === undefined) return 0;
  if (isHushed(ctx, at)) return 0;
  session.voiceSeq += 1;
  const text = notify.text[session.voiceSeq % notify.text.length] ?? "*ding*";
  const workers = workersOnField(ctx);
  const targets = notify.area === true
    ? workers.filter((worker) => vec3.distance(worker.position, at) <= notify.range)
    : [pickTarget(workers, at, notify.range)].filter((worker): worker is Worker => worker !== null);
  if (targets.length === 0) return 0;
  // A chatbot answers in the worker's own words, echoed back garbled until they lose the thread.
  const echoed = def.mesh === "chatbot" ? chatbotEcho(targets[0]!.kind, session.voiceSeq) : null;
  const ping = echoed === null ? text : "Confused?";
  let landed = 0;
  for (const worker of targets) if (distract(ctx, worker, notify.seconds, ping)) landed += 1;
  say(creep.instanceId, echoed ?? text, "ping", ctx.time.now());
  if (landed > 0) ctx.game.audio.play("ping", at);
  if (notify.area === true) ctx.scene.entity.vfx({ preset: "shockwave", to: [at[0], at[1] + 0.6, at[2]], radius: notify.range, durationMs: 500, color: 0x3ae0ff });
  return landed;
}

/** A Flock camera picks the nearest worker in sight and marks them for every notification on the street. */
export function spotWorker(ctx: GameContext, creep: CreepRuntime): string | null {
  const spots = creepDef(creep.catalogId).spots;
  const at = ctx.scene.entity.get(creep.instanceId)?.position;
  if (spots === undefined || at === undefined) return null;
  let best: Worker | null = null;
  let bestGap = spots.range;
  for (const worker of workersOnField(ctx)) {
    const gap = vec3.distance(worker.position, at);
    if (gap <= bestGap) {
      bestGap = gap;
      best = worker;
    }
  }
  if (best === null) return null;
  session.workers.apply(best.id, "spotted");
  tip(ctx, "camera");
  ctx.scene.entity.floatText({ instanceId: best.id, text: "SPOTTED", element: "bleed" });
  ctx.scene.entity.vfx({ preset: "lightning", from: [at[0], at[1] + 1.6, at[2]], to: [best.position[0], best.position[1] + 1.6, best.position[2]], color: 0xff3a3a });
  return best.id;
}

/** Workers of a job within `range` of a spot, ready and not looking at their phone. */
export function workersNear(ctx: GameContext, job: string, at: EntityPosition, range: number): number {
  let count = 0;
  for (const worker of workersOnField(ctx)) {
    if (towerDef(worker.kind, editorLayers).job !== job || session.workers.has(worker.id, "distracted")) continue;
    if (vec3.distance(worker.position, at) <= range) count += 1;
  }
  return count;
}

/** The summed power drain of the Electricians standing near a spot (1 per plain Electrician). */
export function powerDrainNear(ctx: GameContext, at: EntityPosition, range: number): number {
  const world = keep.of(ctx);
  let drain = 0;
  for (const worker of workersOnField(ctx)) {
    if (towerDef(worker.kind, editorLayers).job !== "electrician" || session.workers.has(worker.id, "distracted")) continue;
    if (vec3.distance(worker.position, at) <= range) drain += towerStats(world, worker.id).power_drain;
  }
  return drain;
}
