### Fixed

- The dev server no longer watches `.jgengine/`, the folder `jgengine desktop` stages its build in, so desktop builds stop reloading or crashing a running `bun dev`. Root cause: Vite's default watch ignores cover only `.git`, `node_modules` and `test-results`, so every write into the staging folder reached the watcher. Generated `vite.config.ts` files set `server.watch.ignored` (`jgengine sync` carries it to existing games), and the standalone `.gitignore` lists `.jgengine/`.
