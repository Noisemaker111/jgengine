import { ARMOR_SAVE_BUMP } from "../run/constants";
import { isCaught } from "./schedule";

export type CrusherContact =
  | { outcome: "clear" }
  | { outcome: "saved"; reboundZ: number }
  | { outcome: "crushed" };

export function resolveCrusherContact(kartZ: number, compactorZ: number, armorSaveArmed: boolean): CrusherContact {
  if (!isCaught(kartZ, compactorZ)) return { outcome: "clear" };
  if (armorSaveArmed) return { outcome: "saved", reboundZ: compactorZ + ARMOR_SAVE_BUMP };
  return { outcome: "crushed" };
}
