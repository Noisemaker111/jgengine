import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { vec3 } from "@jgengine/core/world/vec3";

import { councilScale } from "../campaign";
import { keep, runEnded } from "../keep";
import { gameClockMs, session } from "../session";
import { abilityDef, ABILITIES, BLACKOUT, DO_NOT_DISTURB } from "./abilities";
import { scorch } from "./strike";

/** The council's cooldown for an ability, kept on the engine kit's slot. */
function retuneCooldowns(ctx: GameContext): void {
  for (const ability of ABILITIES) {
    const scale = councilScale(ctx, ability.id === "blackout" ? "blackout_cooldown" : "dnd_cooldown");
    session.abilities.retuneSlot(ability.id, { cooldownMs: Math.round(ability.cooldownMs * scale) });
  }
}

/** Why an ability can't be used now, in a word the HUD shows, or null when it can. */
export function abilityRefusal(ctx: GameContext, id: string): string | null {
  if (runEnded(keep.of(ctx))) return "The day is over";
  const result = session.abilities.canCast(id);
  if (!result.ok) return result.reason === "cooldown" ? "Not ready" : "Unavailable";
  return null;
}

function flipBreaker(ctx: GameContext, at: EntityPosition): void {
  session.abilities.cast("blackout");
  session.falling.push({ at: [at[0], at[1], at[2]], landsInMs: BLACKOUT.delayMs });
  ctx.scene.entity.telegraph({ from: "keep", shape: { kind: "circle", radius: BLACKOUT.radius }, at: [at[0], at[1], at[2]], windupMs: BLACKOUT.delayMs, kind: "fire" });
  ctx.game.audio.play("wave", at);
}

/** Do Not Disturb: every gadget slows, every worker looks up, and notifications wait. */
function doNotDisturb(ctx: GameContext): void {
  session.abilities.cast("dnd");
  const until = gameClockMs(ctx) + DO_NOT_DISTURB.durationMs;
  for (const creep of session.creeps.values()) {
    const factor = session.boss?.instanceId === creep.instanceId ? DO_NOT_DISTURB.bossFactor : DO_NOT_DISTURB.factor;
    creep.speedStats.removeSource("dnd");
    creep.speedStats.addSource("dnd", { speed: { multiply: factor } }, { expiresAtMs: until });
    // Notifications hold off for the same few seconds.
    creep.notifyIn = Math.max(creep.notifyIn, DO_NOT_DISTURB.durationMs / 1000);
    ctx.scene.entity.vfx({ preset: "frostbolt", to: creep.instanceId, kind: "glow", radius: 1.2, durationMs: 900, color: 0xff6a9a });
  }
  for (const worker of keep.of(ctx).instances()) {
    if (!session.workers.has(worker.id, "distracted")) continue;
    session.workers.clear(worker.id);
    ctx.scene.entity.floatText({ instanceId: worker.id, text: "Do Not Disturb.", element: "holy", scale: 0.85 });
  }
  ctx.game.audio.play("upgrade");
}

/**
 * Use an ability. An instant one (the bell) rings at once; a targeted one (the fire) arms and waits
 * for a point on the road, which `castAt` supplies.
 */
export function useAbility(ctx: GameContext, id: string): boolean {
  retuneCooldowns(ctx);
  const def = abilityDef(id);
  if (def === null || abilityRefusal(ctx, id) !== null) {
    ctx.game.audio.play("denied");
    return false;
  }
  if (def.castType === "targeted") {
    session.armedAbility = session.armedAbility === id ? null : id;
    session.selectedTowerId = null;
    if (session.armedAbility !== null) {
      ctx.game.audio.play("select");
      ctx.game.notices.push({ text: `${def.label}: click the street to flip the breaker there`, ttlMs: 2500 });
    }
    return true;
  }
  doNotDisturb(ctx);
  return true;
}

/** A click on the field while an ability is armed: drop it there. */
export function castAt(ctx: GameContext, point: EntityPosition): boolean {
  const id = session.armedAbility;
  if (id === null) return false;
  session.armedAbility = null;
  if (abilityRefusal(ctx, id) !== null) return false;
  if (id === "blackout") flipBreaker(ctx, point);
  return true;
}

/** Cooldowns and pending blackouts, once a frame. */
export function tickAbilities(ctx: GameContext, dt: number): void {
  session.abilities.tick(dt);
  if (session.falling.length === 0) return;
  const damage = BLACKOUT.damage * councilScale(ctx, "blackout_damage");
  const still: typeof session.falling = [];
  for (const fire of session.falling) {
    fire.landsInMs -= dt * 1000;
    if (fire.landsInMs > 0) {
      still.push(fire);
      continue;
    }
    ctx.scene.entity.vfx({ preset: "lightning", from: [fire.at[0], fire.at[1] + 8, fire.at[2]], to: [fire.at[0], fire.at[1], fire.at[2]] });
    ctx.scene.entity.vfx({ preset: "explosion", to: [fire.at[0], fire.at[1] + 0.3, fire.at[2]], radius: BLACKOUT.radius, durationMs: 600, color: 0x6ab8ff });
    for (const creep of Array.from(session.creeps.values())) {
      const pose = ctx.scene.entity.get(creep.instanceId)?.position;
      if (pose === undefined || vec3.distance([pose[0], fire.at[1], pose[2]], fire.at) > BLACKOUT.radius) continue;
      session.statuses.apply(creep.instanceId, "burn", { magnitudeScale: BLACKOUT.burn, source: "town" });
      scorch(ctx, "town", creep.instanceId, damage);
    }
    ctx.game.audio.play("kill", fire.at);
  }
  session.falling = still;
}

export function registerAbilityCommands(ctx: GameContext): void {
  for (const ability of ABILITIES) {
    const command = {
      validate: (state: GameContext) => {
        const refusal = abilityRefusal(state, ability.id);
        return refusal === null ? null : { reason: "ability-not-ready", message: refusal };
      },
      apply: (state: GameContext) => {
        useAbility(state, ability.id);
        return state;
      },
    };
    // The HUD's keystone runs `ability.<id>`; the key runs the input action of the same ability.
    ctx.game.commands.define(`ability.${ability.id}`, command);
    ctx.game.commands.define(ability.action, command);
  }
}
