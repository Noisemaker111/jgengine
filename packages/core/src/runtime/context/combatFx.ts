import type { EffectInput, EffectResult } from "../../combat/effects";
import { resolveHitReaction, type HitReaction } from "../../combat/hitReaction";
import { pointInTelegraph, type TelegraphConfig } from "../../combat/telegraph";
import type { GameEventMap, GameEvents, VfxKind } from "../../game/events";
import type { EntityPosition, EntityStore } from "../../scene/entityStore";
import type { SimClock } from "../../time/simClock";
import type { FloatTextInput, HitReactionInput, TelegraphInput, VfxInput } from "../gameContext";

/** @internal What the combat-presentation helpers need from the live context: entity poses, the event bus, the sim clock (telegraph windups), and the raw effect application. */
export interface CombatFxDeps {
  entities: EntityStore;
  events: GameEvents;
  time: SimClock;
  applyEffect: (input: EffectInput) => EffectResult[];
}

/** @internal Combat presentation surface registered under `ctx.scene.entity`: float text, VFX bursts, telegraphs, hit reactions, and the effect wrapper that emits damage/heal float text. */
export interface CombatFx {
  emitFloatText(input: FloatTextInput): void;
  emitVfx(input: VfxInput): void;
  fireTelegraph(input: TelegraphInput): () => void;
  applyHitReaction(input: HitReactionInput): HitReaction | null;
  applyEffectAndFloat(input: EffectInput): EffectResult[];
}

/** @internal */
export function createCombatFx(d: CombatFxDeps): CombatFx {
  const { entities, events, time } = d;

  function emitFloatText(input: FloatTextInput): void {
    const position =
      input.position ??
      (input.instanceId === undefined ? undefined : entities.get(input.instanceId)?.position);
    if (position === undefined) return;
    const text = input.text ?? (input.amount === undefined ? "" : String(Math.round(input.amount)));
    const event: GameEventMap["entity.floatText"] = {
      position: [position[0], position[1], position[2]],
      text,
      kind: input.kind ?? "info",
    };
    if (input.instanceId !== undefined) event.instanceId = input.instanceId;
    if (input.amount !== undefined) event.amount = input.amount;
    if (input.hitType !== undefined) event.hitType = input.hitType;
    if (input.element !== undefined) event.element = input.element;
    if (input.crit !== undefined) event.crit = input.crit;
    if (input.scale !== undefined) event.scale = input.scale;
    events.emit("entity.floatText", event);
  }

  const vfxDefaultDurationMs: Record<VfxKind, number> = {
    projectile: 380,
    beam: 260,
    nova: 520,
    glow: 700,
    spark: 240,
  };
  let vfxSeq = 0;

  function resolveVfxPoint(
    ref: string | readonly [number, number, number] | undefined,
  ): [number, number, number] | undefined {
    if (ref === undefined) return undefined;
    if (typeof ref === "string") {
      const entity = entities.get(ref);
      if (entity === null) return undefined;
      return [entity.position[0], entity.position[1], entity.position[2]];
    }
    return [ref[0], ref[1], ref[2]];
  }

  function emitVfx(input: VfxInput): void {
    const to = resolveVfxPoint(input.to);
    const from = resolveVfxPoint(input.from) ?? to;
    if (from === undefined) return;
    const event: GameEventMap["combat.vfx"] = {
      id: vfxSeq++,
      kind: input.kind,
      color: input.color,
      from,
      durationMs: input.durationMs ?? vfxDefaultDurationMs[input.kind],
    };
    if (to !== undefined) event.to = to;
    if (input.radius !== undefined) event.radius = input.radius;
    events.emit("combat.vfx", event);
  }

  let telegraphSeq = 0;

  function fireTelegraph(input: TelegraphInput): () => void {
    const id = telegraphSeq++;
    const telegraphEvent: GameEventMap["combat.telegraph"] = {
      id,
      shape: input.shape,
      position: [input.at[0], input.at[1], input.at[2]],
      windupMs: input.windupMs,
      kind: input.kind ?? "danger",
    };
    if (input.dir !== undefined) telegraphEvent.dir = input.dir;
    events.emit("combat.telegraph", telegraphEvent);
    const cancelVisual = () => events.emit("combat.telegraphCancelled", { id });
    const bound = input.effect;
    if (bound === undefined) return cancelVisual;
    const config: TelegraphConfig = { shape: input.shape, at: input.at, windupMs: input.windupMs };
    if (input.dir !== undefined) config.dir = input.dir;
    const cancelEffect = time.after(input.windupMs / 1000, () => {
      const targets = entities.list().filter((entity) => pointInTelegraph(config, entity.position));
      for (const target of targets) {
        applyEffectAndFloat({
          from: input.from,
          to: target.id,
          effect: bound.effect,
          ...(bound.via === undefined ? {} : { via: bound.via }),
        });
      }
    });
    return () => {
      cancelEffect();
      cancelVisual();
    };
  }

  function applyHitReaction(input: HitReactionInput): HitReaction | null {
    const attacker = entities.get(input.from);
    const target = entities.get(input.to);
    if (target === null) return null;
    const attackerPos = attacker?.position ?? target.position;
    const reaction = resolveHitReaction(input.config, {
      attackerPos,
      targetPos: target.position,
      ...(input.power === undefined ? {} : { power: input.power }),
    });
    entities.setPose(input.to, {
      position: [
        target.position[0] + reaction.impulse[0],
        target.position[1] + reaction.impulse[1],
        target.position[2] + reaction.impulse[2],
      ],
      rotationY: target.rotationY,
    });
    const reactionEvent: GameEventMap["combat.hitReaction"] = {
      instanceId: input.to,
      position: [target.position[0], target.position[1], target.position[2]],
      hitstopMs: reaction.hitstopMs,
    };
    if (reaction.shake !== null) reactionEvent.shake = reaction.shake;
    if (reaction.trauma !== null) reactionEvent.trauma = reaction.trauma;
    events.emit("combat.hitReaction", reactionEvent);
    return reaction;
  }

  function applyEffectAndFloat(input: EffectInput): EffectResult[] {
    const positionsBefore = new Map<string, EntityPosition>();
    for (const entity of entities.list()) positionsBefore.set(entity.id, entity.position);
    const results = d.applyEffect(input);
    for (const result of results) {
      let total = 0;
      for (const delta of result.applied) total += delta.delta;
      if (total === 0) continue;
      const position = entities.get(result.instanceId)?.position ?? positionsBefore.get(result.instanceId);
      if (position === undefined) continue;
      const magnitude = Math.abs(total);
      emitFloatText({
        instanceId: result.instanceId,
        position: [position[0], position[1], position[2]],
        text: String(Math.round(magnitude)),
        kind: total < 0 ? "damage" : "heal",
        amount: magnitude,
      });
    }
    return results;
  }

  return { emitFloatText, emitVfx, fireTelegraph, applyHitReaction, applyEffectAndFloat };
}
