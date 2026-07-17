import { appendFeed } from "@jgengine/core/game/feed";
import {
  addScheduledRule,
  createResourceLedger,
  type ResourceLedger,
} from "@jgengine/core/economy/resourceLedger";

import { DAY_LENGTH, STARTING_CASH } from "./catalog";

/**
 * The park's money as a serializable scheduled-transaction ledger. The daily upkeep+restock
 * charge is a recurring rule settled deterministically by the core `resourceLedger`; the nominal
 * amount is `0` because the real per-day cost comes from live park metrics via a policy at
 * settlement time (see `settleDailyUpkeep`).
 */
export function createParkLedger(): ResourceLedger {
  return addScheduledRule(createResourceLedger({ accounts: { park: { cash: STARTING_CASH } } }), {
    id: "daily-upkeep",
    currency: "cash",
    amount: 0,
    everySeconds: DAY_LENGTH,
    startSeconds: DAY_LENGTH,
    source: "park",
  });
}

export interface PlacedObject {
  id: string;
  catalogId: string;
  x: number;
  z: number;
  stock: number;
  soldTotal: number;
  occupants: number;
}

export type GuestPhase = "seeking" | "busy" | "leaving";

export interface GuestState {
  id: string;
  kind: string;
  happy: number;
  money: number;
  hunger: number;
  thirst: number;
  souvenir: number;
  visits: number;
  phase: GuestPhase;
  targetId: string | null;
  target: readonly [number, number, number] | null;
  busy: number;
  litterTimer: number;
}

export type Tone = "good" | "bad" | "info";

export interface Toast {
  id: number;
  text: string;
  tone: Tone;
  at: number;
}

export interface Session {
  selectedTool: string | null;
  selectedObject: string | null;
  placed: Map<string, PlacedObject>;
  occupied: Map<string, string>;
  guests: Map<string, GuestState>;
  cash: number;
  ledger: ResourceLedger;
  rating: number;
  happinessAvg: number;
  litter: number;
  ticketPrice: number;
  day: number;
  open: boolean;
  guestsToday: number;
  revenueToday: number;
  revenueYesterday: number;
  upkeepYesterday: number;
  spawnAcc: number;
  guestSeq: number;
  objectSeq: number;
  toastSeq: number;
  toasts: Toast[];
  bankruptDays: number;
  gameOver: boolean;
  started: boolean;
}

function freshSession(): Session {
  return {
    selectedTool: null,
    selectedObject: null,
    placed: new Map(),
    occupied: new Map(),
    guests: new Map(),
    cash: STARTING_CASH,
    ledger: createParkLedger(),
    rating: 0,
    happinessAvg: 55,
    litter: 0,
    ticketPrice: 18,
    day: 1,
    open: false,
    guestsToday: 0,
    revenueToday: 0,
    revenueYesterday: 0,
    upkeepYesterday: 0,
    spawnAcc: 0,
    guestSeq: 0,
    objectSeq: 0,
    toastSeq: 0,
    toasts: [],
    bankruptDays: 0,
    gameOver: false,
    started: false,
  };
}

export const session: Session = freshSession();

export function resetSession(): void {
  Object.assign(session, freshSession());
}

export function nextObjectId(catalogId: string): string {
  session.objectSeq += 1;
  return `${catalogId}#${session.objectSeq}`;
}

export function nextGuestId(): string {
  session.guestSeq += 1;
  return `guest#${session.guestSeq}`;
}

export function pushToast(text: string, tone: Tone, now: number): void {
  session.toastSeq += 1;
  // Count-capped flat feed: the shared primitive keeps the newest 6, same as the old push/shift.
  session.toasts = appendFeed(session.toasts, { id: session.toastSeq, text, tone, at: now }, { limit: 6 });
}
