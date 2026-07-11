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
    name: "Imp",
    family: "demon",
    role: "dps",
    classId: "warlock",
    hpBase: 40,
    hpPerLevel: 10,
    dmgBase: 6,
    dmgPerLevel: 1.8,
    attackSpeed: 2.2,
    moveSpeed: 7,
    levelReq: 1,
  },
  {
    id: "pet_voidwalker",
    name: "Voidwalker",
    family: "demon",
    role: "tank",
    classId: "warlock",
    hpBase: 90,
    hpPerLevel: 24,
    dmgBase: 3,
    dmgPerLevel: 0.9,
    attackSpeed: 2.5,
    moveSpeed: 6,
    levelReq: 10,
  },
  {
    id: "pet_felhunter",
    name: "Felhunter",
    family: "demon",
    role: "dps",
    classId: "warlock",
    hpBase: 60,
    hpPerLevel: 14,
    dmgBase: 5,
    dmgPerLevel: 1.5,
    attackSpeed: 2,
    moveSpeed: 7.5,
    levelReq: 14,
  },
  {
    id: "pet_succubus",
    name: "Succubus",
    family: "demon",
    role: "dps",
    classId: "warlock",
    hpBase: 55,
    hpPerLevel: 13,
    dmgBase: 7,
    dmgPerLevel: 1.6,
    attackSpeed: 1.9,
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
