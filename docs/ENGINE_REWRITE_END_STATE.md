# JGengine Rewrite Benefits and End State

> Companion to [`ENGINE_REWRITE_PROGRAM.md`](./ENGINE_REWRITE_PROGRAM.md).
>
> The program document explains how to execute the rewrite. This document explains why the rewrite is
> worth doing and what JGengine should feel like when it is complete.

## Executive case

The rewrite changes JGengine from a repository containing several capable but overlapping engine models
into one coherent product that can be learned, extended, tested, deployed, documented, and released with
confidence.

The goal is not merely a prettier `defineGame` call or fewer imports. The end state is an engine where:

- the common authoring path is obvious;
- advanced infrastructure paths are explicit;
- the compiler and startup validation catch architectural mistakes early;
- game rules remain portable across renderers and deployments;
- saves and replicated state are versioned contracts;
- systems can be added without expanding a central god object;
- generated projects, package exports, docs, skills, and examples all teach the same API;
- the old competing paths are deleted rather than maintained forever.

The biggest benefit is compounding leverage. Today, adding a feature can require changes to central runtime
construction, context types, snapshot logic, shell integration, exports, scaffolds, skills, and docs. In
the end state, a feature is implemented as a system with a narrow contract and composed into games. Every
feature added after the rewrite should therefore be cheaper and safer than the feature before it.

---

# Benefits

## 1. One correct way to build an ordinary game

A game author no longer chooses between multiple runtimes, command registries, snapshot formats, shell
bootstraps, or deep imports. The canonical flow is:

1. Define typed content.
2. Install systems.
3. Define deterministic rules.
4. Select a presentation.
5. Select a deployment.
6. Assemble the application.

This creates one stable mental model. A developer can move from a HUD-only game to a 3D game, or from an
offline prototype to hosted multiplayer, without discarding what they learned about JGengine.

The practical payoff is that questions such as “which `defineGame` is canonical?”, “do I use
`GameContext` or `GameRuntime`?”, and “which command runner should this feature use?” stop existing.

## 2. The compiler guides the architecture

Installed systems determine the context available to game rules. A game that installs inventory receives
a non-optional inventory API. A game without quests has no quest API. Typed references connect entity,
item, effect, quest, action, and command definitions to their usage.

Many failures move from runtime to authoring time:

- spawning an unknown entity;
- using a system that was not installed;
- dispatching an unknown command or invalid payload;
- connecting systems with missing dependencies;
- selecting an unsupported deployment provider;
- persisting system state without a codec or schema version.

The engine no longer depends on documentation warnings to keep authors safe. Types, validators, and
startup checks enforce the same contract the docs teach.

## 3. Adding systems stops expanding a god object

A system owns its stable identity, dependencies, runtime API, state, persistence codec, migrations, and
optional replication behavior. It registers through composition rather than requiring another field and
branch in a central context, snapshot switchboard, and shell.

A feature such as factions, crafting, weather, vehicles, or reputation can therefore be implemented and
tested without modifying unrelated systems. This reduces regressions, clarifies ownership, and creates a
real extension model for first-party and eventual third-party packages.

## 4. Rules become portable across presentation and deployment

Game rules remain headless. They do not import React, Three.js, browser APIs, sockets, SQL, Convex, or
editor state. Presentation maps the game contract into visuals, input, audio, and HUD. Deployment maps it
into authority, transport, and persistence.

The same rules can run in:

- a unit test;
- a CLI simulation;
- an editor preview;
- a HUD-only browser game;
- a Three.js client;
- an offline build;
- a supported server-authoritative session.

Changing the renderer, camera, HUD, transport, or database no longer requires replacing the simulation
architecture.

## 5. Saves and replicated state become explicit contracts

The runtime has one snapshot envelope. Every persistent or replicated system owns a schema version,
validation, migration, and removal semantics for its payload.

The engine can answer which game produced a save, which schema each system used, how an old payload is
migrated, what removal means, and whether a client can safely hydrate a server snapshot.

