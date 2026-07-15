# JGengine Architecture Rewrite Program

> This document is both the rewrite charter and the continuation prompt for future agent sessions.
> Keep it current. Every PR that materially advances the rewrite should update the program ledger,
> decision log, or dependency map in this file.

## Program status

- **State:** proposed
- **Current phase:** Phase 0 — establish the baseline and make the architectural decisions
- **Canonical integration branch:** `main`
- **Program document:** `docs/ENGINE_REWRITE_PROGRAM.md`
- **Last major audit:** 2026-07-14
- **Integration owner:** unassigned

---

# Continuation prompt

You are continuing the pre-1.0 JGengine architecture rewrite.

Your job is not to cosmetically rename the existing API. Preserve the engine's valuable primitives,
deterministic behavior, package layering, rendering capability, multiplayer work, editor work, and
verification tooling while replacing the way those pieces are composed, typed, exported, persisted,
documented, scaffolded, and taught to agents.

Start every rewrite session by doing the following:

1. Read this entire document.
2. Read `docs/API_RESET.md`, `docs/API_DESIGN.md`, and `docs/AUTHORING_API.md`.
3. Inspect the current implementation instead of assuming this audit is still exact.
4. Check the program ledger and open PRs before selecting work.
5. Choose the highest-priority unblocked task whose owned files do not overlap another active task.
6. Keep the work in one focused PR. Do not merge it unless the user explicitly asks.
7. Update this document when a decision, dependency, milestone, or next task changes.

When an earlier finding has become stale, correct this document in the same PR. This is a living
coordination artifact, not immutable historical analysis.

## Mission

Produce one coherent JGengine authoring model with:

- one runtime model;
- one command model;
- one versioned snapshot and migration model;
- one public `defineGame`;
- typed content references instead of duplicated string identifiers;
- a context inferred from installed systems;
- explicit separation between game rules, presentation, deployment, and tooling;
- explicit public exports instead of accidental source-file exports;
- one scaffold implementation used internally and externally;
- task-oriented, compiling recipes for humans and agents;
- agent evaluations that measure whether the SDK can actually be used without reading engine source.

The rewrite is successful when adding a new game system no longer requires editing a central god
context, snapshot switchboard, shell bootstrap, documentation inventory, and several unrelated files.

## Why this is a rewrite

The repository currently contains several overlapping generations of architecture. Re-verify each
item before acting, but treat these as the starting hypotheses:

1. The intended authoring facade is documented but ordinary games still use deep runtime imports.
2. There are parallel runtime, command, and snapshot concepts.
3. `GameContext` constructs and exposes too many unrelated systems directly.
4. Feature booleans create optional APIs rather than a context inferred from installed systems.
5. Replication and persistence lack a single versioned system-owned schema contract.
6. Multiplayer declarations can exceed what the default host can actually resolve.
7. Skills act as router, API reference, policy manual, changelog, troubleshooting log, and product
   documentation at the same time.
8. Skill routing follows source folders more than author intent.
9. Generated API documentation follows exported source declarations rather than an intentional public
   export contract.
10. Internal and published game scaffolds have diverged.
11. Structural gates enforce historical filenames and import paths rather than architectural invariants.
12. Result shapes, error conventions, time units, names, and input dispatch conventions are inconsistent.
13. The shell is a large integration point that imports and coordinates nearly every concern.
14. The README, package READMEs, website API pages, skills, and authoring documents tell different stories.

Do not build a prettier facade over these contradictions and declare victory. Converge the underlying
models, migrate representative games, then remove the old paths.

---

# Non-negotiable constraints

## Product and API

- JGengine is pre-1.0. Prefer direct corrections over permanent compatibility layers.
- Ordinary game code must express game intent, not engine storage, transport, codec, or renderer
  mechanics.
- The common path must not require deep imports.
- Stable game identity must be distinct from a display title.
- A declared deployment must either resolve successfully or fail clearly. Never silently convert a
  multiplayer declaration into offline play.
- Public APIs must use one result and error vocabulary.
- Simulation time units must be explicit and consistent.
- Commands, actions, events, content definitions, and system references should be typed values rather
  than unrelated strings wherever practical.

## Architecture

- `@jgengine/core` remains renderer-free, platform-neutral, and dependency-light.
- Rules, presentation, deployment, persistence providers, and development tooling remain distinct.
- Systems own their state, codecs, migrations, replication policy, and runtime API.
- Adding a system should happen through registration/composition, not by adding another branch to a
  central runtime file.
