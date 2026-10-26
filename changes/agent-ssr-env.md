Server rendering no longer breaks when the engine checks whether it is a production build. The check read `import.meta.env` as a whole object, which Vite's server module runner rejects ("Dynamic access of import.meta.env"), so any dev warning raised while a page rendered on the server (the playground's city did this) threw and the page fell back to client rendering.

### Added

- `readBuildEnv()` (`@jgengine/core/devtools/saveEndpoint`, internal): the one reader of the bundler's build flags (`DEV`, `PROD`, `NODE_ENV`, `VITE_JGENGINE_DEV_PROXY`), each read by its literal name.

### Changed

- `isProductionEnvironment` and `proxiedUrl` read their flags through `readBuildEnv`.

Verification:
- In Vite's server module runner, the old `saveEndpoint.ts` throws "Dynamic access of import.meta.env is not supported"; the new one returns `isProductionEnvironment() === false` and `proxiedUrl` works.
- `bun test packages/core/src/devtools packages/core/src/data packages/core/src/random` and `bun run check types`: pass
- Playground and home page in the web dev server: rendered on the server, no page errors.
