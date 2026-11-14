import { isFiniteNumber, isRecord } from "@jgengine/core/data/untyped";

/**
 * The self-checkout at the finish line prints the run's receipt: time, cart value and style, each
 * turned into points, plus what the finish place is worth. Escaping is the only way to get a
 * receipt; a cart the shutters catch never reaches the scanner.
 */
export interface CheckoutInput {
  time: number;
  /** The track's par, seconds. */
  par: number;
  /** Dollars of goods and unused power-ups in the basket. */
  cartValue: number;
  style: number;
  /** Finish place, or 0 when the run had no field. */
  place: number;
  items: number;
}

export interface ReceiptLine {
  label: string;
  points: number;
}

export interface Receipt {
  lines: readonly ReceiptLine[];
  total: number;
}

/** Points per second under one and a half par. */
export const TIME_POINTS = 25;
/** Points per dollar in the basket. */
export const VALUE_POINTS = 2;
export const PLACE_POINTS: readonly number[] = [500, 250, 100];

export function checkoutReceipt(run: CheckoutInput): Receipt {
  const lines: ReceiptLine[] = [];
  const clock = Math.max(0, Math.round((run.par * 1.5 - run.time) * TIME_POINTS));
  lines.push({ label: `CLOCK ${run.time.toFixed(1)}s (par ${run.par}s)`, points: clock });
  const value = Math.round(run.cartValue * VALUE_POINTS);
  lines.push({ label: `CART ${run.items} item${run.items === 1 ? "" : "s"} · $${run.cartValue.toFixed(0)}`, points: value });
  lines.push({ label: "STYLE", points: Math.round(run.style) });
  const place = run.place >= 1 && run.place <= PLACE_POINTS.length ? PLACE_POINTS[run.place - 1]! : 0;
  if (place > 0) lines.push({ label: `FINISHED P${run.place}`, points: place });
  return { lines, total: lines.reduce((sum, line) => sum + line.points, 0) };
}

/** Best receipt total per event, kept beside the career. */
export const RECEIPTS_KEY = "drift-foundry.receipts.v1";

export interface ReceiptStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readBestReceipts(storage: ReceiptStorage | undefined): Record<string, number> {
  if (storage === undefined) return {};
  try {
    const raw: unknown = JSON.parse(storage.getItem(RECEIPTS_KEY) ?? "{}");
    if (!isRecord(raw)) return {};
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(raw)) if (isFiniteNumber(value) && value >= 0) out[key] = value;
    return out;
  } catch {
    return {};
  }
}

/** Keep `total` as the event's best receipt when it beats the saved one; true when it did. */
export function saveBestReceipt(storage: ReceiptStorage | undefined, eventId: string, total: number): boolean {
  const best = readBestReceipts(storage);
  if ((best[eventId] ?? -1) >= total) return false;
  best[eventId] = total;
  try {
    storage?.setItem(RECEIPTS_KEY, JSON.stringify(best));
  } catch {
    return false;
  }
  return true;
}
