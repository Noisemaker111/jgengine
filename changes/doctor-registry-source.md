### Fixed

- `jgengine doctor` flags component folders reached through a `tsconfig` path alias (such as a shared `@/components/ui/*` registry) that game code imports but `src/index.css` never scans with `@source`. Their Tailwind classes were silently not generated, so those HUD blocks rendered tiny and unstyled; the fix text names the exact `@source` line to add.
