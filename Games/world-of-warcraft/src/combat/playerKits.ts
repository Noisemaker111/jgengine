import {
  createAbilityKit,
  type AbilityCastType,
  type AbilityKit,
  type AbilitySlotSnapshot,
} from "@jgengine/core/combat/abilityKit";
import { createEventMeter, type EventMeter } from "@jgengine/core/stats/eventMeter";
import { abilities } from "../items/abilities/catalog";

const castTypeByHandler: Record<string, AbilityCastType> = {
  castBolt: "projectile",
  castHeal: "targeted",
  swingSword: "instant",
};

const slotConfigs = abilities.map((ability) => ({
  id: ability.id,
  cooldownMs: (ability.weapon.cooldownSeconds ?? 0) * 1000,
  resourceCost: ability.weapon.manaCost ?? 0,
  castType: castTypeByHandler[ability.use] ?? "instant",
}));

const kits = new Map<string, AbilityKit>();
const ultMeters = new Map<string, EventMeter>();
const streakMeters = new Map<string, EventMeter>();
const seeded = new Set<string>();

export function abilityKitFor(userId: string): AbilityKit {
  let kit = kits.get(userId);
  if (kit === undefined) {
    kit = createAbilityKit(slotConfigs);
    kits.set(userId, kit);
  }
  return kit;
}

export function ultMeterFor(userId: string): EventMeter {
  let meter = ultMeters.get(userId);
  if (meter === undefined) {
    meter = createEventMeter({
      max: 100,
      mode: "hold",
      gains: { damageDealt: 9, damageTaken: 6, kill: 22 },
    });
    ultMeters.set(userId, meter);
  }
  return meter;
}

export function streakMeterFor(userId: string): EventMeter {
  let meter = streakMeters.get(userId);
  if (meter === undefined) {
    meter = createEventMeter({
      max: 30,
      mode: "reset",
      decayPerSecond: 0.5,
      decayDelayMs: 6000,
      gains: { kill: 1 },
      resets: ["damageTaken"],
      tiers: [
        { id: "D", at: 3 },
        { id: "C", at: 6 },
        { id: "B", at: 10 },
        { id: "S", at: 20 },
      ],
    });
    streakMeters.set(userId, meter);
  }
  return meter;
}

export function abilitySlotState(
  userId: string,
  itemId: string,
  manaAvailable: number,
): AbilitySlotSnapshot | null {
  return abilityKitFor(userId).state(itemId, manaAvailable);
}

export function canCastAbility(userId: string, itemId: string): boolean {
  return abilityKitFor(userId).canCast(itemId, Number.POSITIVE_INFINITY).ok;
}

export function commitAbilityCast(userId: string, itemId: string): void {
  abilityKitFor(userId).cast(itemId, Number.POSITIVE_INFINITY);
}

export function recordKill(userId: string): void {
  ultMeterFor(userId).feed("kill");
  streakMeterFor(userId).feed("kill");
}

export function recordDamageTaken(userId: string): void {
  ultMeterFor(userId).feed("damageTaken");
  streakMeterFor(userId).feed("damageTaken");
}

export function tickPlayerKits(userId: string, dt: number): void {
  abilityKitFor(userId).tick(dt);
  ultMeterFor(userId).tick(dt);
  streakMeterFor(userId).tick(dt);
}

export function resetPlayerKits(): void {
  kits.clear();
  ultMeters.clear();
  streakMeters.clear();
  seeded.clear();
}

export function seedPreviewKits(
  userId: string,
  setMana: (value: number) => void,
): void {
  if (seeded.has(userId)) return;
  seeded.add(userId);

  const kit = abilityKitFor(userId);
  setMana(15);
  kit.cast("fireball", Number.POSITIVE_INFINITY);
  kit.cast("frostbolt", Number.POSITIVE_INFINITY);
  kit.tick(0.3);
  kit.cast("iron_sword", Number.POSITIVE_INFINITY);

  const ult = ultMeterFor(userId);
  for (let i = 0; i < 12; i += 1) ult.feed("damageDealt");
  const streak = streakMeterFor(userId);
  for (let i = 0; i < 12; i += 1) streak.feed("kill");
}