- Determinism remains a first-class property: randomness, clocks, and external effects are injected or
  explicitly represented.
- Headless simulation must remain testable without React, Three.js, a browser, or a backend.
- Presentation must be replaceable without changing game-rule semantics.

## Migration and delivery

- Prove the architecture with representative golden games before migrating the whole repository.
- Do not leave two complete public architectures alive indefinitely.
- Documentation, skills, examples, scaffold changes, and public API changes ship together when they
  teach the same contract.
- Every public example must compile against packed package artifacts, not only workspace source aliases.
- One task should produce one focused PR. Parallel work uses separate branches and separate PRs.
- The user owns merge timing.

---

# Target architecture

The exact names may change through ADRs, but the separation of responsibilities should remain.

## 1. Typed content definitions

```ts
const content = defineContent({
  entities: {
    player: entity({
      disposition: "player",
      resources: {
        health: resource({ initial: 100, maximum: 100 }),
      },
      movement: characterMovement({ speed: 5.4 }),
    }),
  },
  items: {},
  effects: {},
  quests: {},
});
```

Definitions return typed references. A spawn receives `content.entities.player`, not the string
`"player"`. Catalog IDs remain serializable internally, but ordinary game code should not repeatedly
reconstruct them by hand.

## 2. Composed systems

```ts
const systems = defineSystems([
  entitySystem({ definitions: content.entities }),
  resourceSystem(),
  combatSystem({ effects: content.effects }),
  inventorySystem({ items: content.items }),
]);
```

A system declares:

- a stable ID;
- dependencies;
- runtime construction;
- its typed context API;
- snapshot codec and schema version;
- migrations;
- optional replication/diff behavior;
- optional React or presentation bindings outside core.

Conceptual contract:

```ts
interface GameSystem<TId extends string, TApi, TSnapshot> {
  readonly id: TId;
  readonly requires?: readonly SystemReference[];

  create(host: SystemHost): TApi;

  persistence?: {
    schemaVersion: number;
    codec: Codec<TSnapshot>;
    migrations: MigrationMap<TSnapshot>;
  };

  replication?: {
    snapshot(api: TApi): TSnapshot;
    diff?(before: TSnapshot, after: TSnapshot): unknown;
    apply?(snapshot: TSnapshot, diff: unknown): TSnapshot;
  };
}
```

The installed system tuple determines the available context type. A game that installs quests receives
a non-optional quest API. A game without quests has no quest API.

## 3. Pure game manifest

```ts
export const game = defineGame({
  id: "forest-arena",
  title: "Forest Arena",
  schemaVersion: 1,
  content,
  systems,

  simulation: {
    start(ctx) {},

    playerJoined(ctx, player) {
      ctx.entities.spawn(content.entities.player, {
        id: player.entityId,
        position: vec3(0, 0, 0),
      });
    },

    update(ctx, frame) {},
  },
});
```

`defineGame` validates and returns authored data. It must not allocate scene stores, asset catalogs,
React components, sockets, clocks, persistence providers, or platform resources.

## 4. Presentation descriptor

```ts
export const presentation = threePresentation({
  scene: authoredScene("./scene.jgscene"),
  camera: thirdPersonCamera(),
  entities: {
    [content.entities.player]: model("characters/hero"),
  },
  hud: GameUI,
});
```

Presentation consumes the game contract and maps it into a renderer. It does not redefine game state.

## 5. Deployment descriptor

```ts
export const deployment = hostedGame({
  authority: serverAuthority(),
  transport: websocketTransport({
    url: requiredEnvironment("JGENGINE_SERVER_URL"),
  }),
  persistence: postgresPersistence(),
});
```

Offline, peer-hosted, client-authoritative, and server-authoritative modes are explicit deployment
choices. Unsupported or incomplete deployment configuration fails during startup or build validation.

## 6. Application assembly

```ts
export default createGameApplication({
  game,
  presentation,
  deployment,
  tooling: developmentTools(),
});
```

There is one `defineGame`. Application assembly is intentionally a different operation.

## 7. Versioned snapshot envelope

```ts
interface SnapshotEnvelope {
  engineVersion: string;
  gameId: string;
  gameSchemaVersion: number;
  revision: number;
  systems: Record<string, {
    schemaVersion: number;
    data: unknown;
  }>;
}
```

