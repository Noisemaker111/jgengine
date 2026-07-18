import type { ClassDef } from "../model";
import { WARRIOR_CLASS } from "./definitions/warrior";
import { MAGE_CLASS } from "./definitions/mage";
import { ROGUE_CLASS } from "./definitions/rogue";
import { PALADIN_CLASS } from "./definitions/paladin";
import { HUNTER_CLASS } from "./definitions/hunter";
import { PRIEST_CLASS } from "./definitions/priest";
import { SHAMAN_CLASS } from "./definitions/shaman";
import { WARLOCK_CLASS } from "./definitions/warlock";
import { DRUID_CLASS } from "./definitions/druid";

export const CLASSES: readonly ClassDef[] = [
  ...WARRIOR_CLASS,
  ...MAGE_CLASS,
  ...ROGUE_CLASS,
  ...PALADIN_CLASS,
  ...HUNTER_CLASS,
  ...PRIEST_CLASS,
  ...SHAMAN_CLASS,
  ...WARLOCK_CLASS,
  ...DRUID_CLASS,
];

export function classById(id: string): ClassDef {
  const found = CLASSES.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown class id: ${id}`);
  return found;
}
