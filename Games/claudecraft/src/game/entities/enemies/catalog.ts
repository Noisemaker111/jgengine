import type { MobDef } from "../../model";
import { VALE_MOBS } from "./mobs/vale";
import { MARSH_MOBS } from "./mobs/marsh";
import { PEAKS_MOBS } from "./mobs/peaks";
import { DUNGEON_MOBS } from "./mobs/dungeons";

export const MOBS: readonly MobDef[] = [
  ...VALE_MOBS,
  ...MARSH_MOBS,
  ...PEAKS_MOBS,
  ...DUNGEON_MOBS,
];

export function mobById(id: string): MobDef | null {
  for (const m of MOBS) {
    if (m.id === id) return m;
  }
  return null;
}
