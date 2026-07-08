import { leveling, type Curve, type LevelingTrack } from "@jgengine/core/game/progression";

export const MAX_LEVEL = 40;

export const XP_CURVE: Curve = { kind: "geometric", base: 18, ratio: 1.24, round: "ceil" };

export const LEVELING: LevelingTrack = leveling({ xpForLevel: XP_CURVE, maxLevel: MAX_LEVEL });
