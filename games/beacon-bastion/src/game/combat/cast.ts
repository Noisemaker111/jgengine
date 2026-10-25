import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { distance } from "@jgengine/core/world/vec3";

import { councilScale } from "../campaign";
import { keep, runEnded } from "../keep";
import { gameClockMs, session } from "../session";
import { abilityDef, ABILITIES, BEACON_FIRE, FROST_BELL } from "./abilities";
import { scorch } from "./strike";

/** The council's cooldown for an ability, kept on the engine kit's slot. */
function retuneCooldowns(ctx: GameContext): void {
  for (const ability of ABILITIES) {
    const scale = councilScale(ctx, ability.id === "beacon_fire" ? "fire_cooldown" : "bell_cooldown");
    session.abilities.retuneSlot(ability.id, { cooldownMs: Math.round(ability.cooldownMs * scale) });
  }
}

/** Why an ability can't be used now, in a word the HUD shows, or null when it can. */
export function abilityRefusal(ctx: GameContext, id: string): string | null {
  if (runEnded(keep.of(ctx))) return "The defense is over";
  const result = session.abilities.canCast(id);
  if (!result.ok) return result.reason === "cooldown" ? "Not ready" : "Unavailable";
  return null;
}

function dropFire(ctx: GameContext, at: EntityPosition): void {
  session.abilities.cast("beacon_fire");
  session.falling.push({ at: [at[0], at[1], at[2]], landsInMs: BEACON_FIRE.delayMs });
  ctx.scene.entity.telegraph({ from: "keep", shape: { kind: "circle", radius: BEACON_FIRE.radius }, at: [at[0], at[1], at[2]], windupMs: BEACON_FIRE.delayMs, kind: "fire" });
  ctx.game.audio.play("wave", at);
}

function ringBell(ctx: GameContext): void {
  session.abilities.cast("frost_bell");
  const until = gameClockMs(ctx) + FROST_BELL.durationMs;
  for (const creep of session.creeps.values()) {
    const factor = session.boss?.instanceId === creep.instanceId ? FROST_BELL.bossFactor : FROST_BELL.factor;
    creep.speedStats.removeSource("frost-bell");
    creep.speedStats.addSource("frost-bell", { speed: { multiply: factor } }, { expiresAtMs: until });
    ctx.scene.entity.vfx({ preset: "frostbolt", to: creep.instanceId, kind: "glow", radius: 1.2, durationMs: 900 });
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
      ctx.game.notices.push({ text: `${def.label}: click the road to bring it down`, ttlMs: 2500 });
    }
    return true;
  }
  ringBell(ctx);
  return true;
}

/** A click on the field while an ability is armed: drop it there. */
export function castAt(ctx: GameContext, point: EntityPosition): boolean {
  const id = session.armedAbility;
  if (id === null) return false;
  session.armedAbility = null;
  if (abilityRefusal(ctx, id) !== null) return false;
  if (id === "beacon_fire") dropFire(ctx, point);
  return true;
}

/** Cooldowns and falling fire, once a frame. */
export function tickAbilities(ctx: GameContext, dt: number): void {
  session.abilities.tick(dt);
  if (session.falling.length === 0) return;
  const damage = BEACON_FIRE.damage * councilScale(ctx, "fire_damage");
  const still: typeof session.falling = [];
  for (const fire of session.falling) {
    fire.landsInMs -= dt * 1000;
    if (fire.landsInMs > 0) {
      still.push(fire);
      continue;
    }
    ctx.scene.entity.vfx({ preset: "explosion", to: [fire.at[0], fire.at[1] + 0.3, fire.at[2]], radius: BEACON_FIRE.radius, durationMs: 600 });
    for (const creep of Array.from(session.creeps.values())) {
      const pose = ctx.scene.entity.get(creep.instanceId)?.position;
      if (pose === undefined || distance([pose[0], fire.at[1], pose[2]], fire.at) > BEACON_FIRE.radius) continue;
      session.statuses.apply(creep.instanceId, "burn", { magnitudeScale: BEACON_FIRE.burn, source: "beacon" });
      scorch(ctx, "beacon", creep.instanceId, damage);
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
