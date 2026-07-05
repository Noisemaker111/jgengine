export type SaveScope = "player" | "chunks" | "player+chunks";
export type SaveConfig = "none" | {
    auto: string;
    scope: SaveScope;
};
export declare function parseSaveAutoMs(auto: string): number;
export declare function saveScopeIncludesPlayer(scope: SaveScope): boolean;
export declare function saveScopeIncludesChunks(scope: SaveScope): boolean;
export declare function isSaveEnabled(config: SaveConfig): config is Exclude<SaveConfig, "none">;
