# Validate references and declared progression

Run these pure validators during authoring, build or CI, never per frame. Decode
external JSON into typed definitions first. Preserve authored array order and
stable ids so repeated validation returns identical located diagnostics. Each
`ContentIssue` carries `contentId`, a caller document `path`, and a `repair` action.
For a bounded generated batch, validate its dependency-complete reviewed catalog,
repair the located fields, then validate again before registration.

`validateContentReferences` (`@jgengine/core/game/contentValidation`) indexes
`{ kind, id, path }` definitions once and checks located
`{ kind, id, path, contentId }` references. A namespace can describe a game-owned
role: referencing a `questgiver` checks the role rather than merely the existence
of an NPC. Do not derive roles from names or parse dialogue prose. Validate explicit
dialogue command arguments against the appropriate namespace.
For relationships stricter than existence, set a reference's `allowedIds` from
the game's declared rule, such as this giver's quests or this record's key.
An existing but disallowed id reports `inconsistent-reference`; omitted policy
does not infer restrictions from names, prose or ordering.

`validateRecipeCatalog` (`@jgengine/core/crafting/recipeCatalog`) checks native
`RecipeDef` rows and optional item, station and unlock lookups. Build lookup Sets
once in the adapter. Empty outputs are valid for benefits applied by game code.
Zero and fractional counts are valid; enforce discrete units in game policy.
Duplicate input rows reject because crafting checks each row separately; merge
their counts. Prices, rarity, ingredient scarcity and recipe cycles are game-owned.
Compose existing `validateQuestCatalog` and `validateDialogueGraph` for their native
structures; do not replace the quest journal or conversation model.

```ts
import { validateContentProgression } from "@jgengine/core/game/contentValidation";

const result = validateContentProgression({
  initial: ["material:wire", "material:seals", "place:home"],
  rules: [{
    id: "sealed-tank",
    path: "/refits/tank",
    requires: ["material:wire", "material:seals", "place:home"],
    provides: ["benefit:sealed-tank"],
  }],
  required: [{ id: "benefit:sealed-tank", contentId: "tank", path: "/refits/tank" }],
  closedWorld: true,
});
```

Facts are opaque game-owned strings. All facts in one rule are necessary;
alternative sources are separate rules. An initial fact or a reachable source
can seed an intentional cycle. Missing seeds block cycles; cycles themselves
are never forbidden. `closedWorld: true` asserts all possible sources have been
declared and makes blocked rules/required facts errors. The default leaves them
warnings. Legitimate external suppliers belong in `initial` or a source rule,
not a blanket declaration of every catalog item as available.

Translate skill gates into milestone facts in the game adapter. A repeatable
action requiring skill 0 and training to 50 can provide milestones through 50;
it cannot provide the next source's skill-100 fact. Derive milestones from actual
gates and training caps rather than inventing thousands of skill nodes. Bound the
analysis to the reviewed content and dependency edges. The engine visits each
rule and dependency edge with an iterative queue rather than rescanning a catalog
until convergence.

This proves potential availability only. It does not prove affordable quantities,
repeatability, inventory capacity, consumed prerequisites, exclusive choices,
chronology, station proximity, story coherence or obtainable rewards in actual play.
Declare distinct route/branch facts when combining branches would be misleading,
and drive representative choices through the actual commands with save/reload.
Keep story facts, terms, assets and economy decisions in the game. Remove older
generic reference/topology algorithms when adopting these checks; retain custom
semantic and durable-save policy validators.

Verify built tarball imports and the actual adopter in an isolated scratch copy.
Keep the candidate on a prepared branch until a verified published package contains
these APIs, then adopt through the games workspace catalog and lockfile together.
Never route game imports to engine source or add per-game version pins.
