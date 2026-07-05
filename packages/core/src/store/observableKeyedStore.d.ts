export interface ObservableKeyedStore<T> {
    set(key: string, value: T): void;
    delete(key: string): void;
    get(key: string): T | undefined;
    has(key: string): boolean;
    subscribe(listener: () => void): () => void;
    mapSnapshot(): ReadonlyMap<string, T>;
    arraySnapshot(): readonly T[];
}
export declare function createObservableKeyedStore<T>(areEqual?: (previous: T, next: T) => boolean): ObservableKeyedStore<T>;
