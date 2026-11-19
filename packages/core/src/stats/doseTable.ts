import type { VitalDose, Vitals } from "./vitals";

/**
 * Rows of a {@link DoseTable}: per kind of receiver, each source it takes and the doses that source gives
 * it, listed in the receiver's order of preference. A `fallback` row answers for receivers with no row.
 */
export type DoseTableRows = Readonly<Record<string, Readonly<Record<string, readonly VitalDose[]>>>>;

export interface DoseTableOptions {
  fallback?: string;
}

export interface DoseTable {
  /** The doses `source` gives `receiver`, or null when it does not take it. */
  of(receiver: string, source: string): readonly VitalDose[] | null;
  sources(receiver: string): readonly string[];
  pick(receiver: string, accept: (source: string, doses: readonly VitalDose[]) => boolean): string | null;
  retune(rows: DoseTableRows): void;
}

/** @capability dose-table per-receiver effects of each source (food, potion, dart, hit) as vital doses, with preference order */
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

export function hasRoomFor(vitals: Pick<Vitals, "value" | "max">, doses: readonly VitalDose[], vital: string): boolean {
  const gain = doses.reduce((sum, dose) => (dose.vital === vital && dose.amount > 0 ? sum + dose.amount : sum), 0);
  return vitals.max(vital) - vitals.value(vital) >= gain - 1e-9;
}

export interface DoseSupply {
  count(source: string): number;
  take(source: string): boolean;
}

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
