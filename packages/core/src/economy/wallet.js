export function createEmptyWallet() {
    return { balances: {} };
}
function assertValidAmount(amount) {
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new RangeError(`amount must be a positive finite number, got ${amount}`);
    }
}
export function balance(state, currency) {
    return state.balances[currency] ?? 0;
}
export function grant(state, currency, amount) {
    assertValidAmount(amount);
    return {
        balances: {
            ...state.balances,
            [currency]: balance(state, currency) + amount,
        },
    };
}
export function charge(state, currency, amount) {
    assertValidAmount(amount);
    const current = balance(state, currency);
    if (current < amount) {
        return { status: "rejected", reason: "insufficient-funds" };
    }
    return {
        status: "ok",
        state: {
            balances: {
                ...state.balances,
                [currency]: current - amount,
            },
        },
    };
}
export function canAfford(state, costs) {
    return Object.entries(costs).every(([currency, amount]) => balance(state, currency) >= amount);
}
export function chargeAll(state, costs) {
    if (!canAfford(state, costs)) {
        return { status: "rejected", reason: "insufficient-funds" };
    }
    const balances = { ...state.balances };
    for (const [currency, amount] of Object.entries(costs)) {
        balances[currency] = balance(state, currency) - amount;
    }
    return { status: "ok", state: { balances } };
}
