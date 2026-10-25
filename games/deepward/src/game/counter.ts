import { evalCurve, type Curve } from "@jgengine/core/game/progression";
import { createCareerBank, type CareerBankState } from "@jgengine/core/progression/careerBank";
import { createGateSet, gateFacts, type GateStatus } from "@jgengine/core/progression/gates";
import { createStanding, type StandingState } from "@jgengine/core/progression/standing";
import { createItemLedger, salvageItem } from "@jgengine/core/loot/salvage";
import { createTransactionLedger, type LedgerEntry, type LedgerState, type TransactionLedger } from "@jgengine/core/economy/transactionLedger";

import { BREAKDOWN, itemValue, rollItem, type Item, type ItemKind } from "./items";
import type { Home } from "./state";

/** Marrow pays in extraction scrip; nothing else in Halloway is worth carrying home. */
export const SCRIP = { id: "scrip", name: "Extraction scrip", unit: "scrip" };

/** One operator, so the save's standing belongs to the profile rather than an account list. */
export const OPERATOR = "operator";

/** Why scrip moved, as the books record it. The ledger never interprets a reason. */
export const REASON = { haul: "haul", purchase: "purchase", salvage: "salvage", reconcile: "reconcile" } as const;

/** A ledger opened at whatever the counter holds; an empty book is a fresh operator. */
export function openScripBooks(banked = 0): LedgerState {
  const books = createTransactionLedger();
  books.openAccount(OPERATOR, SCRIP.id, banked);
  return books.snapshot();
}

/**
 * Marrow's own books: per-account scrip with a journal that keeps the reason and the balance
 * every movement produced. The career bank still owns haul/standing; this is the record of why
 * the number moved, so a purchase, a salvage payout and a banked haul read back the same way.
 */
export function scripBooks(home: Pick<Home, "bank" | "books" | "revision">): TransactionLedger {
  const books = createTransactionLedger();
  books.restore(home.books);
  // An existing balance is kept; a book opened at zero learns the counter's balance.
  books.openAccount(OPERATOR, SCRIP.id, home.bank.banked);
  const balance = books.balanceOf(OPERATOR, SCRIP.id);
  // The counter's banked number is the truth. A record written before the books existed (or one
  // a migration opened) is squared up with one named entry, so the journal never disagrees with it.
  if (balance !== home.bank.banked) {
    books.post({ at: home.revision, account: OPERATOR, currency: SCRIP.id, amount: home.bank.banked - balance, reason: REASON.reconcile, ref: "bank" });
  }
  return books;
}

/** The journal the counter sheet prints: newest last, capped. */
export function scripJournal(home: Pick<Home, "bank" | "books" | "revision">, limit = 4): LedgerEntry[] {
  return scripBooks(home).entries({ account: OPERATOR, limit });
}

/** Most a single shift's scrip can be worth, so one lucky cache cannot buy out the counter. */
export const HAUL_CAP = 400;

/** Counter stock is pulled from Marrow's own shelf, so a purchase rolls at the shelf's level, not the room's. */
export const PURCHASE_LEVEL = 2;

/** Marrow's regard, in the numbers the counter reads. */
export const STANDING_CONFIG = {
  tracks: [
    {
      id: "marrow",
      label: "Marrow",
      initial: 0,
      min: -60,
      max: 200,
      tiers: [
        { id: "unlogged", min: -60, relation: "neutral" as const },
        { id: "on-file", min: 15, relation: "friendly" as const },
        { id: "trusted", min: 40, relation: "friendly" as const },
        { id: "chartered", min: 80, relation: "friendly" as const },
      ],
    },
  ],
  outcomes: [
    { id: "extracted", label: "Returned by rail", impacts: { marrow: 14 } },
    { id: "lost", label: "Life lost in Bellwether", impacts: { marrow: -10 } },
  ],
};

/** A standing ledger holding whatever the save carries; empty means a fresh operator. */
export function marrowStanding(state?: StandingState) {
  const standing = createStanding(STANDING_CONFIG);
  if (state !== undefined) standing.restore(state);
  return standing;
}

