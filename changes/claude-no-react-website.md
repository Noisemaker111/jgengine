The `/play` game runner build (apps/dev, and games' `engineSourceAliases`) resolves engine packages by npm name, so `@jgengine/react` (in `packages/ui`) resolves to source again; since 0.56.1 the runner build failed with missing `@jgengine/react/hooks` exports.

Engine seam: none - game content only

### Changed

- jgengine.com draws with the engine's own JSX runtime instead of React; LLMville drops react; /play runner resolves @jgengine/react again

### Fixed

- The `/play` game runner build (apps/dev, and games' `engineSourceAliases`) resolves engine packages by npm name, so `@jgengine/react` (in `packages/ui`) resolves to source again; since 0.56.1 the runner build failed with missing `@jgengine/react/hooks` exports.
