import { type OnDeathSpec } from "../combat/death";
import { type EffectInput, type EffectResult, type ReceiveMap, type SingleTargetEffectInput } from "../combat/effects";
import { type ProjectileSystem } from "../combat/projectiles";
import { type CommandDefinition, type CommandResult } from "../commands/commandRegistry";
import type { GameDefinition } from "../game/defineGame";
import { type GameEventMap, type GameEvents } from "../game/events";
import { type GameFeed } from "../game/feed";
import { type Leaderboard } from "../game/leaderboard";
import { type Loadouts } from "../game/loadout";
import { type Drop, type LootTableDef } from "../game/lootTable";
import { type QuestJournal } from "../game/quest";
import { type Social } from "../game/social";
import { type TradeField, type TradeSystem } from "../game/trade";
import { type Unlocks } from "../game/unlocks";
import { type InventorySet } from "../inventory/inventoryModel";
import { type ItemUseHandler, type ItemUseInput, type ItemUseRejection, type ItemUseResult } from "../item/use";
import { type WeaponStats } from "../item/weapon";
import { type PoseAllowedStates, type PoseState } from "../movement/poseState";
import type { ModelAssetRef } from "../scene/assetCatalog";
import { type EntityStatsApi, type PoolStatCatalog } from "../scene/entityStats";
import type { EntityPose, SceneEntity, SpawnOptions } from "../scene/entityStore";
import { type ObjectStore } from "../scene/objectStore";
import { type SpatialApi } from "../scene/spatial";
import { type CycleTargetOptions } from "../scene/targeting";
import { type Stats } from "../stats/statModifiers";
export interface GameContextItemEntry {
    use?: string;
    weapon?: Record<string, unknown>;
    trade?: TradeField;
}
export interface GameContextEntityEntry {
    stats?: PoolStatCatalog;
    receive?: ReceiveMap;
    onDeath?: OnDeathSpec;
    movement?: PoseAllowedStates & {
        walkSpeed?: number;
    };
    role?: string;
}
export interface GameContextContent {
    itemById?(itemId: string): GameContextItemEntry | null | undefined;
    entityById?(catalogId: string): GameContextEntityEntry | null | undefined;
}
export interface GameContextOptions<TAssetRef extends ModelAssetRef = ModelAssetRef, TMultiplayer = unknown> {
    definition: GameDefinition<TAssetRef, TMultiplayer>;
    content: GameContextContent;
    player: {
        userId: string;
        isNew: boolean;
    };
    now?: () => number;
}
export interface SceneEntityContext {
    spawn(name: string, options?: SpawnOptions): string;
    despawn(instanceId: string): boolean;
    setPose(instanceId: string, pose: EntityPose): boolean;
    get(instanceId: string): SceneEntity | null;
    list(): readonly SceneEntity[];
    stats: EntityStatsApi;
    setTarget(fromId: string, toId: string | null): void;
    getTarget(fromId: string): string | null;
    cycleTarget(fromId: string, options?: CycleTargetOptions): string | null;
    canReceive(instanceId: string, effect: string): string | null;
    preview(input: SingleTargetEffectInput): number;
    effect(input: EffectInput): EffectResult[];
    willHitProjectile: ProjectileSystem["willHitProjectile"];
    fireProjectile: ProjectileSystem["fireProjectile"];
    settleProjectile: ProjectileSystem["settleProjectile"];
    distance: SpatialApi["distance"];
    inRadius: SpatialApi["inRadius"];
    hasLineOfSight: SpatialApi["hasLineOfSight"];
    queryArc: SpatialApi["queryArc"];
    moveToward: SpatialApi["moveToward"];
}
export interface GameContextCommands {
    define<TInput>(name: string, definition: CommandDefinition<GameContext, TInput>): void;
    has(name: string): boolean;
    names(): string[];
    run(name: string, input: unknown): CommandResult<GameContext>;
}
export interface GameContextFeed extends Omit<GameFeed, "bind"> {
    bind(action: keyof GameEventMap): () => void;
}
export interface GameContextLoot {
    register(def: LootTableDef): void;
    has(id: string): boolean;
    roll(id: string, rng?: () => number): Drop[];
    grantToPlayer(userId: string, drops: Drop[], source?: string): void;
}
export interface GameContextEconomy {
    balance(userId: string, currencyId: string): number;
    grant(userId: string, currencyId: string, amount: number): void;
    charge(userId: string, currencyId: string, amount: number): {
        reason: string;
    } | null;
}
export interface GameContextItemUse {
    register(handlers: Record<string, ItemUseHandler<GameContext>>): void;
    registered(): string[];
    can(input: ItemUseInput): ItemUseRejection | null;
    use(input: ItemUseInput): ItemUseResult<GameContext>;
}
export interface GameContext {
    scene: {
        object: ObjectStore;
        entity: SceneEntityContext;
    };
    game: {
        commands: GameContextCommands;
        events: GameEvents;
        feed: GameContextFeed;
        loot: GameContextLoot;
        trade: TradeSystem;
        quest: QuestJournal;
        social: Social;
        unlocks: Unlocks;
        economy: GameContextEconomy;
        leaderboard: Leaderboard;
    };
    player: {
        userId: string;
        isNew: boolean;
        inventory: InventorySet<string>;
        stats: Stats<string>;
        loadout: Loadouts;
        applyLoadout(userId: string, loadoutId: string): {
            reason: string;
        } | null;
        movement: PoseState;
    };
    item: {
        use: GameContextItemUse;
        weapon: WeaponStats;
    };
    subscribe(listener: () => void): () => void;
    version(): number;
}
export declare function createGameContext<TAssetRef extends ModelAssetRef, TMultiplayer>(options: GameContextOptions<TAssetRef, TMultiplayer>): GameContext;