/** One good on the fitter's counter, priced from a curve evaluated at live standing. */
export interface SupplyDef {
  kind: ItemKind;
  label: string;
  blurb: string;
  price: Curve;
}

export const SUPPLIES: readonly SupplyDef[] = [
  { kind: "wire", label: "Copper spool", blurb: "Feeds the Case Bench. Always on the shelf.", price: { kind: "linear", base: 36, per: -0.22, min: 18, round: "round" } },
  { kind: "polymer", label: "Suit seals", blurb: "Tank and armor seals, bought by the sheet.", price: { kind: "linear", base: 46, per: -0.26, min: 24, round: "round" } },
  { kind: "cells", label: "Power cells", blurb: "Station power. The counter wants a name on file.", price: { kind: "linear", base: 64, per: -0.32, min: 34, round: "round" } },
  { kind: "ink", label: "Printer ink", blurb: "Restricted. Sold to operators Marrow trusts.", price: { kind: "linear", base: 128, per: -0.5, min: 70, round: "round" } },
  { kind: "service-rifle", label: "Kessler service rifle", blurb: "Issue stock, stamped on the counter's own press. Rolls its own numbers.", price: { kind: "linear", base: 72, per: -0.5, min: 52, round: "round" } },
];

/** Which standing opens each supply; an id here that no supply carries fails at load. */
const SUPPLY_GATES = [
  { id: "supply_wire", unlock: "wire", label: "Copper spool", requires: { standing: { trackId: "marrow", min: 0 } } },
  { id: "supply_polymer", unlock: "polymer", label: "Suit seals", requires: { standing: { trackId: "marrow", min: 15 } } },
  { id: "supply_cells", unlock: "cells", label: "Power cells", requires: { standing: { trackId: "marrow", min: 40 } } },
  { id: "supply_ink", unlock: "ink", label: "Printer ink", requires: { standing: { trackId: "marrow", min: 80 } } },
];

/**
 * The counter's shelf. Built at load, so a gate naming a supply that does not exist throws here
 * instead of leaving a locked shelf nobody can ever open.
 */
export const COUNTER = createGateSet({
  gates: SUPPLY_GATES,
  catalog: { has: (id) => SUPPLIES.some((supply) => supply.kind === id) },
  standing: marrowStanding(),
});

/** Scrip the counter charges for one unit, at this operator's standing. */
export function priceOf(kind: ItemKind, standing: number): number {
  const supply = SUPPLIES.find((entry) => entry.kind === kind);
  if (supply === undefined) throw new Error(`deepward: no counter price for "${kind}"`);
  return evalCurve(supply.price, standing);
}

/** What one gate needs before it opens, for the shelf's "still needed" line. */
function gateFor(kind: ItemKind) {
  return COUNTER.gates().find((gate) => gate.unlock === kind) ?? null;
}

/** The counter's rows: price at live standing, whether the shelf is open, and what opens it. */
export interface CounterRow {
  supply: SupplyDef;
  price: number;
  locked: boolean;
  needs: number | null;
  missing: GateStatus["missing"];
}

export function counterRows(home: Home): CounterRow[] {
  const standing = marrowStanding(home.standing);
  const facts = gateFacts(standing, OPERATOR, { [SCRIP.id]: home.bank.banked });
  const statuses = COUNTER.status(facts);
  const score = standing.standing(OPERATOR, "marrow");
  return SUPPLIES.map((supply) => {
    const gate = gateFor(supply.kind);
    const status = gate === null ? null : statuses.find((entry) => entry.gate.id === gate.id) ?? null;
    return {
      supply,
      price: priceOf(supply.kind, score),
      locked: status !== null && !status.open,
      needs: gate?.requires?.standing?.min ?? null,
      missing: status?.missing ?? [],
    };
  });
}

