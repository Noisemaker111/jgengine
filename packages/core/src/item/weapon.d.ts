export interface WeaponEntry {
    weapon?: Record<string, unknown>;
}
export declare function getWeaponStat(entry: WeaponEntry | null | undefined, stat: string): number | null;
export interface WeaponStats {
    getStat(itemId: string, stat: string): number | null;
}
export declare function createWeaponStats(resolveEntry: (itemId: string) => WeaponEntry | null | undefined): WeaponStats;