This lowers the risk of stale replicated modules, partial hydration, corrupted saves, and silent
compatibility failures. A pre-1.0 reset can still be chosen, but it becomes an explicit product decision
rather than an accidental consequence of an unversioned object shape.

## 6. Multiplayer declarations tell the truth

Deployment descriptors express authority, transport, persistence, and required configuration. A declared
mode either resolves successfully or fails clearly. Offline fallback happens only when explicitly enabled.

A developer cannot believe they are testing multiplayer while the shell silently runs offline. Missing
URLs, unavailable providers, unsupported adapters, and incompatible authority modes fail during build or
startup with actionable diagnostics.

Because local and remote play use one command, actor, snapshot, and result model, they stop behaving like
separate engine generations.

## 7. The default shell becomes replaceable

The player shell remains convenient, but it is assembled from narrow concerns: runtime, input, rendering,
camera, HUD, audio, settings, synchronization, and development tooling.

A developer can replace the HUD without touching multiplayer synchronization, change the camera without
changing rules, or build a HUD-only game without initializing unnecessary 3D infrastructure. The shell is
a strong default composition rather than the only place where the engine is truly wired together.

## 8. Scaffolds become executable product contracts

Internal and published creation commands consume the same template library. Generated projects compile
against packed packages and use the exact public API recommended by the docs.

The first project a developer creates is no longer a stale approximation or a privileged monorepo example.
It is a maintained conformance fixture. A broken starter becomes a release-blocking failure.

## 9. Documentation and skills become smaller and testable

Public documentation teaches concepts and complete task recipes. Generated API reference follows explicit
public exports. Internal agent operating instructions are separated from public product docs. Thin router
skills direct agents to tested recipes rather than embedding thousands of duplicated symbol lines.

Humans and agents receive the same canonical answer. Snippets compile, links resolve, commands exist, and
examples use package boundaries that users can actually install.

## 10. Parallel development becomes safer

Stable runtime, system, snapshot, presentation, and deployment contracts create real ownership boundaries.
Teams can work concurrently on persistence providers, shell adapters, React bindings, content builders,
golden-game migrations, docs, and evaluations without all editing the same central files.

Parallel work produces independent components rather than competing kernels and late merge conflicts.
The integration owner coordinates explicit contracts instead of reconciling hidden architectures after
they have already spread through the repository.

## 11. Releases become understandable

Explicit export allowlists define the public API. API-diff tooling reports additions, removals, and
signature changes. Packed-package tests verify examples and scaffolds against what users install.

A release can answer:

- what public API changed;
- whether examples use private imports;
- whether the CLI generates a valid project;
- whether docs reference available symbols;
- whether every advertised deployment starts correctly;
- whether old compatibility paths are still used.

This closes the gap between “the monorepo builds” and “the released SDK works.”

## 12. The old architecture can be deleted

Golden-game migrations and deletion gates prevent the compatibility layer from becoming a second permanent
architecture. Once repository games, examples, scaffolds, docs, and skills are migrated, duplicate
runtimes, command paths, snapshot models, wildcard exports, and migration shims are removed.

Maintenance cost genuinely falls instead of being shifted behind a new facade.

---

# The completed developer experience

## Starting a game

A developer runs the canonical generator and selects a meaningful variant such as HUD-only, 3D offline,
or hosted multiplayer. Every variant uses the same authoring model.

A representative project looks like:

```text
src/
  content.ts
  systems.ts
  game.ts
  presentation.tsx
  deployment.ts
  app.tsx
```

- `content.ts` defines authored content and returns typed references.
- `systems.ts` selects capabilities and validates dependencies.
- `game.ts` contains deterministic rules.
- `presentation.tsx` maps state to visuals, input, audio, and HUD.
- `deployment.ts` chooses offline or hosted infrastructure.
- `app.tsx` assembles the pieces.

The generated project starts immediately, has no deep imports, and includes a headless test that dispatches
a command and verifies a snapshot round trip.

