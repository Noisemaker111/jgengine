export type ResistVerdict = "immune" | "resist" | "normal" | "vulnerable";

export interface ResistanceMatrix {
  categories: Record<string, Record<string, ResistVerdict>>;
  multipliers?: Partial<Record<ResistVerdict, number>>;
  default?: ResistVerdict;
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

function summaryVerdict(matrix: ResistanceMatrix, immune: boolean, net: number): ResistVerdict {
  if (immune) return "immune";
  const normal = multiplierFor(matrix, "normal");
  if (net > normal) return "vulnerable";
  if (net < normal) return "resist";
  return "normal";
}

export function resolveResistance(
  matrix: ResistanceMatrix,
  category: string,
  targetProperties: readonly string[],
): ResistanceResult {
  const byProperty = matrix.categories[category] ?? {};
  const fallback = matrix.default ?? "normal";
  let net = 1;
  let matched = false;
  let immune = false;
  for (const property of targetProperties) {
    const verdict = byProperty[property];
    if (verdict === undefined) continue;
    matched = true;
    if (verdict === "immune") immune = true;
    net *= multiplierFor(matrix, verdict);
  }
  if (!matched) {
    if (fallback === "immune") return { verdict: "immune", multiplier: 0, immune: true };
    const multiplier = multiplierFor(matrix, fallback);
    return { verdict: fallback, multiplier, immune: false };
  }
  const multiplier = immune ? 0 : net;
  return { verdict: summaryVerdict(matrix, immune, multiplier), multiplier, immune };
}

export function resistanceScale(
  matrix: ResistanceMatrix,
  category: string,
  targetProperties: readonly string[],
): number {
  return resolveResistance(matrix, category, targetProperties).multiplier;
}
