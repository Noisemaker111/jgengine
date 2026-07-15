# Canonical `game.config.ts` Contract

> This document refines the JGengine rewrite end state. Every game must have one required,
> top-level `game.config.ts` file. That file is not a wrapper around a second `game.ts` manifest.
> It is the complete public definition of the game and the canonical entry point for developers,
> the CLI, editor, tests, builds, deployment tooling, documentation tooling, and agents.

## Decision

Every JGengine game directory has exactly one canonical game definition:

```text
games/forest-arena/
  game.config.ts
  package.json
  assets/
  src/
    content/
    systems/
    ui/
    scenes/
    tests/
```

Only `game.config.ts` is required by the engine. The files under `src/` are optional organization choices,
not additional manifests that JGengine expects every project to contain.

A game is not considered a valid JGengine game without a root `game.config.ts`. There is no required
`game.ts`, `app.tsx`, `presentation.tsx`, `deployment.ts`, or shell bootstrap beside it.

## The central simplification

The earlier proposal separated a pure `defineGame` manifest from a second project-assembly call. That still
leaves authors deciding where the real game lives and forces tools to understand two public definitions.
The desired end state is simpler:

- one required file;
- one default export;
- one public top-level `defineGame` call;
- one typed object containing the game's identity, content, systems, rules, presentation, deployments,
  assets, editor behavior, and project tooling;
- one loader used by all first-party tools.

The engine may internally extract a headless runtime definition, presentation plan, deployment plan, asset
plan, and editor plan from the config. Those internal boundaries should remain strong, but authors should
not need to maintain separate public manifests merely to express those boundaries.

## Canonical shape

The exact field names remain subject to ADRs, but the public model should look like this:

```ts
// game.config.ts
import {
  defineContent,
  defineGame,
  defineSystems,
  entitySystem,
  inventorySystem,
  combatSystem,
  threePresentation,
  offlineDeployment,
  hostedDeployment,
  serverAuthority,
  websocketTransport,
  postgresPersistence,
  requiredEnvironment,
} from "@jgengine/core/authoring";

const content = defineContent({
  entities: {
    player: {
      disposition: "player",
      resources: {
        health: { initial: 100, maximum: 100 },
      },
    },
  },
  items: {
    trainingSword: {
      name: "Training Sword",
    },
  },
});

const systems = defineSystems([
  entitySystem({ definitions: content.entities }),
  inventorySystem({ items: content.items }),
  combatSystem(),
]);

export default defineGame({
  id: "forest-arena",
  title: "Forest Arena",
  schemaVersion: 1,

  metadata: {
    description: "A small cooperative arena game.",
    tags: ["action", "multiplayer"],
    icon: "./assets/icon.png",
  },

  content,
  systems,

  simulation: {
    start(ctx) {},

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

  presentation: threePresentation({
    scene: "./src/scenes/main.scene.ts",
    hud: "./src/ui/GameHud.tsx",
    camera: "third-person",
  }),

  deployments: {
    local: offlineDeployment(),

    production: hostedDeployment({
      authority: serverAuthority(),
      transport: websocketTransport({
        url: requiredEnvironment("JGENGINE_SERVER_URL"),
      }),
      persistence: postgresPersistence({
        connection: requiredEnvironment("DATABASE_URL"),
      }),
    }),
  },

  assets: {
    roots: ["./assets"],
  },

  editor: {
    enabled: true,
    startScene: "main",
  },

  tooling: {
    diagnostics: {
      deterministicReplay: true,
      snapshotValidation: true,
    },
  },
});
```

This is the whole game as far as JGengine is concerned. The default export is the value loaded by the CLI,
editor, verifier, test harness, build, deployment tooling, website/gallery tooling, and agent workflows.

## One file does not mean one giant implementation

The config is allowed to contain the entire implementation for a small game. That is a feature, not a
failure. A tiny game should not need six files just to satisfy an architecture diagram.

As a game grows, any section may be imported:

```ts
// game.config.ts
import { defineGame } from "@jgengine/core/authoring";
import { content } from "./src/content";
import { systems } from "./src/systems";
import { simulation } from "./src/simulation";
import { presentation } from "./src/presentation";
import { deployments } from "./src/deployments";

export default defineGame({
  id: "forest-arena",
  title: "Forest Arena",
  schemaVersion: 1,
  content,
  systems,
  simulation,
  presentation,
  deployments,
});
```

Those imported files are ordinary modules. None of them is a second game entry point, none has a required
filename, and no first-party tool discovers them independently. They exist only because the author chose
to split a large config into maintainable pieces.

The invariant is:

