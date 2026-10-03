import {
  freezeNarrativeCanon,
  validateNarrativeBatch,
  type NarrativeBatch,
  type NarrativeBatchLimits,
  type NarrativeCanon,
  type NarrativeIssue,
} from "@jgengine/core/game/narrativeAuthoring";

interface AuthoringRequest {
  readonly canon: NarrativeCanon;
  readonly brief: string;
  readonly limits: NarrativeBatchLimits;
  readonly attempt: number;
  readonly previous?: NarrativeBatch;
  readonly issues: readonly NarrativeIssue[];
}

interface ReviewDecision {
  readonly approved: boolean;
  readonly issues: readonly NarrativeIssue[];
}

function frozenCopy<T>(source: T): T {
  const copy = structuredClone(source);
  function freeze(value: unknown): void {
    if (value === null || typeof value !== "object") return;
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  freeze(copy);
  return copy;
}

// Typed authored data only: decode external JSON before returning it from generate.
// The generator and reviewer receive detached frozen snapshots across every await.
export async function authorNarrative(options: {
  canon: NarrativeCanon;
  brief: string;
  limits: NarrativeBatchLimits;
  maxAttempts: number;
  generate: (request: AuthoringRequest) => Promise<NarrativeBatch>;
  review: (request: AuthoringRequest & { readonly candidate: NarrativeBatch }) => Promise<ReviewDecision>;
}): Promise<
  | { status: "accepted"; batch: NarrativeBatch; attempts: number }
  | { status: "needs-review"; batch: NarrativeBatch | undefined; issues: readonly NarrativeIssue[]; attempts: number }
> {
  const { generate, review, maxAttempts, brief } = options;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) throw new RangeError("maxAttempts must be a positive safe integer.");
  const canon = freezeNarrativeCanon(options.canon);
  const limits = frozenCopy(options.limits);
  validateNarrativeBatch(canon, { canonRevision: canon.revision, dialogues: [] }, limits);
  let previous: NarrativeBatch | undefined;
  let issues: readonly NarrativeIssue[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const request = frozenCopy({ canon, brief, limits, attempt, previous, issues });
    const generated = await generate(request);
    issues = frozenCopy(validateNarrativeBatch(canon, generated, limits));
    if (issues.some((issue) => issue.code === "batch-budget" || issue.code === "stale-canon")) {
      previous = undefined;
      continue;
    }
    const candidate = frozenCopy(generated);
    previous = candidate;
    if (issues.some((issue) => issue.severity === "error")) continue;
    const decision = frozenCopy(await review(frozenCopy({ ...request, issues, candidate })));
    issues = frozenCopy([...issues, ...decision.issues]);
    if (decision.approved === true && !issues.some((issue) => issue.severity === "error")) {
      return { status: "accepted", batch: candidate, attempts: attempt };
    }
    if (decision.issues.length === 0) {
      issues = frozenCopy([...issues, {
        code: "semantic-review", severity: "error" as const, path: "/dialogues",
        message: "Reviewer did not explicitly approve. Review motivations, chronology, consequences and playable choices.",
      }]);
    }
  }
  return { status: "needs-review", batch: previous, issues, attempts: maxAttempts };
}

// Caller supplies the style brief, chapter slice, generator and semantic reviewer.
// Stage an accepted batch for playtesting; promotion and new canon revisions stay explicit.
// No model, network service, genre, assets or automatic canon replacement is selected here.
