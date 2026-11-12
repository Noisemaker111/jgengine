import { registerMissionMarkerKind } from "@jgengine/core/mission/triggers";

import { MAST_WATCH } from "./game/mastMission";

/**
 * Scrap Signal's editor kinds. Imported for its side effect by `editorLayers.ts` (which the editor
 * always loads for this game) and by the mast runtime: `mission_marker` becomes a click-to-place tool
 * whose inspector lists the game's mission, objective and fail-state ids, and the mission trigger
 * actions resolve their params. The Mast Watch board is one of these markers.
 */
export const MISSION_MARKER = registerMissionMarkerKind([MAST_WATCH]);
