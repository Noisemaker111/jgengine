# Canonical `game.config.ts` Contract

> This document refines the JGengine rewrite end state. Every game must have one required,
> top-level `game.config.ts` file. It is the canonical discovery point for developers, the CLI,
> the editor, tests, builds, deployment tooling, documentation tooling, and agents.

## Decision

Every JGengine game directory has exactly one canonical root manifest:

```text
games/forest-arena/
  game.config.ts
  package.json
  src/
    content.ts
    systems.ts
    game.ts
    presentation.tsx
    deployments.ts
    ui/
    tests/
```

`game.config.ts` is the first file a person or tool opens to understand the game. It answers:

- What game is this?
- Which rules manifest does it run?
- Which presentation does it use?
- Which deployment profiles are supported?
- Which editor, asset, development, and verification options are enabled?
- Which files or descriptors are the canonical implementation of those concerns?

A game is not considered a valid JGengine game without this file.

## Why keep this convention

A conventional top-level config gives JGengine a stable front door even when the internals of a game grow.
Without it, a developer, editor, CLI command, deployment provider, or agent must infer the entry point from
folder names, package scripts, imports, or historical conventions. That recreates the same ambiguity the
rewrite is intended to remove.

The config provides several benefits:

1. **Discoverability.** A new contributor knows where to begin without reading the whole repository.
2. **Tooling stability.** The CLI, editor, build pipeline, verifier, and deployment commands resolve the same
   file rather than each inventing their own discovery rules.
3. **A complete game-level view.** Rules, presentation, deployments, metadata, and tooling remain separate
   concepts, but their relationship is visible in one place.
4. **Safe growth.** Small games can be concise while large games can extract implementation into focused
   modules without changing the public shape of the project.
5. **Agent usability.** An agent can inspect one file to learn the game topology before selecting a focused
   task or recipe.
6. **Release validation.** CI can validate every game through one typed manifest and report unsupported or
   incomplete configuration consistently.
7. **Migration clarity.** Old games have a concrete target: create the canonical config, connect the new
   manifests, pass validation, then remove legacy bootstraps.

## The intended shape

The exact type names remain subject to the architecture ADRs, but the conceptual shape should be:

```ts
// game.config.ts
import { defineGameConfig } from "@jgengine/core/authoring";
import { game } from "./src/game";
import { presentation } from "./src/presentation";
import { deployments } from "./src/deployments";

export default defineGameConfig({
  game,
  presentation,
  deployments,

  tooling: {
    editor: {
      enabled: true,
      startScene: "main",
    },
    assets: {
      roots: ["./assets"],
    },
    diagnostics: {
      deterministicReplay: true,
      snapshotValidation: true,
    },
  },
});
```

The file is the project assembly manifest. It does not replace the pure rules manifest:

```ts
// src/game.ts
import { defineGame } from "@jgengine/core/authoring";
import { content } from "./content";
import { systems } from "./systems";

export const game = defineGame({
  id: "forest-arena",
  title: "Forest Arena",
  schemaVersion: 1,
  content,
  systems,

  simulation: {
    start(ctx) {},
    playerJoined(ctx, player) {},
    update(ctx, frame) {},
  },
});
```

There remains exactly one public `defineGame`. It defines the portable, headless game contract.
`defineGameConfig` performs a different job: it assembles that game with presentation, deployment profiles,
and project-level tooling in the required root file.

The final names could instead be `configureGame` or `defineGameProject`, but the distinction must remain
clear in types and documentation:

- `defineGame` defines deterministic game identity, content, systems, and rules.
- The default export of `game.config.ts` defines how that game is presented, run, developed, inspected, and
  deployed as a project.

## What belongs in `game.config.ts`

### Required

- The canonical headless game manifest.
- At least one presentation or an explicit headless-only declaration.
- At least one deployment profile, normally `local` or `offline`.
- A typed default export.

### Appropriate project-level configuration

- Presentation selection and renderer adapter.
- Named deployment profiles such as local, preview, hosted, dedicated server, or test.
- Editor enablement and editor entry settings.
- Asset roots and asset-pipeline descriptors.
- Development tools and diagnostics.
- Build-facing metadata that truly applies to the whole game.
- Explicit feature-provider wiring that belongs to application assembly rather than simulation semantics.
- Optional game-facing metadata such as description, icon, tags, minimum engine version, or supported
  platforms, provided there is one authoritative owner for each field.

### What should remain in imported focused modules

- Large content catalogs.
- System implementations.
- Command implementations.
- Simulation lifecycle logic.
- React component bodies.
- Renderer-specific scene construction.
- Transport implementations.
- Database adapters.
- Long environment-specific configuration tables.
- Tests and fixtures.

`game.config.ts` may reference these concerns, but it should not become the file where every concern is
implemented.

## What must not be in the config

The canonical config must remain declarative and safe to load during validation. It must not:

- create a running world;
- open sockets;
- connect to a database;
- start timers or loops;
- read or write save data;
- mutate global registries;
- mount React;
- create renderer resources;
- perform network requests during module evaluation;
- contain secrets;
- silently choose a fallback deployment;
- depend on environment variables without declaring and validating them through a supported descriptor.

Tools must be able to import the config to inspect and validate it without accidentally starting the game.

## Small games and large games

The convention should not force unnecessary file count.

A small game may keep declarations inline:

