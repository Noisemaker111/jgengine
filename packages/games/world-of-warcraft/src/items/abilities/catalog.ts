export interface AbilityDef {
  id: string;
  name: string;
  use: string;
  weapon: Record<string, number>;
}

export const fireball: AbilityDef = {
  id: "fireball",
  name: "Fireball",
  use: "castBolt",
  weapon: { damage: 22, manaCost: 20, range: 28, cooldownSeconds: 2.5, "projectile.speed": 24 },
};

export const frostbolt: AbilityDef = {
  id: "frostbolt",
  name: "Frostbolt",
  use: "castBolt",
  weapon: { damage: 14, manaCost: 12, range: 28, cooldownSeconds: 1.5, "projectile.speed": 26 },
};

export const flash_heal: AbilityDef = {
  id: "flash_heal",
  name: "Flash Heal",
  use: "castHeal",
  weapon: { heal: 30, manaCost: 18, cooldownSeconds: 1.2 },
};

export const iron_sword: AbilityDef = {
  id: "iron_sword",
  name: "Iron Sword",
  use: "swingSword",
  weapon: { damage: 12, reach: 2.5, cooldownSeconds: 0.8 },
};

export const abilities: AbilityDef[] = [fireball, frostbolt, flash_heal, iron_sword];