Every installed persistent or replicated system owns validation and migration of its payload. The
runtime owns orchestration, not the internal schema of every feature.

---

# Program phases

## Phase 0 — Baseline, measurements, and ADRs

Goal: make the rewrite measurable and freeze the major decisions before broad implementation.

Required outputs:

- Exact public export inventory derived from `package.json#exports`.
- Deep-import census across games, examples, apps, docs, and skills.
- Comparison of all runtime, command, snapshot, persistence, and replication paths.
- Scaffold parity report for internal and published generators.
- Shell responsibility map and proposed seams.
- Skills/docs inventory with size, overlap, broken links, snippet status, and encoding checks.
- Initial agent-task benchmark and scoring rubric.
- ADRs selecting:
  - canonical runtime semantics;
  - canonical command/result semantics;
  - snapshot envelope and migration ownership;
  - system registration contract;
  - stable game/content identity rules;
  - public package and export strategy;
  - compatibility and deletion policy.

Exit gate: the program has one agreed critical-path design. Downstream code should not start against
competing runtime proposals.

## Phase 1 — Immediate correctness and safety fixes

These repairs should not wait for the full rewrite when they can be made without locking in the old
architecture:

- Correct replicated system/module removal semantics.
- Add snapshot validation and explicit version metadata where feasible.
- Require or introduce stable game identity without using the display title.
- Replace silent multiplayer-to-offline fallback with explicit failure or explicit opt-in fallback.
- Retire or fix any runtime initialization state that incorrectly spans multiple worlds.
- Add UTF-8, Markdown link, command-existence, and snippet-compilation checks.
- Make generation checks clean and non-mutating.

Exit gate: known data-corruption, stale-state, identity, and deployment-footgun classes are covered by
tests.

## Phase 2 — New kernel

Goal: establish the system-composed, typed, versioned headless kernel.

Deliverables:

- System definition and dependency graph.
- Typed system-context inference.
- Typed content references.
- Unified commands, actions, events, results, and errors.
- Explicit simulation-frame/time contract.
- System-owned codecs, schema versions, and migrations.
- Snapshot composition, diffing, hydration, and removal.
- Runtime host capable of offline and hosted execution.
- Compatibility adapter only where needed to migrate golden games.

Exit gate: a headless test game can install systems, run commands, tick deterministically, snapshot,
diff, hydrate, migrate, and reject invalid configuration without importing the old runtime API.

## Phase 3 — Public authoring facade and assembly layers

Deliverables:

- Canonical authoring package and export paths.
- One pure `defineGame`.
- Presentation descriptors.
- Deployment descriptors.
- Application assembly.
- Explicit advanced/infrastructure entry points.
- No wildcard exports for public packages.
- API compatibility report in CI.

Exit gate: the canonical starter and at least one golden game use no old deep runtime imports.

## Phase 4 — Shell decomposition

Break shell responsibilities into composable hosts or plugins:

- runtime host;
- input bridge;
- scene renderer;
- camera host;
- audio host;
- HUD host;
- settings host;
- multiplayer synchronization host;
- development/editor tooling host.

The shell may provide a convenient default composition, but each concern should attach through a
narrow seam rather than through one central component that knows every subsystem.

Exit gate: adding or replacing a presentation concern does not require editing the main shell driver.

## Phase 5 — Golden-game migrations

Migrate these categories before broad rollout:

1. HUD-only board or card game.
2. Basic 3D single-player game.
3. Combat, inventory, dialogue, and quest game.
4. Procedural or voxel game.
5. Server-authoritative multiplayer game with persistence.

Each migration must remove old imports rather than merely wrapping them locally.

Exit gate:

- no infrastructure imports in ordinary game modules;
- no untyped content lookup callbacks;
- no optional context API for installed systems;
- no stringly command dispatch in normal game code;
- save migration and multiplayer startup behavior covered by tests;
- presentation and headless simulation remain separable.

## Phase 6 — Scaffold, docs, skills, and agent evaluations

Deliverables:

- One scaffold library consumed by internal and published commands.
- Packed-tarball integration tests.
- Canonical starter variants for HUD-only, 3D offline, and hosted multiplayer games.
- Public docs separated from internal agent operating instructions.
- Task-oriented compiling recipes.
- Generated API reference based only on explicit public exports.
- Thin model-invocable router skill.
- Non-invocable or on-demand recipe/reference resources.
- Agent benchmark covering common game-building tasks.