```ts
// game.config.ts
import {
  defineContent,
  defineGame,
  defineGameConfig,
  defineSystems,
  hudPresentation,
  offlineDeployment,
} from "@jgengine/core/authoring";

const content = defineContent({ /* small catalog */ });
const systems = defineSystems([/* small system set */]);

const game = defineGame({
  id: "tiny-puzzle",
  title: "Tiny Puzzle",
  schemaVersion: 1,
  content,
  systems,
  simulation: { /* compact rules */ },
});

export default defineGameConfig({
  game,
  presentation: hudPresentation({ /* ... */ }),
  deployments: {
    local: offlineDeployment(),
  },
});
```

As the project grows, content, systems, rules, presentation, and deployments move into their own modules.
The root contract does not change. This avoids making beginners manage a large architecture before they
need it while preventing mature games from turning the config into a thousand-line file.

## Deployment profiles

The config should expose supported deployments by explicit name:

```ts
export default defineGameConfig({
  game,
  presentation,
  deployments: {
    local: offlineDeployment(),
    preview: hostedGame({
      authority: serverAuthority(),
      transport: websocketTransport({
        url: requiredEnvironment("JGENGINE_PREVIEW_URL"),
      }),
      persistence: memoryPersistence(),
    }),
    production: hostedGame({
      authority: serverAuthority(),
      transport: websocketTransport({
        url: requiredEnvironment("JGENGINE_SERVER_URL"),
      }),
      persistence: postgresPersistence({
        connection: requiredEnvironment("DATABASE_URL"),
      }),
    }),
  },
});
```

Commands then operate against a declared profile:

```text
jg dev --game ./game.config.ts --deployment local
jg verify --game ./game.config.ts
jg deploy --game ./game.config.ts --deployment production
jg editor --game ./game.config.ts
```

The command may discover `game.config.ts` automatically from the working directory, but it should still
report the resolved path. A profile that is not declared does not exist. Missing providers or environment
requirements fail with clear diagnostics rather than switching modes.

## Tooling behavior

All first-party tooling should resolve the same config contract:

- **CLI:** project creation, development, build, verification, migration, and deployment.
- **Editor:** content, systems, scenes, presentation adapters, and preview startup.
- **Test harness:** headless game extraction, deployment integration fixtures, and snapshot schema checks.
- **Documentation tooling:** project topology, declared capabilities, supported profiles, and compiling
  recipes.
- **Agent skills:** initial project inspection and safe task routing.
- **Website/gallery tooling:** metadata and supported runtime/presentation information.

No tool should maintain a second list of special filenames that reconstructs the game from unrelated files.
The config is the index; imported descriptors are the implementation.

## Type and validation guarantees

Loading the config should validate:

- the default export is a JGengine game config;
- the game has a stable serializable ID and schema version;
- system dependencies form a valid graph;
- typed content definitions agree with installed systems;
- presentation mappings reference valid content and commands;
- each deployment profile declares supported authority, transport, and persistence;
- required provider packages are installed;
- required environment values are declared;
- unsupported combinations fail;
- asset roots and authored scene references resolve;
- tooling options are compatible with the selected presentation and deployment descriptors;
- there is no duplicate game identity within the workspace where that can be checked.

The same validation powers local diagnostics, CI, editor feedback, and deployment checks. There should not be
one permissive loader for development and a different undocumented loader for production.

## Relationship to workspaces and multiple games

A repository may contain many games, but each game has its own config:

```text
games/
  chess/
    game.config.ts
  forest-arena/
    game.config.ts
  voxel-survival/
    game.config.ts
```

A workspace-level file may index games for monorepo commands, but it must not absorb or replace each game's
canonical config. The game remains independently inspectable, testable, packageable, and deployable.

Shared content, systems, presentations, or deployment helpers can live in packages and be imported by
multiple configs. Shared code does not mean shared mutable runtime state.

## End-state developer experience

A developer entering an unfamiliar game opens `game.config.ts` first. In one screen they can see:

- the stable game manifest being used;
- where content and rules live;
- which presentation is active;
- the supported deployment profiles;
- whether editor and diagnostics are enabled;
- which asset roots and application-level providers are part of the project.

From there they follow typed references into the focused module they need. They do not search package scripts,
read a shell bootstrap, inspect a generated registry, or guess which `defineGame` call is active.

An agent follows the same process. A CLI command and the editor resolve the same file. A deployment uses the
same profile that CI validated. The config shown in documentation is the config generated by the scaffold.
The game therefore has one visible front door even though the engine remains modular behind it.

## Acceptance criteria

The rewrite should include these gates:

- Every generated game contains a root `game.config.ts`.
- Every repository game and example has exactly one canonical `game.config.ts`.
- The CLI, editor, verifier, test harness, build, and deployment tooling resolve that file through one shared
  loader.
- The default export is typed and declarative.
- Loading the config has no runtime side effects.
- Small games can be implemented mostly inline without violating the contract.
- Large games can extract every major concern without changing the root contract.
- The config references one pure `defineGame` manifest.
- Deployment profiles are explicit and validated.
- No ordinary tool must infer the active game from package scripts, shell bootstraps, or deep imports.
- Packed starter tests verify the generated config using installed package artifacts.
- Documentation and agent recipes begin with `game.config.ts` as the canonical project entry point.

## Guardrail

The existence of a top-level config must not be used as an excuse to rebuild the current mega-config under a
new name. The file should be a concise, typed assembly map. Systems still own their state and schemas. Rules
remain headless. Presentation remains replaceable. Deployment remains truthful. Tooling remains optional and
separate from runtime semantics.

The desired outcome is both:

- **one obvious place to understand the whole game**, and
- **clear boundaries that keep the whole game from being implemented in that one place**.
