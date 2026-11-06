import type { VitalDose, Vitals } from "./vitals";

/**
 * Rows of a {@link DoseTable}: per kind of receiver, each source it takes and the doses that source gives
 * it, listed in the receiver's order of preference. A `fallback` row answers for receivers with no row.
 */
export type DoseTableRows = Readonly<Record<string, Readonly<Record<string, readonly VitalDose[]>>>>;

export interface DoseTableOptions {
  /** The row a receiver with no row of its own reads (everyone drinks a potion the same way). */
  fallback?: string;
}

/** What each source does to each kind of receiver. Pure data; `retune` swaps the rows. */
export interface DoseTable {
  /** The doses `source` gives `receiver`, or null when it does not take it. */
  of(receiver: string, source: string): readonly VitalDose[] | null;
  /** Every source `receiver` takes, most preferred first. */
  sources(receiver: string): readonly string[];
  /** The receiver's most preferred source that `accept` passes (it holds one, it has room for it), or null. */
  pick(receiver: string, accept: (source: string, doses: readonly VitalDose[]) => boolean): string | null;
  retune(rows: DoseTableRows): void;
}

/**
 * What each source does to each kind of receiver, as {@link VitalDose}s: a raptor's foods and how much
 * taming, food and ineffectiveness each gives, a sim's meals and the needs they fill, a shooter's potions and
 * the shield each pours in up to its cap, a dart's torpor by the body it lands in. Sources are listed in the
 * receiver's order of preference, so "eats the first food it likes that it holds" is one `pick`.
 *
 * @capability dose-table per-receiver effects of each source (food, potion, dart, hit) as vital doses, with preference order
 */
export function createDoseTable(rows: DoseTableRows, options: DoseTableOptions = {}): DoseTable {
  let table = rows;
  const rowOf = (receiver: string) => table[receiver] ?? (options.fallback === undefined ? undefined : table[options.fallback]);
  return {
    of: (receiver, source) => rowOf(receiver)?.[source] ?? null,
    sources: (receiver) => Object.keys(rowOf(receiver) ?? {}),
    pick(receiver, accept) {
      for (const [source, doses] of Object.entries(rowOf(receiver) ?? {})) if (accept(source, doses)) return source;
      return null;
    },
    retune(next) {
      table = next;
    },
  };
}

/** Whether `vitals` has room for every gain the doses put into `vital` (a creature eats once its food has room for the meal). */
export function hasRoomFor(vitals: Pick<Vitals, "value" | "max">, doses: readonly VitalDose[], vital: string): boolean {
  const gain = doses.reduce((sum, dose) => (dose.vital === vital && dose.amount > 0 ? sum + dose.amount : sum), 0);
  return vitals.max(vital) - vitals.value(vital) >= gain - 1e-9;
}

/** What a body can eat or drink from: how many of a source it holds, and taking one. An inventory, a trough, a fridge. */
export interface DoseSupply {
  count(source: string): number;
  take(source: string): boolean;
}

/**
 * Eat from `supply` while there is room: each time, the receiver's most preferred source it holds whose
 * gain to `vital` fits under the max is taken and its doses go into `body`. A tame eating from its own
 * inventory, a sim at the fridge, a baby fed what it is given. Returns the sources eaten, in order.
 */
export function eatWhileRoom(body: Pick<Vitals, "value" | "max" | "dose">, table: DoseTable, receiver: string, supply: DoseSupply, vital: string, limit = 64): string[] {
  const eaten: string[] = [];
  while (eaten.length < limit) {
    const source = table.pick(receiver, (candidate, doses) => supply.count(candidate) > 0 && hasRoomFor(body, doses, vital));
    if (source === null || !supply.take(source)) break;
    body.dose(...(table.of(receiver, source) ?? []));
    eaten.push(source);
  }
  return eaten;
}
