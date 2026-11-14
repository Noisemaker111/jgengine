/**
 * What a rider can carry besides the boxes: Mercato Fresco's first-aid kits and crash jackets.
 * `use` names the item-use handler in `use-handlers.ts`.
 */
export interface GearDef {
  id: string;
  label: string;
  kind: "gear";
  use?: string;
  heal?: number;
  armor?: number;
  stack: number;
  trade?: { buy?: Record<string, number>; sell?: Record<string, number>; shops?: string[] };
}

/** The corner store's shop id, kept from the store's old sign so saves and the price board agree. */
export const GEAR_SHOP = "shop_ammunation";

export const GEAR: readonly GearDef[] = [
  { id: "medkit_street", label: "First-aid kit", kind: "gear", use: "useMedkit", heal: 45, stack: 5, trade: { buy: { cash: 120 }, shops: [GEAR_SHOP] } },
  { id: "vest_kevlar", label: "Crash jacket", kind: "gear", use: "wearVest", armor: 100, stack: 2, trade: { buy: { cash: 400 }, shops: [GEAR_SHOP] } },
];

export const gearById = (id: string): GearDef | undefined => GEAR.find((g) => g.id === id);
