export type CardKind = "attack" | "skill" | "power";
export type CardArt = "sword" | "shield" | "mace" | "dagger" | "flame" | "brace" | "wave" | "axe";

export interface CardEffects {
  damage?: number;
  block?: number;
  strength?: number;
  draw?: number;
}

export interface CardData {
  type: string;
  name: string;
  kind: CardKind;
  cost: number;
  text: string;
  art: CardArt;
  effects: CardEffects;
}

export const CARD_CATALOG: Record<string, CardData> = {
  strike: { type: "strike", name: "Strike", kind: "attack", cost: 1, text: "Deal 6 damage.", art: "sword", effects: { damage: 6 } },
  defend: { type: "defend", name: "Defend", kind: "skill", cost: 1, text: "Gain 5 Block.", art: "shield", effects: { block: 5 } },
  bash: { type: "bash", name: "Bash", kind: "attack", cost: 2, text: "Deal 10 damage.", art: "mace", effects: { damage: 10 } },
  pommel_strike: { type: "pommel_strike", name: "Pommel Strike", kind: "attack", cost: 1, text: "Deal 7 damage. Draw 1 card.", art: "dagger", effects: { damage: 7, draw: 1 } },
  inflame: { type: "inflame", name: "Inflame", kind: "power", cost: 1, text: "Gain 2 Strength.", art: "flame", effects: { strength: 2 } },
  shrug_it_off: { type: "shrug_it_off", name: "Shrug It Off", kind: "skill", cost: 1, text: "Gain 8 Block. Draw 1 card.", art: "brace", effects: { block: 8, draw: 1 } },
  iron_wave: { type: "iron_wave", name: "Iron Wave", kind: "attack", cost: 1, text: "Deal 5 damage. Gain 5 Block.", art: "wave", effects: { damage: 5, block: 5 } },
  cleave: { type: "cleave", name: "Cleave", kind: "attack", cost: 1, text: "Deal 8 damage.", art: "axe", effects: { damage: 8 } },
};

const DECK_RECIPE: readonly [string, number][] = [
  ["strike", 4],
  ["defend", 3],
  ["bash", 1],
  ["pommel_strike", 1],
  ["inflame", 1],
  ["shrug_it_off", 1],
  ["iron_wave", 1],
  ["cleave", 1],
];

export function buildStartingDeck(): string[] {
  const deck: string[] = [];
  let serial = 0;
  for (const [type, count] of DECK_RECIPE) {
    for (let i = 0; i < count; i += 1) {
      deck.push(`${type}#${serial}`);
      serial += 1;
    }
  }
  return deck;
}

export function cardTypeOf(cardId: string): string {
  const hash = cardId.indexOf("#");
  return hash === -1 ? cardId : cardId.slice(0, hash);
}

export function cardOf(cardId: string): CardData {
  const data = CARD_CATALOG[cardTypeOf(cardId)];
  if (data === undefined) throw new Error(`unknown card: ${cardId}`);
  return data;
}