## Writing rules

The author works against a context inferred from the installed systems:

```ts
const systems = defineSystems([
  entities({ definitions: content.entities }),
  resources(),
  inventory({ items: content.items }),
  combat({ effects: content.effects }),
]);

export const game = defineGame({
  id: "forest-arena",
  title: "Forest Arena",
  content,
  systems,
  simulation: {
    playerJoined(ctx, player) {
      const entity = ctx.entities.spawn(content.entities.player, {
        id: player.entityId,
      });

      ctx.inventory.give(entity, content.items.trainingSword);
    },

    update(ctx, frame) {
      // frame.deltaSeconds has one documented meaning everywhere.
    },
  },
});
```

Autocomplete shows only installed capabilities. Removing inventory makes its usage a compile error.
Renaming `trainingSword` updates references through normal TypeScript tooling.

The author does not need to know which store holds entities, how inventory serializes state, or how a
remote command crosses a WebSocket. Those are system and engine responsibilities.

## Commands and input

Commands are typed definitions with explicit actor and payload contracts. Input bindings reference command
values, not names that happen to match through hidden conventions.

The same command can be invoked from a unit test, local input, an agent, or a server transport using the
same validation and error vocabulary. UI code receives structured rejection codes instead of parsing
arbitrary strings.

## Headless testing

Tests construct multiple independent worlds from one game definition without React, Three.js, a browser,
or a backend. They inject deterministic randomness, tick exact frames, dispatch commands, compare
snapshots, and replay failures.

Simulation behavior becomes cheap to test and reproducible.

## Presentation

Presentation maps typed game references into renderer-specific assets and components. It observes state
and emits typed actions but does not become another source of game truth.

Changing a model, camera, renderer, or HUD does not alter save semantics or server authority.

## Hosted deployment

A hosted game declares its infrastructure explicitly:

```ts
export const deployment = hostedGame({
  authority: serverAuthority(),
  transport: websocketTransport({
    url: requiredEnvironment("JGENGINE_SERVER_URL"),
  }),
  persistence: postgresPersistence(),
});
```

At startup, JGengine verifies provider packages, required configuration, game identity, system graph,
command schemas, and snapshot compatibility. Unsupported configurations stop with a useful error.

Reconnection hydrates a validated baseline. Removed state is transmitted and applied explicitly.
Incompatible clients fail cleanly rather than partially joining with stale state.

## Saving and upgrading

A save includes engine version, stable game ID, game schema version, revision, and versioned payloads for
installed systems.

When a system schema changes, that system supplies a migration. The runtime orders migrations, validates
their results, and reports which system failed. Persistence providers store the envelope without owning
every system's internal model.

## Adding a custom system

A custom system declares dependencies and API in one place. It may provide:

- headless runtime behavior;
- a typed context API;
- codecs and migrations;
- replication support;
- React hooks;
- presentation adapters;
- tested recipes and explicit exports.

A game installs it through composition. Existing games and unrelated systems do not need central changes.

## Using an agent

An agent receives a thin router skill and a task recipe such as “add an inventory item with a use action
and HUD button.” The recipe points to public types, gives a complete compiling pattern, and supplies the
verification command.

The evaluation expects the agent to succeed through public APIs. Reading engine source or copying a gallery
game is treated as evidence that the authoring product or recipe is incomplete.

## Maintaining and releasing

A maintainer can trace a public capability from its export map to tests, recipes, and package docs. Public
surface reports catch accidental exports and breaking changes. Explicit dependencies reveal which systems
a central contract affects.

A release verifies packed-package scaffolds, public examples, deterministic headless tests, snapshot
migrations, multiplayer startup, documentation integrity, and agent evaluations.

---

# End state by role

## Solo game developer

JGengine feels smaller even though it remains capable. The developer learns one workflow, gets useful
autocomplete, starts offline quickly, and can move to hosted play without replacing the rule architecture.
Errors appear near their cause, and generated projects match the docs.

