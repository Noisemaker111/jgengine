import { fromMinorUnits, toMinorUnits, type CurrencyDefinition } from "../economy/currency";
import { charge, createEmptyWallet, grant, type WalletState } from "../economy/wallet";

/**
 * Everything a career bank stores, as plain JSON. `banked` is the persistent balance; `haul` is
 * the run in progress and is the part a failed run loses. `deposited`, `lost`, `bestHaul` and
 * `runs` are lifetime counters a results screen reads.
 */
export interface CareerBankState {
  banked: number;
  haul: number;
  deposited: number;
  lost: number;
  bestHaul: number;
  runs: number;
}

/** Configuration for {@link createCareerBank}. */
export interface CareerBankConfig {
  currency: CurrencyDefinition;
  /** Persistent money before any run (default `0`). */
  start?: number;
  /** Most a single run's haul can carry; omitted means no cap. */
  haulCap?: number;
  /** Rehydrate from a prior {@link CareerBank.snapshot}. */
  state?: CareerBankState;
}

/** Persistent career money plus the run in progress, which a failed run loses. */
export interface CareerBank {
  currency(): CurrencyDefinition;
  /** Money kept between runs. */
  banked(): number;
  /** Money earned this run and not yet banked or lost. */
  haul(): number;
  /** Add to the run's haul (capped by `haulCap`); negative or non-finite is ignored. Returns the haul. */
  earn(amount: number): number;
  /** Bank the haul: it becomes persistent and the run's haul resets. */
  cashOut(): { deposited: number; banked: number };
  /** The run failed: the haul is gone, persistent money is untouched. */
  loseHaul(): { lost: number; banked: number };
  /** Pay from persistent money; `false` when it cannot cover the amount. */
  spend(amount: number): boolean;
  afford(amount: number): boolean;
  counters(): { deposited: number; lost: number; bestHaul: number; runs: number };
  snapshot(): CareerBankState;
  restore(next: CareerBankState): void;
}

function sanitizeAmount(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Money that means something between runs: a persistent balance plus a run's haul that is banked on
 * a cash-out and lost on a failure. Amounts are snapped to the currency's minor units, so a save
 * round-trip and a display never drift. Pair it with `economy/upgrades` for a career upgrade tree.
 *
 * @capability career-bank persistent career money with a run haul that can be banked or lost
 */
export function createCareerBank(config: CareerBankConfig): CareerBank {
  const currency = config.currency;
  const snap = (amount: number): number => fromMinorUnits(currency, toMinorUnits(currency, sanitizeAmount(amount)));
  const haulCap = config.haulCap === undefined ? Number.POSITIVE_INFINITY : snap(config.haulCap);

  const walletOf = (bankedAmount: number): WalletState =>
    bankedAmount > 0 ? grant(createEmptyWallet(), currency, bankedAmount) : createEmptyWallet();
  let wallet: WalletState = walletOf(snap(config.start ?? 0));
  let haul = 0;
  let deposited = 0;
  let lost = 0;
  let bestHaul = 0;
  let runs = 0;

  const banked = (): number => wallet.balances[currency.id] ?? 0;

  if (config.state !== undefined) {
    wallet = walletOf(snap(config.state.banked));
    haul = snap(config.state.haul);
    deposited = snap(config.state.deposited);
    lost = snap(config.state.lost);
    bestHaul = snap(config.state.bestHaul);
    runs = Number.isInteger(config.state.runs) && config.state.runs > 0 ? config.state.runs : 0;
  }

  return {
    currency: () => currency,
    banked,
    haul: () => haul,
    earn(amount) {
      const added = snap(amount);
      if (added > 0) haul = snap(Math.min(haul + added, haulCap));
      return haul;
    },
    cashOut() {
      const held = haul;
      if (held > 0) {
        wallet = grant(wallet, currency, held);
        deposited = snap(deposited + held);
        bestHaul = Math.max(bestHaul, held);
      }
      haul = 0;
      runs += 1;
      return { deposited: held, banked: banked() };
    },
    loseHaul() {
      const gone = haul;
      haul = 0;
      lost = snap(lost + gone);
      runs += 1;
      return { lost: gone, banked: banked() };
    },
    spend(amount) {
      const cost = snap(amount);
      if (cost <= 0) return false;
      const paid = charge(wallet, currency, cost);
      if (paid.status !== "ok") return false;
      wallet = paid.state;
      return true;
    },
    afford: (amount) => banked() >= snap(amount),
    counters: () => ({ deposited, lost, bestHaul, runs }),
    snapshot: () => ({ banked: banked(), haul, deposited, lost, bestHaul, runs }),
    restore(next) {
      wallet = walletOf(snap(next.banked));
      haul = snap(next.haul);
      deposited = snap(next.deposited);
      lost = snap(next.lost);
      bestHaul = snap(next.bestHaul);
      runs = Number.isInteger(next.runs) && next.runs > 0 ? next.runs : 0;
    },
  };
}
