export type CardKind = "attack" | "skill" | "power";
export type CardArt = "sword" | "shield" | "mace" | "dagger" | "flame" | "brace" | "wave" | "axe";

export interface CardEffects {
  damage?: number;
  hits?: number;
  block?: number;
  strength?: number;
  draw?: number;
  weak?: number;
  vulnerable?: number;
  energy?: number;
  exhaust?: boolean;
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
  twin_strike: { type: "twin_strike", name: "Twin Strike", kind: "attack", cost: 1, text: "Deal 4 damage twice.", art: "dagger", effects: { damage: 4, hits: 2 } },
  uppercut: { type: "uppercut", name: "Uppercut", kind: "attack", cost: 2, text: "Deal 8 damage. Apply 2 Weak and 2 Vulnerable.", art: "mace", effects: { damage: 8, weak: 2, vulnerable: 2 } },
  clothesline: { type: "clothesline", name: "Clothesline", kind: "attack", cost: 2, text: "Deal 12 damage. Apply 2 Weak.", art: "axe", effects: { damage: 12, weak: 2 } },
  battle_trance: { type: "battle_trance", name: "Battle Trance", kind: "skill", cost: 0, text: "Draw 3 cards. Exhaust.", art: "brace", effects: { draw: 3, exhaust: true } },
  impervious: { type: "impervious", name: "Impervious", kind: "skill", cost: 2, text: "Gain 15 Block. Exhaust.", art: "shield", effects: { block: 15, exhaust: true } },
  adrenaline: { type: "adrenaline", name: "Adrenaline", kind: "skill", cost: 0, text: "Gain 1 Energy. Draw 1 card. Exhaust.", art: "flame", effects: { energy: 1, draw: 1, exhaust: true } },
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
