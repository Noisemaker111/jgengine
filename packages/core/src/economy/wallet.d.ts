export interface WalletState {
    balances: Readonly<Record<string, number>>;
}
export type ChargeResult = {
    status: "ok";
    state: WalletState;
} | {
    status: "rejected";
    reason: "insufficient-funds";
};
export declare function createEmptyWallet(): WalletState;
export declare function balance(state: WalletState, currency: string): number;
export declare function grant(state: WalletState, currency: string, amount: number): WalletState;
export declare function charge(state: WalletState, currency: string, amount: number): ChargeResult;
export declare function canAfford(state: WalletState, costs: Readonly<Record<string, number>>): boolean;
export declare function chargeAll(state: WalletState, costs: Readonly<Record<string, number>>): ChargeResult;
