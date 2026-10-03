# Repair dialogue batches against reviewed canon

`npx jgengine recipe narrative-authoring` prints an SDK-typechecked function with
injected `generate` and `review` callbacks. Use it for a bounded chapter's
conversations, then stage the accepted batch for playtesting. It selects no
model, network service, assets or genre.

The author supplies a chapter brief: intended experience, voices, prerequisites,
player choices and their consequences. Keep reviewed canon separate from draft
prose. `freezeNarrativeCanon` detaches and freezes a revision, character ids,
exact string facts and a strict event order. Include only events whose order is
settled; branching or uncertain chronology belongs in semantic review. A new
fact or changed fact requires a separately reviewed canon revision.

```ts
import {
  freezeNarrativeCanon,
  validateNarrativeBatch,
  type NarrativeBatch,
} from "@jgengine/core/game/narrativeAuthoring";

const canon = freezeNarrativeCanon({
  revision: "inquiry-r7",
  characterIds: ["diver"],
  facts: { hatch: "sealed" },
  eventIds: ["descent", "alarm"],
});
const candidate: NarrativeBatch = {
  canonRevision: canon.revision,
  dialogues: [{
    id: "deposition",
    graph: {
      start: "witness",
      nodes: [{ id: "witness", speaker: "Witness 4", text: "The hatch stayed sealed." }],
    },
    claims: [{ nodeId: "witness", kind: "fact", factId: "hatch", value: "sealed" }],
  }],
};
const issues = validateNarrativeBatch(canon, candidate, {
  maxDialogues: 1, maxNodes: 20, maxChoices: 40, maxClaims: 30, maxTextCharacters: 6000,
});
```

These numbers and content demonstrate caller choices. A procedural undersea
inquiry can hinge on preserving a witness's anonymity versus publishing evidence.
An absurd rooftop tea negotiation can hinge on saluting a pigeon's ceremonial
hat versus offering biscuits. Each game writes its own canon, voices, style and
consequences; neither slice supplies a reusable story preset.

The typed batch contains graphs plus explicit node-attached `character`, `fact`
and `before` claims. `validateNarrativeBatch` checks those claims and reuses
`validateDialogueGraph` for topology. Diagnostics include a JSON-pointer path,
for example `/dialogues/0/claims/1/value` or
`/dialogues/0/graph/nodes/2/choices/0/to`. Speaker labels and prose remain display
data. Omitted or misleading claims cannot prove prose is coherent.

The CLI function snapshots canon, limits, brief and callback selection before
awaiting generation. It checks revision and budgets before copying a returned
candidate; oversized and stale candidates are discarded with diagnostics.
Within-budget drafts and repair diagnostics are detached and frozen across
callbacks. Fix the located candidate, preserving the reviewed canon. Attempts
stop at the caller's positive `maxAttempts`; exhausting it returns `needs-review`.

Generators return typed `NarrativeBatch` data. Decode external JSON before this
boundary and enforce response byte/token budgets in the generator adapter; the
SDK's node/choice/claim/text limits are not a transport-size limiter. Callback
failures propagate. A pending reviewer stays pending, and rejection never implies
approval. A reviewer must return `approved: true` and no error diagnostics for
acceptance. Review topology warnings explicitly against intended play.

Semantic review compares the actual prose with canon and the chapter brief,
including unannotated statements, character motivations, causality, chronology,
lasting consequences and meaningful playable choices. Return located issues to
the next repair attempt. Play representative branches before promoting accepted
drafts to the game's authored catalog. Acceptance stages data; this function
never publishes content or replaces canon.
