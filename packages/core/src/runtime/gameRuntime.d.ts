import type { SaveConfig } from "./save";
import type { CommandDef } from "./commandRunner";
import { runCommand } from "./commandRunner";
import { type GameRuntimeSnapshot, type RuntimeChunkRow, type RuntimePlayerRow, type RuntimeProfileRow, type RuntimeServerRow } from "./snapshot";
export type ServerLoopHooks = {
    onInit?: (ctx: RuntimeInitContext) => void;
    onNewPlayer?: (ctx: RuntimeLoopContext) => void;
    onTick?: (ctx: RuntimeLoopContext, dtSeconds: number) => void;
};
export type RuntimeInitContext = {
    snapshot: GameRuntimeSnapshot;
    setSnapshot: (snapshot: GameRuntimeSnapshot) => void;
};
export type RuntimeLoopContext = RuntimeInitContext & {
    player: {
        userId: string;
        isNew: boolean;
    };
};
export type GameRuntimeDefinition = {
    gameId: string;
    save: SaveConfig;
    commands: Record<string, CommandDef>;
    loop?: ServerLoopHooks;
};
export type HydrateInput = {
    gameId: string;
    serverId: string;
    serverRow: RuntimeServerRow;
    playersByUserId: Record<string, RuntimePlayerRow>;
    chunksByKey: Record<string, RuntimeChunkRow>;
};
export type GameRuntime = {
    gameId: string;
    save: SaveConfig;
    hydrate: (input: HydrateInput) => GameRuntimeSnapshot;
    runCommand: (snapshot: GameRuntimeSnapshot, actorUserId: string, commandName: string, input: unknown) => ReturnType<typeof runCommand>;
    tick: (snapshot: GameRuntimeSnapshot, dtSeconds: number) => GameRuntimeSnapshot;
    joinPlayer: (snapshot: GameRuntimeSnapshot, userId: string, isNew: boolean) => GameRuntimeSnapshot;
    toProfileRow: (snapshot: GameRuntimeSnapshot, userId: string) => RuntimeProfileRow | null;
};
export declare function createGameRuntime(definition: GameRuntimeDefinition): GameRuntime;
