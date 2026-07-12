export type PetRole = "dps" | "tank" | "support";

export interface PetDef {
  id: string;
  name: string;
  family: "beast" | "demon";
  role: PetRole;
  classId: "hunter" | "warlock";
  hpBase: number;
  hpPerLevel: number;
  dmgBase: number;
  dmgPerLevel: number;
  attackSpeed: number;
  moveSpeed: number;
  levelReq: number;
}

export const PETS: readonly PetDef[] = [
  {
    id: "pet_wolf",
    name: "Tamed Wolf",
    family: "beast",
    role: "dps",
    classId: "hunter",
    hpBase: 55,
    hpPerLevel: 16,
    dmgBase: 5,
    dmgPerLevel: 1.4,
    attackSpeed: 2,
    moveSpeed: 8,
    levelReq: 1,
  },
  {
    id: "pet_boar",
    name: "Tamed Boar",
    family: "beast",
    role: "tank",
    classId: "hunter",
    hpBase: 80,
    hpPerLevel: 22,
    dmgBase: 3,
    dmgPerLevel: 1,
    attackSpeed: 2.4,
    moveSpeed: 6.5,
    levelReq: 10,
  },
  {
    id: "pet_imp",
    name: "Emberkin",
    family: "demon",
    role: "dps",
    classId: "warlock",
    hpBase: 30,
    hpPerLevel: 12,
    dmgBase: 5,
    dmgPerLevel: 1.1,
    attackSpeed: 2,
    moveSpeed: 7,
    levelReq: 1,
  },
  {
    id: "pet_voidwalker",
    name: "Gloomshade",
    family: "demon",
    role: "tank",
    classId: "warlock",
    hpBase: 70,
    hpPerLevel: 28,
    dmgBase: 4,
    dmgPerLevel: 0.75,
    attackSpeed: 2,
    moveSpeed: 6.5,
    levelReq: 10,
  },
  {
    id: "pet_felhunter",
    name: "Spellhound",
    family: "demon",
    role: "dps",
    classId: "warlock",
    hpBase: 46,
    hpPerLevel: 18,
    dmgBase: 6,
    dmgPerLevel: 1.7,
    attackSpeed: 2,
    moveSpeed: 7.5,
    levelReq: 14,
  },
  {
    id: "pet_succubus",
    name: "Duskborn",
    family: "demon",
    role: "dps",
    classId: "warlock",
    hpBase: 34,
    hpPerLevel: 14,
    dmgBase: 7,
    dmgPerLevel: 2.1,
    attackSpeed: 1.7,
    moveSpeed: 7.2,
    levelReq: 16,
  },
];

export function petById(id: string): PetDef | null {
  for (const pet of PETS) {
    if (pet.id === id) return pet;
  }
  return null;
}

export function defaultPetForClass(classId: string): PetDef | null {
  for (const pet of PETS) {
    if (pet.classId === classId && pet.levelReq <= 1) return pet;
  }
  return null;
}

export const PET_ABILITY_IDS = {
  call_pet: "call_pet",
  dismiss_pet: "dismiss_pet",
  revive_pet: "revive_pet",
  summon_imp: "summon_imp",
  summon_voidwalker: "summon_voidwalker",
  summon_felhunter: "summon_felhunter",
  summon_succubus: "summon_succubus",
} as const;
