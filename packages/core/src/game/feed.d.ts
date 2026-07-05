import type { GameEventMap, GameEvents } from "./events";
export interface FeedEntry<T = unknown> {
    at: number;
    data: T;
}
export interface GameFeedOptions {
    limit?: number;
}
export interface GameFeed {
    bind<TName extends keyof GameEventMap>(action: TName, events: GameEvents): () => void;
    push(action: string, entry: unknown): void;
    recent(action: string, options?: {
        limit?: number;
    }): FeedEntry[];
    subscribe(action: string, listener: (entry: FeedEntry) => void): () => void;
    snapshot(): Record<string, FeedEntry[]>;
    hydrate(data: Record<string, FeedEntry[]>): void;
}
export declare function createGameFeed(options?: GameFeedOptions): GameFeed;
