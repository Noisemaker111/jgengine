export type ResistVerdict = "immune" | "resist" | "normal" | "vulnerable";

/**
 * A single matrix cell: either a named {@link ResistVerdict} (resolved through the multiplier table)
 * or a raw scalar multiplier for a value the four named verdicts can't express — e.g. `0.9` for a mild
 * resistance that is neither `resist` (0.5) nor `normal` (1). A `0` scalar zeroes the damage but, unlike
 * `"immune"`, does not set the `immune` flag.
 */
export type ResistanceCell = ResistVerdict | number;

export class UnknownResistanceCategoryError extends Error {
  readonly category: string;

  constructor(category: string) {
    super(`Unknown resistance category: ${category}`);
    this.name = "UnknownResistanceCategoryError";
    this.category = category;
  }
}

export class UnknownResistancePropertyError extends Error {
  readonly category: string;
  readonly property: string;

  constructor(category: string, property: string) {
    super(`Unknown resistance property "${property}" for category "${category}"`);
    this.name = "UnknownResistancePropertyError";
    this.category = category;
    this.property = property;
  }
}

export interface ResistanceMatrix<
  TCategory extends string = string,
  TProperty extends string = string,
> {
  categories: Partial<Record<TCategory, Partial<Record<TProperty, ResistanceCell>>>>;
  categoryIds?: readonly TCategory[];
  propertyIds?: readonly TProperty[];
  multipliers?: Partial<Record<ResistVerdict, number>>;
  default?: ResistVerdict;
  unknownCategory?: ResistVerdict;
}

export interface ResistanceResult {
  verdict: ResistVerdict;
  multiplier: number;
  immune: boolean;
}

const DEFAULT_MULTIPLIERS: Record<ResistVerdict, number> = {
  immune: 0,
  resist: 0.5,
  normal: 1,
  vulnerable: 2,
};

function multiplierFor(matrix: ResistanceMatrix, verdict: ResistVerdict): number {
  return matrix.multipliers?.[verdict] ?? DEFAULT_MULTIPLIERS[verdict];
}

function cellMultiplier(matrix: ResistanceMatrix, cell: ResistanceCell): number {
  return typeof cell === "number" ? cell : multiplierFor(matrix, cell);
}

function summaryVerdict(matrix: ResistanceMatrix, immune: boolean, net: number): ResistVerdict {
  if (immune) return "immune";
  const normal = multiplierFor(matrix, "normal");
  if (net > normal) return "vulnerable";
  if (net < normal) return "resist";
  return "normal";
}

function fromVerdict(matrix: ResistanceMatrix, verdict: ResistVerdict): ResistanceResult {
  if (verdict === "immune") return { verdict: "immune", multiplier: 0, immune: true };
  const multiplier = multiplierFor(matrix, verdict);
  return { verdict, multiplier, immune: false };
}

function categoryTable<TCategory extends string, TProperty extends string>(
  matrix: ResistanceMatrix<TCategory, TProperty>,
  category: string,
): Partial<Record<TProperty, ResistanceCell>> | undefined {
  return matrix.categories[category as TCategory];
}

export function resolveResistance<TCategory extends string = string, TProperty extends string = string>(
  matrix: ResistanceMatrix<TCategory, TProperty>,
  category: TCategory | string,
  targetProperties: readonly (TProperty | string)[],
): ResistanceResult {
  const byProperty = categoryTable(matrix, category);
  if (byProperty === undefined) {
    if (matrix.unknownCategory !== undefined) return fromVerdict(matrix, matrix.unknownCategory);
    const catalog = matrix.categoryIds ?? (Object.keys(matrix.categories) as TCategory[]);
    if (catalog.length === 0 && matrix.default !== undefined) {
      return fromVerdict(matrix, matrix.default);
    }
    throw new UnknownResistanceCategoryError(category);
  }

  const propertyCatalog =
    matrix.propertyIds !== undefined ? new Set<string>(matrix.propertyIds) : null;
  const fallback = matrix.default ?? "normal";
  let net = 1;
  let matched = false;
  let immune = false;
  for (const property of targetProperties) {
    if (propertyCatalog !== null && !propertyCatalog.has(property)) {
      throw new UnknownResistancePropertyError(category, property);
    }
    const cell = byProperty[property as TProperty];
    if (cell === undefined) continue;
    matched = true;
    if (cell === "immune") immune = true;
    net *= cellMultiplier(matrix, cell);
  }
  if (!matched) return fromVerdict(matrix, fallback);
  const multiplier = immune ? 0 : net;
  return { verdict: summaryVerdict(matrix, immune, multiplier), multiplier, immune };
}

export function resistanceScale<TCategory extends string = string, TProperty extends string = string>(
  matrix: ResistanceMatrix<TCategory, TProperty>,
  category: TCategory | string,
  targetProperties: readonly (TProperty | string)[],
): number {
  return resolveResistance(matrix, category, targetProperties).multiplier;
}