Exit gate: agents can complete the benchmark using the public facade and recipes without reading
engine source or copying repository games.

## Phase 7 — Broad migration and deletion

- Migrate remaining games, examples, apps, scripts, skills, and docs.
- Remove the old runtime, command, snapshot, authoring, and shell entry paths.
- Remove wildcard exports and stale compatibility shims.
- Delete obsolete baselines and generated inventories.
- Publish a concrete migration guide.
- Run the complete package, game, browserless, multiplayer, and agent-evaluation gates.

Exit gate: one architecture remains.

---

# Parallel execution plan

Parallelism is based on independence, not task size. Separate agents may work concurrently only when
they have clear file ownership, stable inputs, and outputs that can be reviewed independently.

A single integration owner should maintain the dependency graph, resolve cross-lane decisions, and
prevent several agents from inventing incompatible versions of the same central contract.

## Work that can begin in parallel during Phase 0

| Lane | Scope | Primary output | Must not change yet |
| --- | --- | --- | --- |
| Public surface | Export map, deep-import census, compatibility report design | inventory + proposed export policy | runtime contracts |
| Runtime convergence | Compare runtimes, commands, snapshots, persistence, replication | ADR options and recommendation | public facade |
| Skills and docs | Measure duplication, routing quality, snippets, encoding, website exposure | documentation architecture + test plan | canonical API names |
| Scaffold parity | Compare `new:game`, published CLI templates, package aliases, starter behavior | one-generator consolidation plan | kernel contract |
| Shell decomposition | Map shell responsibilities and dependency seams | shell ADR and component boundaries | runtime semantics |
| Agent evaluation | Define representative prompts, scoring, fixtures, and measurements | benchmark harness design | finalized recipes |
| Immediate bug verification | Reproduce suspected replication, identity, init, and multiplayer failures | failing tests or disproved findings | broad refactors |

These lanes should produce evidence, tests, and ADRs. They should not each create a competing kernel.

## Critical path that should not be independently reinvented

The following decisions form one architectural chain and require an integration owner:

1. Canonical runtime semantics.
2. System contract and context inference.
3. Command/result/event/action model.
4. Snapshot envelope, codecs, migrations, and replication.
5. Pure game manifest.
6. Presentation and deployment assembly contracts.
7. Public package/export layout.

Subtasks within this chain can be delegated after the shared interfaces are accepted, but agents should
not concurrently edit different versions of the same central types.

## Work that can run in parallel after the kernel contracts freeze

| Lane | Inputs required | Owned implementation | Parallel with |
| --- | --- | --- | --- |
| Typed content | stable identity/reference ADR | content builders, reference types, validation | command typing, codecs |
| Commands/actions/events | result/error ADR + system host contract | definitions, dispatch, validation, actor attribution | content, persistence |
| Persistence/migrations | snapshot envelope + system contract | codecs, migrations, storage adapters | typed content, shell adapter |
| Replication | snapshot envelope + command authority rules | baseline, diff, removal, hydration | persistence providers |
| Runtime host | system contract + command model | lifecycle, tick, player join/leave, authority | presentation adapters |
| React bindings | stable system APIs | providers and hooks outside core | shell decomposition |
| Shell adapters | runtime-host interface + presentation descriptors | input, camera, scene, HUD, audio adapters | deployment providers |
| Deployment providers | stable deployment descriptor | offline, ws, p2p, Convex, Node, SQL assembly | shell adapters |
| API tooling | explicit export policy | surface generator and compatibility CI | implementation lanes |

## Work that can run in parallel after the first golden game passes

Each golden game is an independent migration lane when it owns its game directory and does not patch
central contracts. If a migration discovers a missing primitive or wrong default, stop the local
workaround and return the finding to the kernel owner.

After the public API is frozen, these can also proceed concurrently:

- canonical scaffold variants;
- public guides and reference pages;
- skill router and task recipes;
- website documentation changes;
- package README rewrites;
- remaining game migrations;
- examples and deployment guides;
- agent benchmark implementation and runs.

## Work that should not be parallelized prematurely

