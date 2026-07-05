export interface ChangeSignal {
    subscribe(listener: () => void): () => void;
    notify(): void;
    version(): number;
}
export declare function createChangeSignal(): ChangeSignal;
export declare function notifyAfter<T extends object, K extends keyof T>(target: T, methods: readonly K[], notify: () => void): T;
