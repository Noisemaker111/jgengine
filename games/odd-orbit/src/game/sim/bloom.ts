import type { BloomCrop } from "../session/types";

/** Export sacrifices three ration crystals for twelve immediately spendable credits. */
export function bloomHarvest(crop: BloomCrop, friend: boolean): { rations: number; credits: number } {
  return { rations: (crop === "export" ? 1 : 4) + (friend ? 1 : 0), credits: (crop === "export" ? 60 : 48) + (friend ? 12 : 0) };
}
