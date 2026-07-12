# JGEngine public API design

JGEngine exists to remove engine plumbing from game code. Its public API must describe what a game author wants, not how the engine implements it.

## API tiers

### 1. Authoring

The default surface for games and coding agents. Import from `@jgengine/core/authoring`.

Authoring APIs:

- use game vocabulary;
- accept semantic object arguments;
- provide useful defaults;
- hide stores, contexts, synchronization gates, weighted rolls, and module layout;
- return values that can be consumed without understanding internal ownership.

### 2. Feature primitives

Domain modules such as `combat/*`, `world/*`, and `game/*`. These remain public for custom systems, but authoring documentation should prefer the authoring surface when it covers the task.

### 3. Infrastructure

Runtime, store, transport, snapshot, synchronization, and adapter modules. Engine packages and advanced integrations use these. Game tutorials and generated recipes must not lead with them.

### 4. Internal

Implementation details with no compatibility promise. Internal code must not be re-exported from authoring entry points.

## Naming contract

Public names carry consistent meaning:

- `defineX`: declare immutable authored game data.
- `createX`: instantiate mutable runtime state or a service.
- `computeX`: perform a pure calculation.
- `resolveX`: normalize authored input into runtime-ready data.
- `advanceX`: advance deterministic simulation using caller-provided time.
- `selectX`: choose from caller-provided candidates.
- `getX`: retrieve existing data without meaningful computation.
- `useX`: React hook only.

Avoid generic or implementation-shaped names such as `model`, `manager`, `gate`, `context`, `store`, `summary`, or `runtime` in authoring APIs unless the concept itself is what the caller is intentionally choosing.

## Parameter contract

Prefer one semantic object once a function has more than one meaningful argument.

Good:

```ts
selectSpawnPoint({
  candidates,
  avoid: playerPositions,
  random,
  distanceBias: "far",
});
```

Bad:

```ts
pickSpawnPoint(points, players, { roll, bias: -4 });
```

The public object should encode:

- domain meaning;
- units in names or documentation;
- defaults;
- valid ranges;
- ownership and mutability;
- deterministic inputs such as time and randomness.

It should not expose:

- precomputed random rolls;
- signed exponents or weighting formulas;
- internal IDs when authored names work;
- store plumbing;
- renderer or transport implementation details;
- positional booleans.

## Defaults

Defaults are part of the API contract. They must be documented beside the field and should produce a useful result for the common case. A caller should not need to copy engine defaults into game code.

## Errors

Errors name the authoring concept, the invalid value, and the correction. Do not leak internal class names or source paths.

Good:

```text
defineGame: name must contain at least one non-whitespace character
```

Bad:

```text
GameDefinitionConfig validation failed
```

## Documentation contract

Every authoring API includes:

1. a one-sentence purpose;
2. when to use it;
3. a minimal complete example;
4. semantic field descriptions and defaults;
5. lifecycle and ownership notes when stateful;
6. deterministic behavior notes;
7. links to at most five related APIs.

Documentation order is task-first:

1. create a game;
2. create a world;
3. add player interaction;
4. add entities and gameplay;
5. add UI;
6. add saving or multiplayer;
7. customize with lower-level primitives.

Generated symbol inventory is reference material, never the primary learning path.

## Migration policy before 1.0

No external compatibility burden is assumed before 1.0 unless a shipped game in this repository depends on the surface. Prefer direct correction over permanent aliases. When a repository-owned game depends on a renamed API, migrate it in the same change.

Compatibility overloads are temporary and require a removal note. Do not preserve implementation-shaped APIs merely because they already exist.

## Review checklist

A public API is ready when:

- game code can state intent without importing infrastructure modules;
- the most common call reads naturally without comments;
- deterministic tests can inject time and randomness;
- invalid combinations are unrepresentable or rejected clearly;
- generated docs show an immediately usable example;
- an agent can choose the API from its name and description without reading source;
- repository games use the new surface instead of retaining private workarounds.