- Multiple redesigns of `defineGame`.
- Multiple system registry implementations.
- Multiple snapshot envelopes.
- Public docs written against unstable names.
- Broad game migrations before golden-game acceptance.
- Compatibility shims created independently by each migration.
- Concurrent edits to the main runtime context, shell driver, or package export maps without explicit
  file ownership.
- Deleting old paths before all call sites and packed examples have migrated.

---

# Dependency and landing order

Use this as the default PR landing sequence. A later PR may be developed in parallel, but it must not
land before its required contracts.

1. Baseline measurements and failing regression tests.
2. ADRs and architectural invariants.
3. Immediate correctness fixes that do not depend on the new kernel.
4. System, command, snapshot, identity, and time contracts.
5. New headless kernel implementation.
6. Compatibility adapter for golden-game migration only.
7. First golden game.
8. Presentation and deployment assembly.
9. Remaining golden games.
10. Explicit public exports and canonical authoring package.
11. Unified scaffold.
12. Public docs, skills, recipes, and website.
13. Broad game and example migrations.
14. Removal of old runtime and compatibility paths.
15. Final migration guide and pre-1.0 release gate.

---

# Parallel task packet template

Every delegated lane should receive a packet containing all of the following:

```md
## Objective
One observable result, not a broad topic.

## Evidence or input contracts
The ADRs, interfaces, tests, or commit SHAs this work may rely on.

## Owned files
The exact directories or files this lane may edit.

## Prohibited files
Central contracts or other active-lane files it must not edit.

## Deliverables
Code, tests, ADR, report, migration, or benchmark output.

## Acceptance checks
Exact commands and behavioral assertions.

## Integration assumptions
What the integration owner must provide or review.

## Escalation rule
When a missing primitive or contract conflict must return to the integration owner instead of becoming
local glue.
```

A task is not safely parallelizable when the owned-file section cannot be made clear.

---

# Required architectural decisions

Record accepted decisions in the decision log below.

## Runtime

Decide whether to evolve the richer current runtime, the snapshot-oriented runtime, or a new convergence
layer. The result must leave one public lifecycle and one internal state model.

Questions to settle:

- Mutable APIs over system-owned state versus immutable reducer-style transitions.
- How lifecycle hooks receive actors, players, time, and external effects.
- How many worlds may share one game definition safely.
- How deterministic replay is represented.
- How client prediction and server authority attach without changing game rules.

## Commands, actions, and events

Define one typed model for:

- declaration;
- validation;
- execution;
- actor attribution;
- serialization;
- rejection/error codes;
- local and remote dispatch;
- input-action binding;
- capture/test invocation.

Hidden name matching between actions and commands should not remain the default contract.

## State, persistence, and replication

Decide:

- system IDs and schema versions;
- snapshot envelope;
- validation boundary;
- migration ordering;
- removed-system/module semantics;
- diff granularity;
- dirty tracking;
- save scopes;
- persistence-provider seams;
- compatibility with existing saves before deletion.

## Public packages and exports

Decide whether the canonical facade is a new `@jgengine/game` package or an explicit authoring export in
an existing package. Regardless of package name:

- the common path is shallow and stable;
- advanced and infrastructure paths are explicit;
- package exports are allowlists;
- source layout does not define public API;
- documentation and API generation consume the same export manifest.

## Skills and documentation

The authority order should become:

1. Type/runtime contract.
2. Tests.
3. Compiling examples and recipes.
4. Public documentation.
5. Agent router and operational guidance.

Skills should route to tested recipes. A Markdown identifier mention must not count as proof that an API
is adopted or usable.

---

# Acceptance gates

## Kernel gate

- A system can be added without editing a central context switchboard.
- Installed systems determine the context type.
- The runtime supports multiple independent worlds from one game definition.
- Commands are typed, validated, actor-aware, and serializable.
- Snapshots are versioned, validated, migratable, and support removals.
- Deterministic replay tests pass.

## Public API gate

- One `defineGame` is documented and scaffolded.
- Ordinary game modules use no runtime, store, transport, codec, or shell-internal imports.
- Public exports come only from explicit package export maps.
- An API diff identifies additions, removals, and signature changes.
- Every public example compiles from packed packages.

## Deployment gate

- Offline, hosted WebSocket, peer, Convex, Node, and SQL paths declare their support accurately.
- Unsupported configuration fails clearly.
- Stable game identity never defaults to a display title.
- Server-authoritative and client-authoritative behavior is explicit.