> Organization may be distributed, but authority remains centralized in `game.config.ts`.

## What belongs in the top-level definition

The top-level `defineGame` object may contain or reference all game-wide concerns:

### Identity and compatibility

- Stable game ID.
- Display title.
- Game schema version.
- Minimum or supported engine version where needed.
- Description, icon, tags, and supported platforms.

### Content and capabilities

- Typed entities, items, effects, quests, dialogue, maps, scenes, and other authored content.
- Installed systems and their dependencies.
- Commands, actions, and event definitions where they are game-wide.

### Rules

- Startup and shutdown behavior.
- Player join and leave behavior.
- Simulation update hooks.
- Deterministic rule handlers.
- Game-wide validation and win/loss conditions.

### Presentation

- Renderer or headless presentation descriptor.
- Scene and visual mappings.
- Camera behavior.
- Input bindings.
- HUD and UI roots.
- Audio mappings.

### Deployment

- Named offline, preview, hosted, peer, or dedicated-server profiles.
- Authority model.
- Transport provider.
- Persistence provider.
- Declared environment requirements.
- Explicit fallback policy, if fallback is allowed at all.

### Project tooling

- Asset roots and asset-pipeline descriptors.
- Editor enablement and defaults.
- Diagnostics and deterministic replay settings.
- Verification options.
- Development-only tooling.
- Build-facing settings that truly apply to the whole game.

## What should be imported when it becomes large

The following may begin inline and move out when size or reuse justifies it:

- Large content catalogs.
- Custom system implementations.
- Command implementations.
- Complex simulation handlers.
- React component bodies.
- Renderer-specific scene construction.
- Transport or database provider implementations.
- Long deployment tables.
- Tests and fixtures.

The engine should not enforce a file-per-concern layout. It should enforce only the typed config contract and
the absence of forbidden module-evaluation side effects.

## What must not happen while loading the config

`game.config.ts` must remain safe for tools to import and inspect. Evaluating the module must not:

- create a running world;
- open sockets;
- connect to a database;
- start timers or loops;
- read or write save data;
- mount React;
- allocate renderer resources;
- perform network requests;
- mutate hidden global registries;
- contain secrets;
- silently choose a fallback deployment;
- read undeclared environment values;
- start the editor or development server.

Descriptors may declare how those resources are created later. The loader validates declarations; the
selected runtime command performs the actual side effects.

## Small-game end state

A generated small game can be nearly one file:

```text
tiny-puzzle/
  game.config.ts
  package.json
  assets/
```

```ts
// game.config.ts
import {
  defineContent,
  defineGame,
  defineSystems,
  hudPresentation,
  offlineDeployment,
} from "@jgengine/core/authoring";

const content = defineContent({
  // Small catalog.
});

export default defineGame({
  id: "tiny-puzzle",
  title: "Tiny Puzzle",
  schemaVersion: 1,
  content,
  systems: defineSystems([]),
  simulation: {
    // Compact rules.
  },
  presentation: hudPresentation({
    // Compact UI mapping.
  }),
  deployments: {
    local: offlineDeployment(),
  },
});
```

There is no generated placeholder `game.ts`, `app.tsx`, or deployment file that merely re-exports values.
The starter introduces more files only when the selected template genuinely needs them.

## Large-game end state

A mature game can still have a substantial directory tree:

```text
forest-arena/
  game.config.ts
  package.json
  assets/
  src/
    content/
      entities.ts
      items.ts
      quests.ts
    systems/
      factions.ts
      weather.ts
    simulation/
      lifecycle.ts
      commands.ts
    presentation/
      scene.ts
      camera.ts
      hud.tsx
    deployment/
      profiles.ts
```

The root config imports those pieces and remains the only public game definition. Renaming or reorganizing
internal files does not change how the CLI, editor, tests, deployment tooling, or agents discover the game.

## Headless execution from the same config

Keeping one public definition does not make headless testing depend on rendering or deployment.
`defineGame` must preserve typed internal sections so tools can compile only what they need:

```ts
const config = await loadGameConfig("./game.config.ts");

const testWorld = createHeadlessWorld(config, {
  randomSeed: 42,
});
```

The headless loader consumes identity, content, systems, commands, and simulation. It validates but does not
instantiate presentation or deployment resources.

Likewise:

- the editor consumes content, systems, assets, scenes, and presentation descriptors;
- the deployment command consumes the game identity, system graph, command schemas, snapshot contract, and
  selected deployment profile;
- the gallery consumes metadata and declared presentation information;
- documentation tooling consumes the same typed config to explain the project.

The single file is a shared source of truth, not a requirement that every subsystem initialize together.

## Deployment profiles

