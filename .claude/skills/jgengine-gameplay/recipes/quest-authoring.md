# Validate generated quest batches against reviewed facts

Run `npx jgengine recipe quest-authoring` for the SDK-typechecked composition.
Supply your reviewed canonical facts, established quests, catalog ids, external
unlock sources, and authoring limits. Inject your generator as the async callback;
the recipe does not choose a model, story, genre, or assets.

The generator receives detached, deeply frozen snapshots of the facts, established
definitions, and limits for each bounded batch. Mutating caller inputs while the
generator awaits cannot change the reviewed revision or reference lookups. It returns only new quest definitions. Decode untrusted JSON
into `QuestDef` before returning it; this validator checks authored structure, not
arbitrary JSON shape. The recipe rejects oversized quest/objective/reference
batches before structural validation. Keep the existing catalog bounded too;
partition larger worlds into reviewed dependency-complete catalogs.

```ts
import { validateQuestCatalog } from "@jgengine/core/game/questCatalog";
import type { QuestDef } from "@jgengine/core/game/quest";

function reviewBatch(existing: readonly QuestDef[], generated: readonly QuestDef[]) {
  return validateQuestCatalog([...existing, ...generated], {
    externalUnlocks: ["caller-declared-world-entry"],
  });
}
```

The CLI recipe returns `factsRevision`, `candidate`, `diagnostics`, and `repair`.
`candidate` is null when structural errors exist. Each issue includes a JSON
Pointer into the combined catalog, such as `/4/rewards/quests/0`, plus a stable
code, severity, and referenced id when relevant. Send `repair` with the same
canonical facts and definitions to your generator for a bounded correction;
correct the identified fields and validate the whole candidate again. Never
replace reviewed facts with a model's remembered version. The recipe leaves all
warnings visible for review before registering the candidate with the journal.

Declare unlock ids that other game systems may grant in `externalUnlocks`.
Unlocks produced by catalog quest rewards are recognized automatically.
`externallyStartedQuests` declares catalog quests your game may grant active,
bypassing acceptance prerequisites. These declarations describe possible entry
points, without asserting when they happen. A requirement may be fulfilled by
completion of that quest id **or** an unlock with the same id; every requirement
must be met. Any eligible quest may be accepted directly, so a quest does not
need an incoming reward follow-up to be reachable.

Blocked prerequisites and cycles are warnings under this potential-progression
model. Objectives are assumed completable; external grants, custom acceptance
rules, or unavailable objectives can change actual play. Unknown requirement and
follow-up ids are errors: declare legitimate external unlock ids rather than
silencing missing references. Use `hasReference` for item, target, inventory, and
currency namespaces. Its objective context lets a game route custom objective
kinds to different catalogs. Omitted lookup policy leaves those ids unchecked.

Objective and item counts may be fractional or zero; zero can mean an already
complete objective or a no-op reward. Negative/nonfinite counts and nonfinite
reward amounts reject. Discrete quantity rules, XP loss, economy balance, story
contradictions, character motivation, chronology, and consequences remain
caller-owned review. Play representative paths before treating a valid catalog
as a coherent world.

For item supply and skill gates outside the quest journal, compose the
[content validation](../reference-content-validation.md) checks. Declare source
rules explicitly rather than assuming every defined item is obtainable or that
catalog order proves an item reward can precede a collection objective.
