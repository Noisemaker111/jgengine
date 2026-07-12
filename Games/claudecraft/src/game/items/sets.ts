import type { EquipSlot } from "../model";
import { itemDefById } from "./catalog";

export interface SetProc {
  id: string;
  name: string;
  icon: string;
  trigger: "weaponCrit" | "spellCast";
  chance: number;
  icdSec: number;
  effect:
    | { kind: "selfBuff"; buffStat: "attackPower" | "spellPower" | "haste"; amount: number; durationSec: number }
    | { kind: "targetDot"; amount: number; tickSec: number; durationSec: number; maxStacks: number }
    | { kind: "nextCastFree"; durationSec: number };
}

export interface SetBonusEffect {
  str?: number;
  agi?: number;
  sta?: number;
  int?: number;
  spi?: number;
  ap?: number;
  sp?: number;
  critPct?: number;
  hastePct?: number;
  proc?: SetProc;
}

export interface SetBonusTier {
  pieces: number;
  effect: SetBonusEffect;
  text: string;
}

export interface ItemSet {
  id: string;
  name: string;
  bonuses: readonly SetBonusTier[];
}

const SET_HASTE_3PC = 0.15;
const SET_CRIT_3PC = 2;

const STRENGTH_T1: readonly SetBonusTier[] = [
  { pieces: 2, effect: { ap: 40 }, text: "Increases attack power by 40." },
  { pieces: 3, effect: { str: 15, sta: 15 }, text: "Increases Strength by 15 and Stamina by 15." },
  {
    pieces: 4,
    effect: {
      proc: {
        id: "set_gravemight",
        name: "Gravemight",
        icon: "chestplate",
        trigger: "weaponCrit",
        chance: 0.5,
        icdSec: 15,
        effect: { kind: "selfBuff", buffStat: "attackPower", amount: 60, durationSec: 10 },
      },
    },
    text: "Weapon critical strikes have a 50% chance to grant Gravemight, increasing attack power by 60 for 10 sec.",
  },
];

const AGILITY_T1: readonly SetBonusTier[] = [
  { pieces: 2, effect: { ap: 40 }, text: "Increases attack power by 40." },
  {
    pieces: 3,
    effect: { agi: 15, critPct: SET_CRIT_3PC },
    text: "Increases Agility by 15 and critical strike chance by 2%.",
  },
  {
    pieces: 4,
    effect: {
      proc: {
        id: "set_fangrush",
        name: "Fangrush",
        icon: "boots",
        trigger: "weaponCrit",
        chance: 0.5,
        icdSec: 15,
        effect: { kind: "selfBuff", buffStat: "haste", amount: 0.25, durationSec: 8 },
      },
    },
    text: "Weapon critical strikes have a 50% chance to grant Fangrush, increasing attack speed by 25% for 8 sec.",
  },
];

const CASTER_T1: readonly SetBonusTier[] = [
  { pieces: 2, effect: { sp: 20 }, text: "Increases spell power by 20." },
  { pieces: 3, effect: { int: 10, sta: 10 }, text: "Increases Intellect by 10 and Stamina by 10." },
  {
    pieces: 4,
    effect: {
      proc: {
        id: "set_clearcasting",
        name: "Clearcasting",
        icon: "chestplate",
        trigger: "spellCast",
        chance: 0.1,
        icdSec: 4,
        effect: { kind: "nextCastFree", durationSec: 12 },
      },
    },
    text: "Your spells have a 10% chance to grant Clearcasting, making your next spell free.",
  },
];

const STRENGTH_T2: readonly SetBonusTier[] = [
  { pieces: 2, effect: { ap: 40 }, text: "Increases attack power by 40." },
  {
    pieces: 3,
    effect: { str: 15, sta: 15, hastePct: SET_HASTE_3PC },
    text: "Increases Strength by 15, Stamina by 15, and attack and casting speed by 15%.",
  },
  {
    pieces: 4,
    effect: {
      proc: {
        id: "set_bonesplinter",
        name: "Bonesplinter",
        icon: "skull",
        trigger: "weaponCrit",
        chance: 1,
        icdSec: 0,
        effect: { kind: "targetDot", amount: 8, tickSec: 2, durationSec: 12, maxStacks: 3 },
      },
    },
    text: "Weapon critical strikes bleed the target for 8 damage every 2 sec for 12 sec. Stacks up to 3 times.",
  },
];