/** Buy one unit at the counter; throws with a readable reason when the shelf is shut or scrip is short. */
export function buySupply(home: Home, kind: ItemKind): Home {
  if (home.activeDive !== null || home.reprintPending) throw new Error("Return to Marrow before buying");
  const row = counterRows(home).find((entry) => entry.supply.kind === kind);
  if (row === undefined) throw new Error("The counter does not stock that");
  if (row.locked) throw new Error(`Marrow has not cleared you for ${row.supply.label}`);
  const bank = createCareerBank({ currency: SCRIP, state: home.bank, haulCap: HAUL_CAP });
  if (!bank.spend(row.price)) throw new Error(`Scrip short: ${row.supply.label} costs ${row.price}`);
  const item: Item = rollItem(kind, PURCHASE_LEVEL, `deepward:counter:${home.revision}:${kind}`, `purchase-${home.revision}:${kind}`);
  const books = scripBooks(home);
  const posted = books.post({ at: home.revision, account: OPERATOR, currency: SCRIP.id, amount: -row.price, reason: REASON.purchase, ref: kind });
  if (!posted.ok) throw new Error(`Scrip short: ${row.supply.label} costs ${row.price}`);
  return { ...home, revision: home.revision + 1, stash: [...home.stash, item], bank: bank.snapshot(), books: books.snapshot() };
}

/**
 * Break one banked instance down at the counter. The shared ledger claims it before the yield is
 * computed, so a broken-down item can never be broken down, equipped or paid out a second time.
 */
export function dismantle(home: Home, id: string): { home: Home; scrip: number } {
  if (home.activeDive !== null || home.reprintPending) throw new Error("Return to Marrow before breaking anything down");
  const item = home.stash.find((entry) => entry.id === id);
  if (item === undefined) throw new Error("That item is not in the stash");
  const ledger = createItemLedger(home.ledger);
  const result = salvageItem(item, BREAKDOWN, ledger);
  if (!result.ok) throw new Error(result.reason === "already-spent" ? "That item was already broken down" : "Marrow cannot break that down");
  const bank = createCareerBank({ currency: SCRIP, state: home.bank, haulCap: HAUL_CAP });
  bank.earn(result.yield.amount);
  bank.cashOut();
  const books = scripBooks(home);
  books.post({ at: home.revision, account: OPERATOR, currency: SCRIP.id, amount: result.yield.amount, reason: REASON.salvage, ref: id });
  return {
    home: { ...home, revision: home.revision + 1, stash: home.stash.filter((entry) => entry.id !== id), ledger: ledger.snapshot(), bank: bank.snapshot(), books: books.snapshot() },
    scrip: result.yield.amount,
  };
}

/** Scrip value of a carried haul — what the rail pays if it comes home, and what death takes. */
export function haulScrip(cache: readonly Item[]): number {
  return cache.reduce((total, item) => total + itemValue(item), 0);
}

/** Bank a shift's scrip and move standing: the rail pays and Marrow remembers, a lost Life pays nothing. */
export function settleEconomy(
  home: Home,
  cache: readonly Item[],
  kind: "extracted" | "lost",
  dive = home.revision,
): { bank: CareerBankState; standing: StandingState; scrip: number; books: LedgerState } {
  const bank = createCareerBank({ currency: SCRIP, state: home.bank, haulCap: HAUL_CAP });
  const standing = marrowStanding(home.standing);
  const scrip = haulScrip(cache);
  const books = scripBooks(home);
  bank.earn(scrip);
  if (kind === "extracted") {
    bank.cashOut();
    // The rail pays the haul; a lost Life pays nothing, so its books only record the haul it lost.
    books.post({ at: dive, account: OPERATOR, currency: SCRIP.id, amount: scrip, reason: REASON.haul, ref: `dive-${dive}` });
  } else bank.loseHaul();
  standing.apply(OPERATOR, kind === "extracted" ? "extracted" : "lost");
  return { bank: bank.snapshot(), standing: standing.snapshot(), scrip, books: books.snapshot() };
}
