import CHANGELOG from @jgengine/core/meta/changelog; the package root exports VERSION only

Engine seam: packages/core/src/devtools/diagnosticOverlay.view.tsx, packages/core/src/index.ts, packages/core/src/meta/changelog.ts, packages/core/src/meta/version.ts, packages/core/src/procedural.ts, packages/github/src/analytics.ts, packages/github/src/calendar.ts, packages/github/src/client.ts and 10 more

### Migrate

- import CHANGELOG from @jgengine/core/meta/changelog; the package root exports VERSION only
- @jgengine/core/procedural is gone; import from sim/needs, survival/moodle and survival/regionHealth

### Added

- `VERSION` (`@jgengine/core/meta/version`): Installed `@jgengine/core` semver - compare against `CHANGELOG` keys (`@jgengine/core/meta/changelog`) when migrating.

### Removed

- @jgengine/github; the site's GitHub endpoints live in the site
- `@jgengine/core` no longer exports `CHANGELOG`, `ChangelogEntry`.
- `@jgengine/core/meta/changelog` no longer exports `VERSION`.
- `@jgengine/core/procedural` no longer exports `Moodle`, `MoodleStack`, `MultiRegionHealth`, `NeedSet`, `createMoodleStack`, `createMultiRegionHealth`, `createNeedSet`, `stackMoodles`.