const AGILITY_T2: readonly SetBonusTier[] = [
  { pieces: 2, effect: { ap: 40 }, text: "Increases attack power by 40." },
  {
    pieces: 3,
    effect: { agi: 15, critPct: SET_CRIT_3PC, hastePct: SET_HASTE_3PC },
    text: "Increases Agility by 15, critical strike chance by 2%, and attack and casting speed by 15%.",
  },
  {
    pieces: 4,
    effect: {
      proc: {
        id: "set_ragged_gash",
        name: "Ragged Gash",
        icon: "skull",
        trigger: "weaponCrit",
        chance: 1,
        icdSec: 0,
        effect: { kind: "targetDot", amount: 6, tickSec: 2, durationSec: 12, maxStacks: 3 },
      },
    },
    text: "Weapon critical strikes tear a Ragged Gash, bleeding the target for 6 damage every 2 sec for 12 sec. Stacks up to 3 times.",
  },
];

const CASTER_T2: readonly SetBonusTier[] = [
  { pieces: 2, effect: { sp: 20 }, text: "Increases spell power by 20." },
  {
    pieces: 3,
    effect: { int: 15, spi: 15, hastePct: SET_HASTE_3PC },
    text: "Increases Intellect by 15, Spirit by 15, and attack and casting speed by 15%.",
  },
  {
    pieces: 4,
    effect: {
      proc: {
        id: "set_soulblaze",
        name: "Soulblaze",
        icon: "chestplate",
        trigger: "spellCast",
        chance: 0.1,
        icdSec: 20,
        effect: { kind: "selfBuff", buffStat: "spellPower", amount: 40, durationSec: 10 },
      },
    },
    text: "Your spells have a 10% chance to grant Soulblaze, increasing spell power by 40 for 10 sec.",
  },
];

export const ITEM_SETS: Record<string, ItemSet> = {
  deathlord: { id: "deathlord", name: "Barrowlord Battlegear", bonuses: STRENGTH_T1 },
  wyrmshadow: { id: "wyrmshadow", name: "Nightfang Vestments", bonuses: AGILITY_T1 },
  necromancers: { id: "necromancers", name: "Mournweave Raiment", bonuses: CASTER_T1 },
  crownforged: { id: "crownforged", name: "Bonewrought Regalia", bonuses: STRENGTH_T2 },
  nighttalon: { id: "nighttalon", name: "Direfang Pelt", bonuses: AGILITY_T2 },
  soulflame: { id: "soulflame", name: "Wraithfire Regalia", bonuses: CASTER_T2 },
  stormcallers: { id: "stormcallers", name: "Galecall Vestments", bonuses: CASTER_T2 },
};

export interface AggregatedSet {
  str: number;
  agi: number;
  sta: number;
  int: number;
  spi: number;
  ap: number;
  sp: number;
  critPct: number;
  hastePct: number;
  procs: SetProc[];
}

export function aggregateSetBonuses(counts: ReadonlyMap<string, number>): AggregatedSet {
  const out: AggregatedSet = {
    str: 0,
    agi: 0,
    sta: 0,
    int: 0,
    spi: 0,
    ap: 0,
    sp: 0,
    critPct: 0,
    hastePct: 0,
    procs: [],
  };
  for (const [setId, count] of counts) {
    const set = ITEM_SETS[setId];
    if (set === undefined) continue;
    for (const tier of set.bonuses) {
      if (count < tier.pieces) continue;
      const e = tier.effect;
      out.str += e.str ?? 0;
      out.agi += e.agi ?? 0;
      out.sta += e.sta ?? 0;
      out.int += e.int ?? 0;
      out.spi += e.spi ?? 0;
      out.ap += e.ap ?? 0;
      out.sp += e.sp ?? 0;
      out.critPct += e.critPct ?? 0;
      out.hastePct += e.hastePct ?? 0;
      if (e.proc !== undefined) out.procs.push(e.proc);
    }
  }
  return out;
}

export function equippedSetCounts(
  equips: Partial<Record<EquipSlot, string>>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const itemId of Object.values(equips)) {
    if (itemId === undefined) continue;
    const set = itemDefById(itemId)?.set;
    if (set === undefined) continue;
    counts.set(set, (counts.get(set) ?? 0) + 1);
  }
  return counts;
}

export interface SetPieceStatus {
  setId: string;
  name: string;
  equipped: number;
  tiers: readonly { pieces: number; text: string; active: boolean }[];
}

export function equippedSetStatus(
  equips: Partial<Record<EquipSlot, string>>,
): SetPieceStatus[] {
  const counts = equippedSetCounts(equips);
  const out: SetPieceStatus[] = [];
  for (const [setId, equipped] of counts) {
    const set = ITEM_SETS[setId];
    if (set === undefined) continue;
    out.push({
      setId,
      name: set.name,
      equipped,
      tiers: set.bonuses.map((tier) => ({
        pieces: tier.pieces,
        text: tier.text,
        active: equipped >= tier.pieces,
      })),
    });
  }
  return out;
}
