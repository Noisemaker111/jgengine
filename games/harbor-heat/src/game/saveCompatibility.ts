import { localSaveBackend, type SaveBackend } from "@jgengine/core/game/saveStore";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { loadLegacySave } from "../../../shared/legacySave";

// Historical identifiers are a save-format compatibility contract, never product copy.
const LEGACY_IDS: Readonly<Record<string, string>> = {
  "obj_vcpd_sign": "obj_hhpd_sign",
  "ocean_drive": "mainsail_boulevard",
  "vcpd_station": "hhpd_station",
  "vice-dunes": "harbor-dunes",
  "vice-isle": "harbor-heat",
  "vice-isle-06": "harbor-heat-06",
  "vice-isle-cops": "harbor-heat-cops",
  "vice-isle-lots": "harbor-heat-lots",
  "vice-isle-setup": "harbor-heat-setup",
  "vice-palms": "harbor-palms",
  "vice.bestRace": "harbor.bestRace",
  "vice.bounty": "harbor.bounty",
  "vice.continue": "harbor.continue",
  "vice.convoyStage": "harbor.convoyStage",
  "vice.driving": "harbor.driving",
  "vice.garage": "harbor.garage",
  "vice.log": "harbor.log",
  "vice.mission": "harbor.mission",
  "vice.race": "harbor.race",
  "vice.safehouse": "harbor.safehouse",
  "vice.shop": "harbor.shop",
  "vice.slot": "harbor.slot",
  "vice.started": "harbor.started",
  "vice.stashes": "harbor.stashes",
  "vice.wanted": "harbor.wanted"
};

/** Prefer current saves; import an existing legacy slot once without changing its bytes. */
export async function loadSavedProgress(ctx: GameContext, backend: SaveBackend = localSaveBackend()): Promise<boolean> {
  return loadLegacySave(ctx.game.save, backend, "jgengine:save:vice-isle", "jgengine:save:harbor-heat", LEGACY_IDS);
}