All supported modes are declared in the config:

```ts
export default defineGame({
  // ...identity, content, systems, simulation, and presentation...

  deployments: {
    local: offlineDeployment(),

    preview: hostedDeployment({
      authority: serverAuthority(),
      transport: websocketTransport({
        url: requiredEnvironment("JGENGINE_PREVIEW_URL"),
      }),
      persistence: memoryPersistence(),
    }),

    production: hostedDeployment({
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

Commands operate against the same file and a named profile:

```text
jg dev --deployment local
jg verify
jg editor
jg deploy --deployment production
```

The CLI discovers `game.config.ts` from the working directory and reports the resolved path. A profile that
is not declared does not exist. Unsupported providers or missing environment requirements fail clearly.
There is no hidden multiplayer-to-offline conversion.

## Tooling behavior

All first-party tooling must use one shared config loader:

- **CLI:** creation, development, build, verification, migration, and deployment.
- **Editor:** content inspection, scenes, presentation adapters, and preview startup.
- **Test harness:** headless extraction, deterministic execution, snapshot checks, and deployment fixtures.
- **Documentation tooling:** metadata, capabilities, profiles, examples, and project topology.
- **Agent skills:** initial project inspection and task routing.
- **Website/gallery tooling:** metadata and supported runtime/presentation information.

No tool should infer the game from package scripts, shell bootstraps, source filenames, registries, or a
second manifest.

## Type and validation guarantees

Loading the config should validate:

- the default export is a JGengine game definition;
- the game has a stable serializable ID and schema version;
- system dependencies form a valid graph;
- typed content definitions agree with installed systems;
- commands and actions have valid payload and actor contracts;
- simulation handlers receive the context inferred from installed systems;
- presentation mappings reference valid content, actions, and commands;
- each deployment profile declares supported authority, transport, and persistence;
- required provider packages are installed;
- required environment values are declared;
- unsupported combinations fail;
- asset roots and scene references resolve;
- editor and tooling settings are compatible with the selected descriptors;
- duplicate game identity is rejected within a workspace where that can be checked.

The same validation powers local diagnostics, CI, editor feedback, and deployment checks. There should not
be one permissive loader for development and a different undocumented loader for production.

## Relationship to workspaces

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

A workspace-level file may index game directories for monorepo commands, but it must not replace each
game's canonical config. Shared content, systems, presentations, or deployment helpers can live in packages
and be imported by multiple configs. Shared code must not imply shared mutable runtime state.

## Required migration from the earlier proposal

The implementation program should treat this contract as a refinement of the earlier target architecture:

- Remove the requirement for a separate public `game.ts` manifest.
- Remove a second public project-assembly function such as `defineGameConfig`.
- Keep one public `defineGame`, used as the default export of `game.config.ts`.
- Preserve simulation, presentation, deployment, assets, editor, and tooling as typed nested descriptors.
- Allow internal compiler/runtime layers to extract those descriptors independently.
- Change scaffolds, docs, skills, golden-game migrations, and tooling to begin at `game.config.ts`.

This is not a request to collapse the engine internals into one module. It is a request to collapse the
public game-authoring entry points into one coherent definition.

## Acceptance criteria

The rewrite should include these gates:

- Every generated game contains exactly one root `game.config.ts`.
- Every repository game and example has exactly one canonical `game.config.ts`.
- There is no required public `game.ts`, `app.tsx`, presentation manifest, deployment manifest, or shell
  bootstrap.
- The root file default-exports the result of the one public `defineGame`.
- Identity, content, systems, simulation, presentation, deployment, assets, editor, and tooling are sections
  of that definition or values imported into those sections.
- The CLI, editor, verifier, tests, build, deployment, docs, gallery, and agent tooling resolve the file
  through one shared loader.
- Loading the file has no runtime side effects.
- Headless tests can use the config without initializing presentation or deployment resources.
- Small games can remain mostly or entirely in one file.
- Large games can extract any section without creating a second canonical manifest.
- Deployment profiles are explicit and validated.
- Packed starter tests verify the generated config using installed package artifacts.
- Documentation and agent recipes begin with `game.config.ts` as the canonical and complete game definition.

## Guardrail

A single top-level definition must not recreate an untyped mega-config.

The root object should be composed from typed descriptors. Systems still own their state, codecs,
migrations, and replication behavior. Simulation remains deterministic and headless. Presentation remains
replaceable. Deployment remains explicit and truthful. Tooling remains inspectable without starting the
runtime.

The desired outcome is:

> **Everything that makes this game this game is reachable from one `game.config.ts`, and there is no second
> public file that is more authoritative than it.**
