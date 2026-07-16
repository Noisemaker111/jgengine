import { leveling } from "@jgengine/core/game/progression";
export const MAX_LEVEL = 20;
export const XP_TABLE = [
    400, 900, 1400, 2100, 2800, 3600, 4500, 5400, 6500, 7600, 8800, 10100, 11400, 12900, 14400,
    16000, 17700, 19400, 21300, 23200,
];
export const GROUP_XP_BONUS = [1, 1, 1.166, 1.3, 1.43];
export const levelTrack = leveling({
    xpForLevel: { kind: "steps", values: [XP_TABLE[0], ...XP_TABLE] },
    maxLevel: MAX_LEVEL,
});
function zeroDiff(playerLevel) {
    if (playerLevel <= 7)
        return 5;
    if (playerLevel <= 9)
        return 6;
    if (playerLevel <= 15)
        return 7;
    return 8;
}
export function killXp(playerLevel, mobLevel) {
    const base = 45 + 5 * mobLevel;
    const diff = mobLevel - playerLevel;
    if (diff >= 0)
        return Math.round(base * (1 + 0.05 * Math.min(diff, 4)));
    const zd = zeroDiff(playerLevel);
    if (-diff >= zd)
        return 0;
    return Math.round(base * (1 - -diff / zd));
}
export function groupXpMultiplier(partySize) {
    return GROUP_XP_BONUS[Math.min(Math.max(partySize, 1), GROUP_XP_BONUS.length) - 1];
}