## Engine contributor

Features have bounded ownership. A contributor can improve combat, persistence, a renderer, or a transport
without editing every concern in the shell. Tests exercise the feature independently, and public exposure
is deliberate.

## Multiplayer developer

Authority and transport are explicit. Commands, actors, snapshots, identity, and replication share one
contract. Unsupported configurations fail loudly, reconnects hydrate validated state, and removals have
defined semantics.

## Editor and tools developer

The editor consumes the same content and system definitions as runtime code instead of maintaining a
parallel schema. Preview runs the headless game through presentation adapters. Authored scene data does not
silently become a second game-state model.

## Documentation maintainer

There is one public path. References follow explicit exports, recipes compile, and internal agent manuals
do not leak into product documentation. Removing an API causes a visible failing check instead of leaving
stale prose indefinitely.

## Ecosystem author

Systems and adapters provide intentional extension points. Packages can declare dependencies,
compatibility, schemas, migrations, and optional bindings without importing private source files.

---

# Observable success measures

The rewrite should be judged by outcomes:

- A generated starter installs and builds from packed packages.
- Ordinary game modules contain no imports from runtime internals, stores, transports, codecs, or shell
  implementation paths.
- There is exactly one public `defineGame`, runtime lifecycle, command model, and snapshot envelope.
- Public packages use explicit export allowlists.
- Five representative golden games pass on the new architecture.
- One game definition creates multiple isolated worlds safely.
- Snapshot round-trip, migration, invalid-payload, revision, and removal tests pass.
- Every advertised deployment mode has a startup integration test.
- Replacing a shell concern does not require editing the runtime host.
- Internal and published scaffolds share one implementation.
- Public snippets compile from packed packages.
- UTF-8, links, commands, and generated references are checked automatically.
- Agent benchmark completion improves while source inspection and copied internal patterns decline.
- Old runtimes, command registries, snapshot paths, wildcard exports, and compatibility shims are deleted.

---

# Costs and tradeoffs

The benefits require real short-term costs:

- Central contracts must be decided before implementation can fully fan out.
- Existing games and examples must be migrated rather than left permanently on legacy APIs.
- Familiar APIs will be removed when retaining them would preserve architectural contradictions.
- Runtime and snapshot convergence will expose behavioral differences requiring explicit decisions.
- Golden-game migrations are slower initially than adding local adapters, but prevent local workarounds
  from becoming the next architecture.
- Final docs and skills should follow stable names, so some lanes begin with inventories, tests, and ADRs.
- Any compatibility adapter needs an owner and deletion milestone.

The rewrite does not promise automatic performance improvements, perfect networking, effortless game
design, or compatibility with every pre-1.0 experiment. It promises a coherent foundation on which those
areas can be improved without multiplying contradictions.

---

# Final end state

The rewrite is complete when JGengine behaves like one engine rather than a repository containing several
partially overlapping engines.

A new developer generates a project, reads one guide, imports one authoring facade, and writes rules
against a context inferred from installed systems. Content references, commands, actors, events, and state
are typed. Rules run headlessly and deterministically. Presentation is separate. Deployment is explicit
and truthful.

The same game runs offline, in tests, in an editor preview, or through a supported hosted deployment
without replacing its simulation architecture. Saves and network snapshots identify their game and
schema, validate payloads, migrate deliberately, and represent removals correctly.

An engine contributor adds a system through composition instead of expanding a central context and shell.
A renderer or transport author implements a narrow adapter. A documentation author writes against an
explicit export contract. An agent follows a tested recipe. A release verifies the packages users install.

Most importantly, there is no hidden second answer. Duplicate runtimes, command paths, snapshots,
accidental exports, divergent scaffolds, and stale skills are gone. The code, types, tests, generated
projects, public docs, website, and agent instructions all describe and exercise the same architecture.

That is the payoff: not only a cleaner API today, but a lower-cost engine to extend for every feature,
game, adapter, provider, tool, and release that follows.
