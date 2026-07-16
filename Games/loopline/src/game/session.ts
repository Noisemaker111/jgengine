import { createEmptyWallet, grant, type WalletState } from "@jgengine/core/economy/wallet";
import { createFootprintGrid, type FootprintGrid } from "@jgengine/core/world/footprintGrid";

import { CASH, GRID, STARTING_CASH } from "./catalog";

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
  grid: FootprintGrid;
  guests: Map<string, GuestState>;
  wallet: WalletState;
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
    grid: createFootprintGrid({ cellSize: GRID }),
    guests: new Map(),
    wallet: grant(createEmptyWallet(), CASH, STARTING_CASH),
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
  session.toasts.push({ id: session.toastSeq, text, tone, at: now });
  if (session.toasts.length > 6) session.toasts.shift();
}
