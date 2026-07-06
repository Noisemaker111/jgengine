export interface ConsumableDef {
  id: string;
  name: string;
  use: string;
  weapon: Record<string, number>;
}

export const health_potion: ConsumableDef = {
  id: "health_potion",
  name: "Health Potion",
  use: "drinkHealthPotion",
  weapon: { heal: 40, cooldownSeconds: 30 },
};

export const consumables: ConsumableDef[] = [health_potion];