## Presentation gate

- Headless rules do not import React or Three.js.
- The default shell is assembled from narrow concerns.
- Replacing camera, scene renderer, audio, or HUD does not require editing a central shell driver.
- HUD-only games do not initialize unnecessary 3D infrastructure.

## Scaffold gate

- Internal and published creation commands consume one template library.
- Starters build from packed packages.
- Starters use the canonical facade and explicit deployment.
- Starters demonstrate the approved HUD composition rather than patterns the UI skill rejects.

## Skills and docs gate

- Public website docs do not render internal agent operating manuals as product documentation.
- Router skills remain small and selective.
- Recipes compile and include prerequisites, complete usage, and verification.
- UTF-8, links, commands, and code snippets are validated.
- Agent benchmark tasks complete without source inspection or copied gallery-game code.

## Migration/deletion gate

- All repository games and examples use the new architecture.
- Existing supported saves have a migration path or an explicit pre-1.0 reset decision.
- Old runtimes, command registries, snapshots, wildcard exports, and compatibility shims are removed.
- Documentation contains no conflicting canonical entry point.

---

# Program ledger

Update these tables as work begins and lands.

## Active workstreams

| Workstream | Owner/branch | State | Depends on | Owned files | PR |
| --- | --- | --- | --- | --- | --- |
| Baseline and ADRs | unassigned | ready | none | `docs/adr/`, analysis scripts/tests | — |
| Immediate correctness fixes | unassigned | blocked on reproductions | Phase 0 tests | focused runtime files | — |
| New kernel | unassigned | blocked | accepted runtime/system ADRs | new kernel modules | — |
| Public facade | unassigned | blocked | kernel contract | package exports/authoring | — |
| Shell decomposition | unassigned | discovery-ready | runtime host interface for implementation | shell modules | — |
| Deployment providers | unassigned | blocked | deployment ADR | adapter/provider packages | — |
| Unified scaffold | unassigned | discovery-ready | facade for implementation | template tooling | — |
| Skills and docs | unassigned | discovery-ready | public API freeze for rewrite | docs/skills/site | — |
| Agent evaluation | unassigned | design-ready | none for rubric | benchmark tooling/fixtures | — |
| Golden games | unassigned | blocked | kernel beta | selected game directories | — |

## Decision log

| Date | Decision | Status | ADR/PR | Consequences |
| --- | --- | --- | --- | --- |
| 2026-07-14 | Treat the effort as an underlying architecture convergence, not a facade-only cleanup. | proposed | this document | runtime, snapshots, skills, scaffolds, and shell are in scope |

## Milestones

| Milestone | State | Evidence |
| --- | --- | --- |
| Baseline measurements complete | not started | — |
| Runtime/system/snapshot ADRs accepted | not started | — |
| Immediate correctness regressions covered | not started | — |
| New kernel passes headless acceptance gate | not started | — |
| First golden game migrated | not started | — |
| All five golden games migrated | not started | — |
| Canonical scaffold ships | not started | — |
| Skills/docs and website teach only the new path | not started | — |
| Remaining games migrated | not started | — |
| Old architecture deleted | not started | — |

## Next safe parallel tasks

These tasks can begin immediately without waiting for a kernel implementation:

1. Build the exact public-export and deep-import census.
2. Write the runtime/command/snapshot convergence ADR with concrete call-site evidence.
3. Add failing tests for suspected replicated-module removal behavior.
4. Reproduce multiplayer fallback and game-identity behavior in tests.
5. Compare the two scaffold implementations and propose one shared template API.
6. Produce the shell responsibility/dependency map.
7. Inventory skills and public docs, including size, overlap, encoding, links, and snippet compilation.
8. Define the first agent benchmark suite and scoring rubric.

---

# Session completion protocol

Before finishing any rewrite session:

1. Run the narrow checks for the changed area and the relevant architectural acceptance check.
2. Search for stale documentation and old call sites affected by the change.
3. Update this file's active workstream, decision, milestone, or next-task sections.
4. State what remains blocked and what is now safe to parallelize.
5. Push one focused branch and open one PR.
6. Do not merge unless explicitly requested.

The final rewrite is not complete because a new facade exists. It is complete when repository games,
scaffolds, skills, docs, website reference, persistence, multiplayer, and presentation all use one
coherent architecture and the old paths are gone.
