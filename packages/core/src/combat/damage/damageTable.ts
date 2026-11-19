import { clamp01 } from "../../math/scalar";

export interface DamageTypeDef {
  id: string;
  vs?: Readonly<Record<string, number>>;
  /** True when armor points never reduce this type. Defaults to false. */
  bypassArmor?: boolean;
}

/**
 * The armor curve: `mitigation = armor / (armor + halfValue)`. Naming the half value instead of a
 * percentage per point is what makes a generated gun's armor number readable — armor equal to
 * `halfValue` halves the hit, and mitigation approaches the cap without ever reaching it.
 */
export interface ArmorConfig {
  halfValue?: number;
  /** Ceiling on the mitigated fraction, so armor never fully negates a hit. Default `0.9`. */
  maxMitigation?: number;
}

export interface DamageTableDef {
  types: readonly DamageTypeDef[];
  defaultMultiplier?: number;
  armor?: ArmorConfig;
}

export interface DamageTableRow {
  type: string;
  resistance: string;
  multiplier: number;
  armor: number;
  mitigation: number;
  net: number;
  damage?: number;
}

/** Raised when a hit names a damage type the table does not define, rather than silently dealing 1×.
 * @capability damage-type-unknown reject a hit whose damage type the table does not define instead of dealing 1×
 */
export class UnknownDamageTypeError extends Error {
  readonly type: string;

  constructor(type: string) {
    super(`Unknown damage type: ${type}`);
    this.name = "UnknownDamageTypeError";
    this.type = type;
  }
}

/** @capability damage-type-duplicate reject a damage table that defines one type twice */
export class DuplicateDamageTypeError extends Error {
  readonly type: string;

  constructor(type: string) {
    super(`Duplicate damage type: ${type}`);
    this.name = "DuplicateDamageTypeError";
    this.type = type;
  }
}

export const DEFAULT_ARMOR_HALF_VALUE = 100;
/** Default ceiling on armor mitigation, so armor never fully negates a hit. */
export const DEFAULT_MAX_MITIGATION = 0.9;

/** @capability damage-table-validate reject a damage table with duplicate types or non-finite multipliers before combat runs */
export function assertDamageTable(table: DamageTableDef): void {
  const seen = new Set<string>();
  for (const type of table.types) {
    if (seen.has(type.id)) throw new DuplicateDamageTypeError(type.id);
    seen.add(type.id);
    for (const [resistance, multiplier] of Object.entries(type.vs ?? {})) {
      if (!Number.isFinite(multiplier) || multiplier < 0) {
        throw new RangeError(`Damage type "${type.id}" has a bad multiplier vs "${resistance}": ${multiplier}`);
      }
    }
  }
  const defaultMultiplier = table.defaultMultiplier ?? 1;
  if (!Number.isFinite(defaultMultiplier) || defaultMultiplier < 0) {
    throw new RangeError(`Damage table defaultMultiplier must be finite and >= 0, got ${defaultMultiplier}`);
  }
}

function findType(table: DamageTableDef, type: string): DamageTypeDef {
  for (const entry of table.types) if (entry.id === type) return entry;
  throw new UnknownDamageTypeError(type);
}

/** @capability armor-mitigation read the fraction of a hit armor removes at a given armor value */
export function armorMitigation(armor: number, config?: ArmorConfig): number {
  const points = Math.max(0, armor);
  if (points <= 0) return 0;
  const halfValue = Math.max(1e-6, config?.halfValue ?? DEFAULT_ARMOR_HALF_VALUE);
  const cap = clamp01(config?.maxMitigation ?? DEFAULT_MAX_MITIGATION);
  return Math.min(cap, points / (points + halfValue));
}

/** @capability damage-table score a data-defined damage type against a resistance class, with the outcome readable as a table */
export function typeMultiplier(table: DamageTableDef, type: string, resistance: string): number {
  const entry = findType(table, type);
  const listed = entry.vs?.[resistance];
  if (listed !== undefined) return listed;
  return table.defaultMultiplier ?? 1;
}

/** @capability armor-bypass ask whether a damage type ignores armor points */
export function typeBypassesArmor(table: DamageTableDef, type: string): boolean {
  return findType(table, type).bypassArmor === true;
}

/**
 * Resolve one hit through the table: type multiplier, then armor mitigation, and the base scaled by
 * both. Formula order matters only for the numbers a UI shows — the product is the same.
 *
 * @capability damage-table-resolve resolve a damage type against a resistance class and armor into a multiplier, mitigation, and final damage
 */
export function resolveTableDamage(
  table: DamageTableDef,
  input: { type: string; resistance: string; armor?: number; base?: number },
): DamageTableRow {
  const multiplier = typeMultiplier(table, input.type, input.resistance);
  const armorPoints = Math.max(0, input.armor ?? 0);
  const mitigation = typeBypassesArmor(table, input.type)
    ? 0
    : armorMitigation(armorPoints, table.armor);
  const net = multiplier * (1 - mitigation);
  const row: DamageTableRow = {
    type: input.type,
    resistance: input.resistance,
    multiplier,
    armor: armorPoints,
    mitigation,
    net,
  };
  if (input.base !== undefined) row.damage = input.base * net;
  return row;
}

function listedResistances(table: DamageTableDef): string[] {
  const seen = new Set<string>();
  for (const type of table.types) for (const resistance of Object.keys(type.vs ?? {})) seen.add(resistance);
  return [...seen].sort();
}

/**
 * Read the whole table as rows — every listed type against every listed resistance class, each with
 * the armor it was read at and the damage a base would land. This is the table a designer reads and
 * a test asserts, so a resistance change is visible without running combat.
 *
 * @capability damage-table-read read a damage table as rows of type × resistance × armor mitigation, with final damage per base
 */
export function readDamageTable(table: DamageTableDef, read?: {
  base?: number;
  armor?: number | Readonly<Record<string, number>>;
  types?: readonly string[];
  resistances?: readonly string[];
}): DamageTableRow[] {
  assertDamageTable(table);
  const types = read?.types ?? table.types.map((entry) => entry.id);
  const resistances = read?.resistances ?? listedResistances(table);
  const rows: DamageTableRow[] = [];
  for (const type of types) {
    for (const resistance of resistances) {
      const armor =
        typeof read?.armor === "number" ? read.armor : (read?.armor?.[resistance] ?? 0);
      const input: { type: string; resistance: string; armor: number; base?: number } = {
        type,
        resistance,
        armor,
      };
      if (read?.base !== undefined) input.base = read.base;
      rows.push(resolveTableDamage(table, input));
    }
  }
  return rows;
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

/** @capability damage-table-format render damage-table rows as fixed-width lines for a probe, a CLI dump, or a test */
export function formatDamageTable(rows: readonly DamageTableRow[]): string[] {
  const typeWidth = Math.max(4, ...rows.map((row) => row.type.length));
  const resistanceWidth = Math.max(10, ...rows.map((row) => row.resistance.length));
  return rows.map((row) => {
    const multiplier = `×${row.multiplier.toFixed(2)}`;
    const mitigation = row.armor > 0 ? `${(row.mitigation * 100).toFixed(0)}%` : "0%";
    const damage = row.damage === undefined ? "" : ` → ${row.damage.toFixed(1)}`;
    return `${pad(row.type, typeWidth)} vs ${pad(row.resistance, resistanceWidth)} ${pad(multiplier, 6)} armor ${pad(String(row.armor), 4)} ${pad(mitigation, 4)} net ×${row.net.toFixed(2)}${damage}`;
  });
}
