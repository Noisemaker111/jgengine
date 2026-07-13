# JGEngine public API design

JGEngine exists to remove engine plumbing from game code. Its public API must describe what a game author wants, not how the engine implements it.

## API tiers

### 1. Authoring

The default surface for games and coding agents. Import from `@jgengine/core/authoring`.

Authoring APIs use game vocabulary, accept semantic object arguments, provide useful defaults, hide stores and synchronization machinery, and return values that can be consumed without understanding internal ownership.

### 2. Feature primitives

Domain modules such as `combat/*`, `world/*`, and `game/*`. These remain public for custom systems, but authoring documentation prefers the authoring surface when it covers the task.

### 3. Infrastructure

Runtime, store, transport, snapshot, synchronization, and adapter modules. Engine packages and advanced integrations use these. Game tutorials and generated recipes must not lead with them.

### 4. Internal

Implementation details with no compatibility promise. Internal code must not be re-exported from authoring entry points.

## Naming contract

- `defineX`: declare immutable authored game data.
- `createX`: instantiate mutable runtime state or a service.
- `computeX`: perform a pure calculation.
- `resolveX`: normalize authored input into runtime-ready data.
- `advanceX`: advance deterministic simulation using caller-provided time.
- `selectX`: choose from caller-provided candidates.
- `getX`: retrieve existing data without meaningful computation.
- `useX`: React hook only.

Avoid generic or implementation-shaped names such as `model`, `manager`, `gate`, `context`, `store`, `summary`, or `runtime` in authoring APIs unless the concept itself is what the caller intentionally chooses.

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

Public objects encode domain meaning, units, defaults, valid ranges, ownership, mutability, and deterministic inputs such as time and randomness. They do not expose precomputed random rolls, signed exponents, store plumbing, transport implementation details, or positional booleans.

## Defaults and errors

Defaults are part of the API contract and must produce a useful common-case result. Errors name the authoring concept, the invalid value, and the correction without leaking source paths or internal types.

## Documentation contract

Every authoring API includes a one-sentence purpose, when to use it, a minimal complete example, semantic field descriptions and defaults, lifecycle and ownership notes, deterministic behavior notes, and a small set of related APIs.

Documentation order is task-first: create a game, create a world, add interaction, add entities and gameplay, add UI, add saving or multiplayer, then customize with primitives. Generated symbol inventory is reference material, never the primary learning path.

## Migration policy before 1.0

No external compatibility burden is assumed before 1.0 unless a shipped repository game depends on the surface. Prefer direct correction over permanent aliases. When repository code depends on a renamed API, migrate it in the same change.

Compatibility overloads are temporary and require a removal note. Do not preserve implementation-shaped APIs merely because they already exist.

## Review checklist

A public API is ready when game code can state intent without infrastructure imports, the common call reads naturally without comments, deterministic tests can inject time and randomness, invalid combinations are rejected clearly, docs show an immediately usable example, agents can choose it without reading source, and repository games use it instead of private workarounds.
