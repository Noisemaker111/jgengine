import { validateDialogueGraph, type DialogueGraph } from "./dialogueGraph";

/** Caller-reviewed facts for one authoring revision; event ids are in strict chronological order. */
export interface NarrativeCanon {
  readonly revision: string;
  readonly characterIds: readonly string[];
  readonly facts: Readonly<Record<string, string>>;
  readonly eventIds: readonly string[];
}

/** An explicit assertion attached to a dialogue node; dialogue prose is never parsed. */
export type NarrativeClaim = { readonly nodeId: string } & (
  | { readonly kind: "character"; readonly characterId: string }
  | { readonly kind: "fact"; readonly factId: string; readonly value: string }
  | { readonly kind: "before"; readonly earlier: string; readonly later: string }
);

/** Authored dialogue with optional structured assertions against canon. */
export interface NarrativeDialogue {
  readonly id: string;
  readonly graph: DialogueGraph;
  readonly claims: readonly NarrativeClaim[];
}

/** A candidate batch never changes canon; accepted new facts need a separately reviewed revision. */
export interface NarrativeBatch {
  readonly canonRevision: string;
  readonly dialogues: readonly NarrativeDialogue[];
}

/** Caller budgets across the entire batch, including graph branches and explicit assertions. */
export interface NarrativeBatchLimits {
  readonly maxDialogues: number;
  readonly maxNodes: number;
  readonly maxChoices: number;
  readonly maxClaims: number;
  /** Sum of spoken lines and player choice text lengths (UTF-16 code units). */
  readonly maxTextCharacters: number;
}

/** A repair diagnostic with a JSON-pointer location in the candidate batch. */
export interface NarrativeIssue {
  readonly code: string;
  readonly severity: "error" | "warning";
  readonly path: string;
  readonly message: string;
}

/**
 * Detach and freeze reviewed canon before passing it to an asynchronous authoring callback.
 * Duplicate character/event ids and an empty revision throw; facts retain exact caller values.
 *
 * @capability narrative-canon freeze caller-reviewed character ids, facts and chronology for a narrative authoring revision
 */
export function freezeNarrativeCanon(canon: NarrativeCanon): NarrativeCanon {
  if (canon.revision.length === 0) throw new RangeError("Canon revision must not be empty.");
  for (const ids of [canon.characterIds, canon.eventIds]) {
    if (new Set(ids).size !== ids.length) throw new RangeError("Canon ids must be unique within each list.");
  }
  return Object.freeze({
    revision: canon.revision,
    characterIds: Object.freeze([...canon.characterIds]),
    facts: Object.freeze({ ...canon.facts }),
    eventIds: Object.freeze([...canon.eventIds]),
  });
}

/**
 * Check a typed candidate against caller budgets, canon revision, explicit claims and graph topology.
 * Stops at the first exceeded budget before topology work; stale revisions also stop immediately.
 * Claims check exact fact values and the declared strict event order, never prose, speaker labels,
 * motivations, branch consequences or story quality. O(canon + bounded nodes + choices + claims).
 * Validate/parse external JSON before calling; this is not an untrusted JSON decoder.
 *
 * @capability narrative-batch-validation locate stale canon, oversized batches, explicit character/fact/chronology contradictions and dialogue graph issues for bounded repair
 */
export function validateNarrativeBatch(
  canon: NarrativeCanon,
  batch: NarrativeBatch,
  limits: NarrativeBatchLimits,
): NarrativeIssue[] {
  for (const value of Object.values(limits)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("Narrative limits must be non-negative safe integers.");
  }
  if (batch.canonRevision !== canon.revision) {
    return [{ code: "stale-canon", severity: "error", path: "/canonRevision", message: "Candidate uses a different canon revision." }];
  }
  const budget = (path: string): NarrativeIssue[] => [{
    code: "batch-budget", severity: "error", path, message: "Candidate exceeds the caller's narrative batch budget.",
  }];
  if (batch.dialogues.length > limits.maxDialogues) return budget("/dialogues");
  let nodes = 0;
  let choices = 0;
  let claims = 0;
  let text = 0;
  for (let index = 0; index < batch.dialogues.length; index++) {
    const dialogue = batch.dialogues[index]!;
    const path = `/dialogues/${index}`;
    nodes += dialogue.graph.nodes.length;
    claims += dialogue.claims.length;
    if (nodes > limits.maxNodes) return budget(`${path}/graph/nodes`);
    if (claims > limits.maxClaims) return budget(`${path}/claims`);
    for (let nodeIndex = 0; nodeIndex < dialogue.graph.nodes.length; nodeIndex++) {
      const node = dialogue.graph.nodes[nodeIndex]!;
      choices += node.choices?.length ?? 0;
      if (choices > limits.maxChoices) return budget(`${path}/graph/nodes/${nodeIndex}/choices`);
      text += node.text.length;
      for (const choice of node.choices ?? []) text += choice.text.length;
      if (text > limits.maxTextCharacters) return budget(`${path}/graph/nodes/${nodeIndex}`);
    }
  }
  const issues: NarrativeIssue[] = [];
  const add = (code: string, path: string, message: string): void => {
    issues.push({ code, severity: "error", path, message });
  };
  const characters = new Set(canon.characterIds);
  const facts = new Map(Object.entries(canon.facts));
  const events = new Map(canon.eventIds.map((id, index) => [id, index]));
  const dialogueIds = new Set<string>();
  for (let index = 0; index < batch.dialogues.length; index++) {
    const dialogue = batch.dialogues[index]!;
    const path = `/dialogues/${index}`;
    if (dialogueIds.has(dialogue.id)) add("duplicate-dialogue", `${path}/id`, "Dialogue id repeats within the batch.");
    dialogueIds.add(dialogue.id);
    for (const issue of validateDialogueGraph(dialogue.graph)) {
      let location = `${path}/graph`;
      if (issue.nodeIndex !== undefined) location += `/nodes/${issue.nodeIndex}`;
      if (issue.choiceIndex !== undefined) location += `/choices/${issue.choiceIndex}/to`;
      if (issue.code === "missing-start") location += "/start";
      issues.push({ code: `dialogue:${issue.code}`, severity: issue.severity, path: location, message: issue.message });
    }
    const nodeIds = new Set(dialogue.graph.nodes.map((node) => node.id));
    for (let claimIndex = 0; claimIndex < dialogue.claims.length; claimIndex++) {
      const claim = dialogue.claims[claimIndex]!;
      const location = `${path}/claims/${claimIndex}`;
      if (!nodeIds.has(claim.nodeId)) add("missing-claim-node", `${location}/nodeId`, "Claim references an unknown dialogue node.");
      if (claim.kind === "character" && !characters.has(claim.characterId)) {
        add("unknown-character", `${location}/characterId`, "Claim references an unknown canon character.");
      } else if (claim.kind === "fact") {
        if (!facts.has(claim.factId)) add("unknown-fact", `${location}/factId`, "Claim references an unknown canon fact.");
        else if (facts.get(claim.factId) !== claim.value) add("fact-conflict", `${location}/value`, "Claim differs from the reviewed fact value.");
      } else if (claim.kind === "before") {
        const earlier = events.get(claim.earlier);
        const later = events.get(claim.later);
        if (earlier === undefined) add("unknown-event", `${location}/earlier`, "Claim references an unknown canon event.");
        if (later === undefined) add("unknown-event", `${location}/later`, "Claim references an unknown canon event.");
        if (earlier !== undefined && later !== undefined && earlier >= later) {
          add("chronology-conflict", location, "Claim contradicts the reviewed strict event order.");
        }
      }
    }
  }
  return issues;
}
