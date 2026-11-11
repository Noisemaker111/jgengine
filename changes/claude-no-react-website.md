jgengine.com no longer runs on React. The site was a TanStack Start app; its pages are now drawn with the engine's own JSX runtime (`@jgengine/core/ui/jsx`), prerendered to static HTML at build time, and brought to life in the browser by the same runtime. A small Worker answers the GitHub API proxy, `/llms.txt`, `/llms-full.txt`, `/agents.md`, `/sitemap.xml` and the 404 page. LLMville drops its unused `react` dependency, and `bun run check react-free` now covers the website too: only the two React host examples may use React.

### Fixed

- The `/play` game runner build (apps/dev, and games' `engineSourceAliases`) resolves engine packages by npm name, so `@jgengine/react` (in `packages/ui`) resolves to source again; since 0.56.1 the runner build failed with missing `@jgengine/react/hooks` exports.
