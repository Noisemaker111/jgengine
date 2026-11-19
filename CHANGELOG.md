# Changelog

The lockstep game SDK set is `@jgengine/{core,rapier,react,ws,node,sql,convex,shell,editor,assets}`
(this file’s 0.x.y releases). The CLI package `jgengine` and `@jgengine/github` use
**separate** version lines and may lag. Format follows [Keep a Changelog](https://keepachangelog.com);
each release **leads with a Migrate block** — the concrete steps to move a game
from the previous version onto the new APIs — because the point of a bump is to
let consumers pick up the better stuff, not just to list what moved.

Agents building on the published SDK can also read this programmatically:
`import { VERSION, CHANGELOG } from "@jgengine/core/meta/changelog"` gives the
same data as typed values, so an updater can diff its installed version against
the latest and surface the migration steps. Easier still: `npx jgengine upgrade`
run inside a game project diffs the installed `@jgengine/*` versions against the
latest release and prints every Migrate step and Adopt-worthy addition in
between (`--json` for structured output).

## [Unreleased]

<!--
Every PR that changes `packages/*/src` records its consumer-facing change here, so
the next release's notes are complete by construction. Add a bullet under the right
subhead below. `bun run check-changelog` fails a source PR whose `[Unreleased]` block
is untouched; pure refactors/tests bypass with `[skip changelog]` in a commit message.
At publish, rename this heading to the new version and mirror the entries into
`packages/core/src/meta/changelog.ts` (the typed `CHANGELOG` export).
-->

## 0.59.0

### Migrate

- **Bump lockstep SDK packages to `^0.59.0`:** `@jgengine/{core,rapier,ui,ws,node,sql,convex,shell,editor,assets,navbake}`. CLI `jgengine` is `0.56.0`; `@jgengine/github` is `0.46.0`.
- `driveStep` (`@jgengine/core/ai/driver`) now returns `steer` in the shared steer-right convention of `steerYaw`/`steerToward` (+1 = turn right). Delete any `-step.steer` negation and pass `steer` straight to the vehicle sim.
- `generateStreets(rules, hx, hz, context)` is gone: run `STREET_NETWORK_GENERATOR` (`@jgengine/core/roads/streetGenerator`) with `runGenerator(STREET_NETWORK_GENERATOR, { ...dials, halfX, halfZ, seed, bridges?, tunnels?, minElevation?, tunnelClearance? }, { input: { heightAt } })`. `StreetNetworkRules` and `StreetNetworkContext` are replaced by `StreetNetworkParams` (the parsed `STREET_NETWORK_SCHEMA`) and `StreetNetworkInput`; the `net` and `circuit` presets are on the schema. The dead `outline` and `residentialBranches` dials are dropped from the street generator.
- `StreetNetwork.elevationAt` is gone; the output is plain data. Rebuild the road-surface field with `streetElevationField({ elevation, halfX, halfZ }, seed)`.
- `extractCircuitRoute(network, rules)` takes `(network, params, { seed })`: parse the lap dials with `parseParams(CIRCUIT_ROUTE_SCHEMA, { lapLength, ... })` and pass the seed of the generator that grew the streets. `CircuitRouteRules` and `CIRCUIT_ROUTE_DEFAULTS` are replaced by `CircuitRouteParams` and the schema defaults. `RACE_CIRCUIT_GENERATOR` grows the streets and lifts the lap in one call.
- `CITY_DEFAULTS` and `readCityRules` are gone: `CITY_SCHEMA` is a `defineParamSchema` and `CityRules` is derived from it. The legacy `buildingDensity` meta key no longer maps onto `roadsideOccupancy`/`blockDensity`; set those keys.

### Added

- `TalentTree.hydrate` returns a `TalentHydrateResult` (`ok`, `issues`) naming each saved rank it dropped (`unknown-node`, `invalid-rank`) or clamped (`max-rank`), and warns once in dev.
- `GeneratorContext.input`: a generator declares world data its output depends on that a meta bag cannot hold (`GeneratorDefinition<Schema, Output, Input>`), and `runGenerator`/`prepareGenerator` pass it with `{ input }`. It is undefined in the variant grid.
- `CITY_GENERATOR` (`city`, output `city`), `STREET_NETWORK_GENERATOR` (`streets`, output `street-network`) and `RACE_CIRCUIT_GENERATOR` (`race-circuit`, output `race-circuit`) are registered with the city kind, the `city` kind names its generator, and each output family has a variant-tile preview, so `generator_variants` rolls districts, street nets and laps.
- `CityLot.seed`: each lot's seed, derived from the district seed; the city renderer seeds near-detail buildings and wall paint from it.
- `bun run gen-audit [--generator streets|city|circuit|race] [--preset id] [--seeds n] [--half m] [--out dir] [--no-png] [--other-libm]` runs every preset of the street, city and race-circuit generators over seeds and writes annotated top-down contact sheets (SVG + PNG: corner radius/angle and kind, straights, gates, grid, seals, sectors, pit lanes, point-mass sim speed and braking, road and roof height, terrain underlay), `metrics.json` and `report.md` with each preset judged against cited reference bands. `--other-libm` regenerates under a simulated other platform libm and flags any output that changes. The default audit takes about 10 s.
- `streetNetworkMetrics` and `roadElevationMetrics` (`@jgengine/core/roads/streetMetrics`): intersection and road density, node-degree mix with interior vs rim dead ends, Boeing's orientation order, edge circuity and detour ratio, hierarchy shares and the arterial level-flip rate, face-of-graph block sizes, enclosed and land-in-blocks shares, kept street length; road grade, junction steps and road-vs-ground offset.
- `analyzeCircuit` and `circuitMetrics` (`@jgengine/core/roads/circuitMetrics`): lap length and error, corners per km by kind (hairpin, right-angle, tight, medium, sweeper, kink) with radius p10/p50/p90, right-angle share, chicanes, straights a straight line fits through, braking zones and overtaking spots, elevation range, climb and max grade, grid slots in corners, seals per km, sectors in corners, pit-lane connectivity and seals across pits.
- `simulateLap` (`@jgengine/core/roads/lapSim`): a point-mass lap-time simulator (grip-limited corners, acceleration and braking passes from the slowest point).
- `cityMetrics` and `cityMetricsInput` (`@jgengine/core/city/cityMetrics`): rasterized coverage, FAR, pavement share, land in blocks, open-block share, template variety per class, height-vs-distance Spearman ρ, landmarks, buildings on a carriageway, kept street length.
- `GENERATOR_REFERENCE_PROFILES`, `GENERATOR_REFERENCE_CITATIONS`, `referenceProfileFor` and `judgeBands` (`@jgengine/core/generator/referenceBands`): real-world reference bands (Boeing 2017/2019, Levinson & El-Geneidy 2009, FHWA 2013, UN-Habitat 2013, NYC Zoning Resolution, PLSS, F1 circuit data, FIA Appendix O) and the generator audit's acceptance targets, per place profile.
- `mean`, `quantile`, `coefficientOfVariation` and `spearman` (`@jgengine/core/math/stats`).
- `DEV_REPORT_COOKIE` (`@jgengine/core/devtools/reportEndpoint`): Cookie the dev servers set on the pages they serve, so a page asks for the report route only where it exists. Also `servedByDevServer`.

### Changed

- Postfx scene prepasses (GTAO's normal prepass, DOF's depth prepass, the stylize outline prepass) start three's walk where the beauty pass's flat walk did instead of walking the whole scene graph: Scrap Signal's normal prepass walked all 11,600 nodes of its graph for the ~150 meshes it draws, and its post chain's main-thread time drops by about a quarter. The draws, their order and the image are unchanged.
- The cascaded-shadow material-swap hook every mesh runs before each draw (main and shadow passes) passes three's arguments on as they came instead of gathering them into an array per draw, and skips three's empty default hook.
- AGENTS.md back under its 41-line mark
- A model pack is provisioned only when every model its index lists is on disk
- README and jgengine.com now show the API: a whole game in four compiled files (rules, store and system, JSX HUD, defineGame), the three-layer file naming, and concrete reasons it differs. The README quotes apps/web/src/snippets/tour-* exactly, and a test keeps it that way. Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
- Releases come from beta and a version tag, with no release branch, release PR or main. bun run release cuts on origin/beta's tip, pushes the one Release commit straight to beta, waits for beta's CI on it, then pushes v<version>; publish.yml runs on that tag (it refuses a tag that names another version, a commit CI has not passed, or a commit off beta) and writes the GitHub release from the CHANGELOG section. bun run release --wait <version> [--sha <beta commit>] finishes a release that stopped part-way. CI and the asset mirror run on beta pushes only; the Windows suite is a plain required job. Root cause: a release was a release/<version> branch, a PR into beta, a fast-forward of main, a second full CI run on main, and a Publish chained to that run. 17 release PRs in three weeks, 30 main CI runs (242 runner-minutes) repeating beta's verdict, and Publish failed 14 of its last 40 runs, several because beta moved while main's CI ran. Prevention: publish-workflow.test.ts holds the trigger to the v* tag (no branch push, no workflow_run); release-await.test.ts holds the CI wait before the tag.
- Nothing points at the main branch any more, so it can be deleted: the CLI's jgengine upgrade reads CHANGELOG.md from beta, the site's skills link and the credits link go to beta, pr-shots starts its archive from beta, and land, lane:close and the session hooks drop their main and release/* cases. Fixed: npx jgengine upgrade fetches the published changelog from beta; it read the main branch, which no release updates since releases moved to v* tags.

### Fixed

- bunExecutable reads PATH with Windows rules on every host, so its Windows lookup (and its test, which failed on Linux CI after #3213) no longer splits C:\ paths on ':'. Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
- `driveStep` returned steer with the opposite sign to `steerYaw`, so every adopter had to negate it; Drift Foundry and Harbor Heat drop their negations and drive the same lines.
- `talents.hydrate` silently dropped saved ids this build does not author, so a save loaded a smaller kit with no warning; valid ranks still load and the rest are reported. Ember Command's own saved-pick guard is replaced by the hydrate result.
- Hard terrain paint (brush, `fillSurfaceDelta`, clear, `autoPaintDelta`) on a blended terrain now sets the painted layer's weight to 1 and every other layer's to 0 in each touched cell, so `surfaceAt` and the renderer show it; before, it changed only the surface id and the old blend weights kept winning, also after save and reload. `SurfaceDelta` carries the reset slots as an optional `weights` (`WeightDelta`), so `paintTerrain` undo/redo, `applySurfaceDeltaToSnapshot` and `revertSurfaceDeltaFromSnapshot` restore both channels. Clearing, or painting a surface outside the layer stack, zeroes the cell's weights so its id shows through.
- Windows tooling. Worktree setup (deploy:site, agent worktrees) recreates bun's junctions instead of copying them as symlinks, which Windows refused (EPERM) and which pointed @jgengine/* at the main checkout. Vite configs, asset provisioning and the CLI spawn the real bun.exe under Node (npm's bun.cmd wrapper gave ENOENT). jgengine create writes look/mood under rendering, movement/prompts under controls and editorLayers/models under scene, and a new test type-checks every template against the engine. lane:close refuses before the gate when git has no identity. verify:fast runs tests that read a changed doc by its quoted path (the README surface test that broke beta after #3211), and the README lines it requires are back. Windows-only test failures fixed: directory links in fixtures are junctions, test git repos pin core.autocrlf=false, the broker stop test uses /v1/stop on Windows, the free-space test uses a petabyte floor. Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
- Every city lot with the same id (`lot:0:3`) drew the same near-detail building and wall paint in every district; they now vary with the district seed.
- home page game frame shows the whole title menu; phones play full screen
- no /__jgengine/report 404 on shipped games
- every game on jgengine.com crashed in its Rune UI with RuntimeError: unreachable (std clock in the wasm); browsers without WebGPU now play with the UI drawn through WebGL2
- game fonts 404 on jgengine.com (runner evaluated the game before installing its file list)

### Removed

- `scripts/check-street-rule-parity.ts`: the city now hands the street generator a typed `StreetNetworkParams`, and `generate_streets` overlays any street-schema key, so the compiler holds the parity the gate checked.

## 0.58.0

### Migrate

- **Bump lockstep SDK packages to `^0.58.0`:** `@jgengine/{core,rapier,ui,ws,node,sql,convex,shell,editor,assets,navbake}`. CLI `jgengine` is `0.55.0`; `@jgengine/github` is `0.45.0`.
- Replace `@jgengine/react` with `@jgengine/ui` in imports, dependencies and Tailwind `@source` paths, and `"react"` with `"ui"` in `jgengine.json`'s `engine` list.

### Added

- `AccessibilityProvider` (`@jgengine/ui`): Apply accessibility preferences to a subtree: exposes `--jg-text-scale` for text to scale off, and sets `data-reduced-motion` / `data-high-contrast` / `data-colorblind` / `data-captions` for CSS to respond to. Also `AbilitySlotBindingOptions`, `AchievementGallery`, `AchievementGalleryProps`, `AchievementToast`, `AchievementToastProps`, `ActionBar`, `ActionBarChrome`, `ActionBarKeyResult` and 624 more.
- `EventfulEngineStore` (`@jgengine/ui/engineStore`): ⚠ undocumented Also `ReadableEngineStore`.
- `ENGINE_STYLESHEET` (`@jgengine/ui/engineStyles`): The engine stylesheet: every `jg-*` keyframe the shared blocks and registry components animate with, the `[data-jg-*]` interaction-state rules behind {@link HudButton} / {@link HudSurface}, the quiet hover/press/focus defaults for plain buttons inside the HUD root, and reduced-motion handling (`prefers-reduced-motion` or `[data-reduced-motion="true"]` zero `--jg-motion-scale`). Also `ensureEngineStyles`, `useEngineStyles`.
- `PerFrameRenderError` (`@jgengine/ui/hooks`): The error a component that re-renders every frame or tick from the store fails with in a dev build or test. Also `AbilitySlotBindingOptions`, `DomEventTarget`, `EventMeterView`, `GameClockControls`, `InventoryGridBinding`, `UseAxisChannelResult`, `WorldBrowserState`, `abilityKitNeedsHeartbeat` and 46 more.
- `GamePreviewComponent` (`@jgengine/ui/preview`): ⚠ undocumented Also `GamePreviewProps`, `GamePreviewStates`.
- `PREVIEW_FIXTURES` (`@jgengine/ui/previewFixtures`): Registry of deterministic, engine-level preview fixtures — the *real* exported `@jgengine/ui` components (`HudThemePreview`, `IconsPreview`, …) that render identically every time from static values, so they can be screenshotted as regression evidence without booting a game. Also `PreviewFixture`, `previewFixtureNames`, `resolvePreviewFixture`.
- `GameContextBridge` (`@jgengine/ui/provider`): Re-provide a captured {@link GameContext} across a nested UI reconciler boundary. Also `GameProvider`, `useGameContext`, `useOptionalGameContext`.
- `selectionEqual` (`@jgengine/ui/selectSnapshot`): Whether two selections show the same thing: the same value, or arrays and plain objects whose entries are the same all the way down (a record or class instance compares by identity). Also `HotSelectionPace`, `SelectCache`.
- `useKeyedStore` (`@jgengine/ui/store`): Subscribe a component to one owner's slot of a typed keyed-family store defined with `defineKeyedStore`. Also `useStore`.
- `MENU_THEME_STYLE` (`@jgengine/ui/testFixtures`): Menu theme tokens passed through the `style` prop with no cast.
- `runeBundleUrl` (`@jgengine/core/ui/runeUi.view`): The jg-ui module URL, under the app base installed with `setAssetBase`: a runner served from `/play/` loads `/play/jg-ui/jg_ui.js`, not the site root's `/jg-ui/` (which jgengine.com does not serve).

### Changed

- The engine UI package is @jgengine/ui again; @jgengine/react is deprecated
- jgengine.com home page tells the story: a moving wall of the real games, one playable in the page, the dated decisions with their reasons and numbers (native Rust benchmark included), five ways it is built differently, the stack and the open counts
- README rewritten so a newcomer can act in five minutes; AGENTS.md states the facts agents get wrong (engine JSX + Rune, plain three.js, no root bun dev); CREDITS names Rune

### Fixed

- Rune UI loads under the app base, so games on jgengine.com/play load /play/jg-ui/jg_ui.js instead of a 404 at /jg-ui

### Removed

- `@jgengine/react` no longer exports `AbilitySlotBindingOptions`, `AccessibilityProvider`, `AchievementGallery`, `AchievementGalleryProps`, `AchievementToast`, `AchievementToastProps`, `ActionBar`, `ActionBarChrome` and 625 more.
- `@jgengine/react/engineStore` no longer exports `EventfulEngineStore`, `ReadableEngineStore`.
- `@jgengine/react/engineStyles` no longer exports `ENGINE_STYLESHEET`, `ensureEngineStyles`, `useEngineStyles`.
- `@jgengine/react/hooks` no longer exports `AbilitySlotBindingOptions`, `DomEventTarget`, `EventMeterView`, `GameClockControls`, `InventoryGridBinding`, `PerFrameRenderError`, `UseAxisChannelResult`, `WorldBrowserState` and 47 more.
- `@jgengine/react/preview` no longer exports `GamePreviewComponent`, `GamePreviewProps`, `GamePreviewStates`.
- `@jgengine/react/previewFixtures` no longer exports `PREVIEW_FIXTURES`, `PreviewFixture`, `previewFixtureNames`, `resolvePreviewFixture`.
- `@jgengine/react/provider` no longer exports `GameContextBridge`, `GameProvider`, `useGameContext`, `useOptionalGameContext`.
- `@jgengine/react/selectSnapshot` no longer exports `HotSelectionPace`, `SelectCache`, `selectionEqual`.
- `@jgengine/react/store` no longer exports `useKeyedStore`, `useStore`.
- `@jgengine/react/testFixtures` no longer exports `MENU_THEME_STYLE`.

## 0.57.0

### Migrate

- **Bump lockstep SDK packages to `^0.57.0`:** `@jgengine/{core,rapier,ui,ws,node,sql,convex,shell,editor,assets,navbake}`. CLI `jgengine` is `0.54.0`; `@jgengine/github` is `0.44.0`.

### Added

- `AccessibilityProvider` (`@jgengine/react`): Apply accessibility preferences to a subtree: exposes `--jg-text-scale` for text to scale off, and sets `data-reduced-motion` / `data-high-contrast` / `data-colorblind` / `data-captions` for CSS to respond to. Also `AbilitySlotBindingOptions`, `AchievementGallery`, `AchievementGalleryProps`, `AchievementToast`, `AchievementToastProps`, `ActionBar`, `ActionBarChrome`, `ActionBarKeyResult` and 624 more.
- `EventfulEngineStore` (`@jgengine/react/engineStore`): ⚠ undocumented Also `ReadableEngineStore`.
- `ENGINE_STYLESHEET` (`@jgengine/react/engineStyles`): The engine stylesheet: every `jg-*` keyframe the shared blocks and registry components animate with, the `[data-jg-*]` interaction-state rules behind {@link HudButton} / {@link HudSurface}, the quiet hover/press/focus defaults for plain buttons inside the HUD root, and reduced-motion handling (`prefers-reduced-motion` or `[data-reduced-motion="true"]` zero `--jg-motion-scale`). Also `ensureEngineStyles`, `useEngineStyles`.
- `PerFrameRenderError` (`@jgengine/react/hooks`): The error a component that re-renders every frame or tick from the store fails with in a dev build or test. Also `AbilitySlotBindingOptions`, `DomEventTarget`, `EventMeterView`, `GameClockControls`, `InventoryGridBinding`, `UseAxisChannelResult`, `WorldBrowserState`, `abilityKitNeedsHeartbeat` and 46 more.
- `GamePreviewComponent` (`@jgengine/react/preview`): ⚠ undocumented Also `GamePreviewProps`, `GamePreviewStates`.
- `PREVIEW_FIXTURES` (`@jgengine/react/previewFixtures`): Registry of deterministic, engine-level preview fixtures — the *real* exported `@jgengine/react` components (`HudThemePreview`, `IconsPreview`, …) that render identically every time from static values, so they can be screenshotted as regression evidence without booting a game. Also `PreviewFixture`, `previewFixtureNames`, `resolvePreviewFixture`.
- `GameContextBridge` (`@jgengine/react/provider`): Re-provide a captured {@link GameContext} across a nested React reconciler boundary. Also `GameProvider`, `useGameContext`, `useOptionalGameContext`.
- `selectionEqual` (`@jgengine/react/selectSnapshot`): Whether two selections show the same thing: the same value, or arrays and plain objects whose entries are the same all the way down (a record or class instance compares by identity). Also `HotSelectionPace`, `SelectCache`.
- `useKeyedStore` (`@jgengine/react/store`): Subscribe a component to one owner's slot of a typed keyed-family store defined with `defineKeyedStore`. Also `useStore`.
- `MENU_THEME_STYLE` (`@jgengine/react/testFixtures`): Menu theme tokens passed through the `style` prop with no cast.

### Changed

- Docs, skills, tool help and engine comments describe UI on the engine's own JSX runtime, not React
- jgengine.com draws with the engine's own JSX runtime instead of React; LLMville drops react; /play runner resolves @jgengine/react again

### Fixed

- The `/play` game runner build (apps/dev, and games' `engineSourceAliases`) resolves engine packages by npm name, so `@jgengine/react` (in `packages/ui`) resolves to source again; since 0.56.1 the runner build failed with missing `@jgengine/react/hooks` exports.
- tarball install tests, browser fixtures, simulate and the skill api/capability generators turn a package folder into its npm name through scripts/packageNames.ts. They used the folder name, so the tarball test installed packages/ui as @jgengine/ui (CI failed on 0.56.1's commit) and the generated skill docs told users to import @jgengine/ui.

### Removed

- `@jgengine/ui` no longer exports `AbilitySlotBindingOptions`, `AccessibilityProvider`, `AchievementGallery`, `AchievementGalleryProps`, `AchievementToast`, `AchievementToastProps`, `ActionBar`, `ActionBarChrome` and 625 more.
- `@jgengine/ui/engineStore` no longer exports `EventfulEngineStore`, `ReadableEngineStore`.
- `@jgengine/ui/engineStyles` no longer exports `ENGINE_STYLESHEET`, `ensureEngineStyles`, `useEngineStyles`.
- `@jgengine/ui/hooks` no longer exports `AbilitySlotBindingOptions`, `DomEventTarget`, `EventMeterView`, `GameClockControls`, `InventoryGridBinding`, `PerFrameRenderError`, `UseAxisChannelResult`, `WorldBrowserState` and 47 more.
- `@jgengine/ui/preview` no longer exports `GamePreviewComponent`, `GamePreviewProps`, `GamePreviewStates`.
- `@jgengine/ui/previewFixtures` no longer exports `PREVIEW_FIXTURES`, `PreviewFixture`, `previewFixtureNames`, `resolvePreviewFixture`.
- `@jgengine/ui/provider` no longer exports `GameContextBridge`, `GameProvider`, `useGameContext`, `useOptionalGameContext`.
- `@jgengine/ui/selectSnapshot` no longer exports `HotSelectionPace`, `SelectCache`, `selectionEqual`.
- `@jgengine/ui/store` no longer exports `useKeyedStore`, `useStore`.
- `@jgengine/ui/testFixtures` no longer exports `MENU_THEME_STYLE`.

## 0.56.1

### Migrate

- **Bump lockstep SDK packages to `^0.56.1`:** `@jgengine/{core,rapier,ui,ws,node,sql,convex,shell,editor,assets,navbake}`. CLI `jgengine` is `0.53.1`; `@jgengine/github` is `0.43.1`.

### Added

- scripts/check-npm-trusted.ts refuses a release unless every package it publishes exists on npm and its latest version came through trusted publishing; bun run release runs it before cutting and the Publish workflow before its first npm publish, so a half-published release cannot happen.

### Fixed

- the grass eviction test walks a 600 m field in six settles instead of 2 km in twelve; it took 27-32 s on CI runners against a 30 s limit and blocked the 0.56.0 publish.
- the engine UI package (packages/ui) publishes as @jgengine/react again. 0.56.0 renamed it @jgengine/ui, a name npm had never seen, so trusted publishing refused it part-way and @jgengine/core@0.56.0 on latest depended on a package that did not exist. Imports, dependencies, jgengine.json engine keys ("react"), scaffold aliases and doctor's @source check all name @jgengine/react; bun run check react-free treats it as the engine's own UI package.

## 0.56.0

### Migrate

- **Bump lockstep SDK packages to `^0.56.0`:** `@jgengine/{core,rapier,ui,ws,node,sql,convex,shell,editor,assets,navbake}`. CLI `jgengine` is `0.53.0`; `@jgengine/github` is `0.43.0`.
- Native games compose `RuneRoot`, `RuneView`, `RuneLabel`, `RuneAction`, `RuneFor`, `RuneLayers`, `RuneTransient` and `RuneWorldAnchor` from `@jgengine/core/ui/rune/primitives.view`. Theme tokens and native style props replace game CSS; the new API supplies no finished widgets or screens. See the page-sized example in the jgengine-ui skill.
- `ActionBindingsProvider` and `useActionBindings` move from `ui/kit/uiKitRoot.view` to `input/actionBindings.view`, so native UI reads rebinds without importing a CSS kit. All in-repo imports move with them.
- `adjustSettingRow` now lives in `@jgengine/core/settings/settingAdjustment`; its arguments and result are unchanged. In-repo settings adopters use the new home.
- `createHudAwakeClock` and `sameWatched` now live in `@jgengine/core/hud/hudAwakeClock`, shared by the DOM and native HUD renderers.
- engine and game UI uses @jgengine/core/ui/jsx and @jgengine/react; the website and two framework examples retain their own React host and embed games with mountGamePlayer

### Added

- RuneField native text field (controlled value, submit, autoFocus, focused-key capture, touch keyboard proxy) so native games can take chat, names and passwords.
- `RuneTextField` (`@jgengine/core/ui/rune/elements.view`): Native Rune-owned text field; edits and submits come back as events.
- `nativeFieldKey` (`@jgengine/core/ui/rune/nativeSurface.view`): ⚠ undocumented
- `RuneField` (`@jgengine/core/ui/rune/primitives.view`): Native text entry: Rune owns caret, selection and IME; the game owns the text. Also `RuneFieldProps`.
- Direct native Rune primitives for the engine JSX runtime, with one typed style set, bound slots/property patches, responsive/safe/world anchoring, keyed collections, native interaction and flow ownership. Set `uiRenderer: "rune"` and compose inside `RuneRoot` to bypass the CSS mirror.
- A headless native PNG renderer using the production builder, and native bounds/text for the game drive harness.
- Rune-native UI primitives (RuneRoot, RuneView, RuneLabel, RuneAction, RuneFor, RuneLayers, RuneTransient, RuneWorldAnchor, RuneGlyph) and Deepward rebuilt on them with no CSS or DOM host
- `ActionBindingsProvider` (`@jgengine/core/input/actionBindings.view`): Provide the game's live bindings, including player rebinds, without a presentation kit. Also `useActionBindings`.
- `adjustSettingRow` (`@jgengine/core/settings/settingAdjustment`): Step a slider within its bounds, flip a toggle or cycle a selection.
- `pageHost` (`@jgengine/core/ui/jsx/pageHost.view`): One JSX tree can contain native surfaces and ordinary page tooling, sharing all providers.
- `RuneActivation` (`@jgengine/core/ui/rune/activation`): Hold activation shared by pointer, touch, keyboard and pad, using an injected clock. Also `runeNextFocus`.
- `RuneBoundFont` (`@jgengine/core/ui/rune/element`): ⚠ undocumented Also `RuneBoundStyle`, `RuneColor`, `RuneElement`, `RuneElementProps`, `RuneFont`, `RuneGesture`, `RuneSize`, `RuneSpan` and 1 more.
- `RuneBox` (`@jgengine/core/ui/rune/elements.view`): Native Rune column. Also `RuneButton`, `RuneIcon`, `RuneRow`, `RuneScroll`, `RuneSurface`, `RuneText`, `RuneViewport`, `useRuneViewport`.
- `registerNativeRuneFont` (`@jgengine/core/ui/rune/nativeSurface.view`): Register native font bytes before the first surface mounts.
- `RuneNode` (`@jgengine/core/ui/rune/nativeTree`): A native host node; it has no browser element or computed style. Also `NativeWireNode`, `RuneTreeSink`, `nativeEnabled`, `nativeLabel`, `nativeSpec`, `nativeTreeHost`.
- `bind` (`@jgengine/core/ui/rune/primitives`): Bind any native visual property without scheduling a component render. Also `RuneFlow`, `RuneRoute`, `RuneSource`, `RuneTheme`, `RuneViewportClass`, `createRuneFlow`, `ownRuneFlow`, `runeFormat` and 3 more.
- `RuneAction` (`@jgengine/core/ui/rune/primitives.view`): Command interaction with native focus, pointer/touch, keyboard, pad, hold and drag/drop. Also `RuneActionProps`, `RuneAnchor`, `RuneFor`, `RuneGlyph`, `RuneLabel`, `RuneLabelProps`, `RuneLayers`, `RuneProjection` and 6 more.
- native Rune scroll views fade the edge with hidden content; flows can drag and touch
- one machine-wide limit on rendering browsers (JG_RENDER_SLOTS, sized to the machine; fairshare room for a second). Every Chrome launch takes a slot, a running but slow broker is joined instead of passed by, and devBroker status lists every broker and slot holder
- `createRunePassThrough` (`@jgengine/core/ui/runePassThrough`): ⚠ undocumented Also `RunePassThrough`.
- Rune rendering stays opt-in through ?ui=rune; DOM remains the default. The CSS styling path and CSS-to-Rune mirror are temporary while typed Rune-native props replace CSS
- `uiTour` (`@jgengine/core/play/uiTour`): ⚠ undocumented Also `TourStep`.
- `Children` (`@jgengine/core/ui/jsx`): ⚠ undocumented Also `ActionDispatch`, `AnyActionArg`, `CSSProperties`, `Component`, `ComponentClass`, `ComponentType`, `Context`, `DependencyList` and 58 more.
- `createPortal` (`@jgengine/core/ui/jsx/client.view`): ⚠ undocumented Also `Root`, `createRoot`, `flushSync`, `hydrateRoot`.
- `AllHTMLAttributes` (`@jgengine/core/ui/jsx/dom.view`): Every attribute of every tag, for the tags with no narrower set here. Also `AnchorHTMLAttributes`, `AnimationEvent`, `AnimationEventHandler`, `AriaAttributes`, `Attributes`, `AudioHTMLAttributes`, `ButtonHTMLAttributes`, `CanvasHTMLAttributes` and 56 more.
- `domHost` (`@jgengine/core/ui/jsx/domHost.view`): The host a DOM root renders through.
- `Children` (`@jgengine/core/ui/jsx/element`): ⚠ undocumented Also `AnyType`, `ClassInstance`, `ComponentClass`, `ContextType`, `ELEMENT`, `ElementType`, `Fragment`, `FunctionComponent` and 26 more.
- `Fragment` (`@jgengine/core/ui/jsx/jsx-dev-runtime`): ⚠ undocumented Also `jsx`, `jsxDEV`, `jsxs`.
- `Fragment` (`@jgengine/core/ui/jsx/jsx-runtime`): ⚠ undocumented Also `jsx`, `jsxDEV`, `jsxs`.
- `markupHost` (`@jgengine/core/ui/jsx/markup`): ⚠ undocumented Also `MarkupNode`, `renderToStaticMarkup`, `renderToString`, `renderToTree`, `styleText`, `treeToMarkup`.
- `Component` (`@jgengine/core/ui/jsx/reconciler`): Base class for the few class components (error boundaries). Also `ActionDispatch`, `AnyActionArg`, `Fiber`, `Host`, `PureComponent`, `Root`, `act`, `flushSync` and 17 more.
- `CSSProperties` (`@jgengine/core/ui/jsx/types`): An inline style object: CSS properties in camelCase, plus `--custom` properties. Also `ComponentClass`, `ComponentType`, `Context`, `DependencyList`, `Dispatch`, `EffectCallback`, `ElementType`, `ErrorInfo` and 19 more.
- `MirrorReport` (`@jgengine/core/ui/rune/cssMirror.view`): What the mirror could not express, counted by `property: value` and by where it was asked. Also `WireBox`, `boxOfElement`, `elementOf`, `idOf`, `mirrorContents`, `mirrorElement`, `mirrorRoot`, `onPaintResourceLoaded` and 4 more.
- `stateMatters` (`@jgengine/core/ui/rune/cssStates.view`): Whether marking `element` with the state's attribute would change how it or anything under it is styled. Also `twinStateRules`.
- `averageOfStops` (`@jgengine/core/ui/rune/cssValues`): The colour a gradient averages to: what a small repeated tile of it reads as. Also `WireDim`, `WireImageLayer`, `WireLayer`, `WireShadow`, `WireTextShadow`, `WireTrack`, `WireTransform`, `colorAlpha` and 17 more.
- `installRuneMeasure` (`@jgengine/core/ui/rune/domMeasure.view`): Make measurement of Rune-drawn elements answer from Rune's layout. Also `RuneScrollDriver`, `invalidateRuneLayout`, `runeRectOf`, `setRuneRect`, `setRuneScroll`.
- `compactPatches` (`@jgengine/core/ui/rune/patches`): Keep only attached replacement roots after all changes in one mirror pass.
- `RuneInput` (`@jgengine/core/ui/rune/runeInput.view`): ⚠ undocumented
- `RuneLayer` (`@jgengine/core/ui/rune/runeLayer.view`): Draws its children through Rune instead of the page: the elements exist (so styles, refs and events work as written) but the browser never lays them out or paints them; the Rune stage mirrors them onto its canvas over the game. Also `runeUiEnabled`.
- `RuneStage` (`@jgengine/core/ui/rune/runeStage.view`): ⚠ undocumented Also `registerRuneFont`.
- `VideoFrameSource` (`@jgengine/core/ui/rune/videoFrames.view`): The browser video methods used by a frame feed.
- `RuneScrollValues` (`@jgengine/core/ui/runeUi.view`): Scroll offset, viewport and content size in layout pixels.
- `mountGamePlayer` (`@jgengine/shell/mountGamePlayer`): Run a game inside any page: mounts the registry-driven player into `container` and returns the function that takes it down. Also `MountGamePlayerOptions`.
- `AccessibilityProvider` (`@jgengine/react`): Apply accessibility preferences to a subtree: exposes `--jg-text-scale` for text to scale off, and sets `data-reduced-motion` / `data-high-contrast` / `data-colorblind` / `data-captions` for CSS to respond to. Also `AbilitySlotBindingOptions`, `AchievementGallery`, `AchievementGalleryProps`, `AchievementToast`, `AchievementToastProps`, `ActionBar`, `ActionBarChrome`, `ActionBarKeyResult` and 626 more.
- `EventfulEngineStore` (`@jgengine/react/engineStore`): ⚠ undocumented Also `ReadableEngineStore`.
- `ENGINE_STYLESHEET` (`@jgengine/react/engineStyles`): The engine stylesheet: every `jg-*` keyframe the shared blocks and registry components animate with, the `[data-jg-*]` interaction-state rules behind {@link HudButton} / {@link HudSurface}, the quiet hover/press/focus defaults for plain buttons inside the HUD root, and reduced-motion handling (`prefers-reduced-motion` or `[data-reduced-motion="true"]` zero `--jg-motion-scale`). Also `ensureEngineStyles`, `useEngineStyles`.
- `PerFrameRenderError` (`@jgengine/react/hooks`): The error a component that re-renders every frame or tick from the store fails with in a dev build or test. Also `AbilitySlotBindingOptions`, `DomEventTarget`, `EventMeterView`, `GameClockControls`, `InventoryGridBinding`, `UseAxisChannelResult`, `WorldBrowserState`, `abilityKitNeedsHeartbeat` and 46 more.
- `GamePreviewComponent` (`@jgengine/react/preview`): ⚠ undocumented Also `GamePreviewProps`, `GamePreviewStates`.
- `PREVIEW_FIXTURES` (`@jgengine/react/previewFixtures`): Registry of deterministic, engine-level preview fixtures — the *real* exported `@jgengine/react` components (`HudThemePreview`, `IconsPreview`, …) that render identically every time from static values, so they can be screenshotted as regression evidence without booting a game. Also `PreviewFixture`, `previewFixtureNames`, `resolvePreviewFixture`.
- `GameContextBridge` (`@jgengine/react/provider`): Re-provide a captured {@link GameContext} across a nested React reconciler boundary. Also `GameProvider`, `useGameContext`, `useOptionalGameContext`.
- `selectionEqual` (`@jgengine/react/selectSnapshot`): Whether two selections show the same thing: the same value, or arrays and plain objects whose entries are the same all the way down (a record or class instance compares by identity). Also `HotSelectionPace`, `SelectCache`.
- `useKeyedStore` (`@jgengine/react/store`): Subscribe a component to one owner's slot of a typed keyed-family store defined with `defineKeyedStore`. Also `useStore`.
- `MENU_THEME_STYLE` (`@jgengine/react/testFixtures`): Menu theme tokens passed through the `style` prop with no cast.

### Changed

- Reduced repo agent rules and restored Claude loading
- Removed nested rule files; retained a 2,726-byte root guide and a CLAUDE.md containing only @AGENTS.md
- Updated game and skill references to the surviving guidance; no runtime code changed
- Validation: setup and every documented command or its --help passed; skill-doc tests passed; links and the size target passed; verify-fast caught its injected regression
- Ember Command moves to Rune-native UI primitives and deletes its CSS UI. Engine: native patches before Rune's first frame now queue behind the spec (runeUi.view.test.ts). Verified by fixture tests; no browser drive (Jon's call). Unverified: phone-width browser view, world health bars under the Rune canvas, GPU.
- Fernwild moves to Rune-native UI primitives and deletes its CSS UI. Verified by fixture tests; no browser drive (Jon's call). Missing primitives worked around in-game: text entry (name list), 3D model preview in UI (body card), shift/double click (x5 button), focus return after native press. Unverified: phone browser view, death/respawn code test, GPU.
- Verified: cargo test -p jg-ui 33 pass; rune UI TS tests 44 pass (new tests broken once and restored); core, Deepward and Scrap Signal type-checks.
- Unverified: real typing, IME and the phone keyboard proxy in a browser; the press fix is confirmed by the Harbor Heat tour after this lands.
- Unverified: real typing, IME and the phone keyboard proxy in a browser.
- Harbor Heat now draws its whole UI on the Rune-native primitives; its CSS and old UI folder are deleted.
- Verified: headless play test walks title, settings, credits, a run, HUD, city phone, pause, save and resume at 1280x720 and 390x844 (assertion broken once and restored); 193 tests; type-check.
- Simplified: 3D portraits on the licence and talk screens are now silhouettes; the courier name uses a key stand-in until it moves to RuneField.
- Unverified: real mouse, touch and pad input in a browser.
- LLMville now draws its whole UI on the Rune-native primitives; style.css, Tailwind and shadcn are removed.
- Verified: headless play test walks sign-in, lab creation, chat, every tablet app's main action, settings and rebind at 1280x720 and 390x844 (assertion broken once and restored); 399 tests; type-check; react-free; template sync.
- Simplified: /dev workbench routes and an unused create-world screen removed; the map claims cells by tap or drag with no hover price.
- Unverified: real browser input and the phone keyboard; emoji in player chat render as empty boxes (no emoji font in Rune).
- Deepward composes its whole HUD, menus, settings, credits and game-specific panels from native Rune primitives. Its stylesheet, CSS kit and old visor composition are removed. Other games keep the temporary mirror during migration.
- Odd Orbit moves to Rune-native UI primitives and deletes its CSS UI. Unverified: real-click HUD after play starts (software Rune repaint on host), GPU cost.
- Scrap Signal now draws its whole UI on the Rune-native primitives; its CSS and old UI folder are deleted.
- Verified: 228 tests, type-check, boot probe and bundle check pass with no ceiling raised; 42 headless native screenshots at 1280x720, 844x390 and 390x844 in games/scrap-signal/proofs/rune-primitives.
- Unverified: real mouse, touch and pad drives need the PC (no WebGPU in Chrome on the Linux host); the call sign entry is a game-local key stand-in until RuneField lands.
- A bare wrangler deploy in apps/web now runs the site asset check and refuses a build without game models, LUTs or HDRIs
- Landing gates run in about half the time: game suites play their proofs across up to four worker threads (fernwild's suite 761 s to 176 s; an engine change's gate 432-599 s to 210-242 s), and verify:fast shares its pass cache and test timings across every worktree of a clone, so a unit another lane proved on the same bytes is not run again
- A game's README or PLAN edit runs none of its tests or type-checks (was 64 tests)
- lane:close marks its own draft PR ready and refuses a PR into another base before the gate, not after it; tally's .tally/ reports are ignored, so a rebased landing's re-verify can merge
- Beacon Bastion draws its whole UI natively through Rune; old CSS UI removed. Engine: clicks on Rune pass through to the 3D field. Tests prove keyboard-typed commander name and the menu confirm cue.
- Brightway Park draws its UI natively through Rune; CSS UI removed
- Drift Foundry draws its UI natively through Rune; CSS UI removed
- vendored Rune updated from dev d751f07 to c92e462 (250 commits). Re-applied 8 jgengine patches upstream still lacks (layout rects, layout_style, web transparency, WOFF fonts, zero-range scroll, canvas wheel, synthetic bold for regular-only game fonts, SVG via the browser) and dropped 10 that served only the removed CSS host. Added a web touch build fix upstream dev needs. Text takes upstream's new WindfoilChromium default on Windows and Linux. jg-ui wasm grows from 7.7 to 10.3 MB (2.9 to 4.9 MB gzipped).
- Unverified: LLMville main flow needs its local backend; framework-host and website demo browser checks remain pending. Rune fidelity is outside this React-removal landing. Performance was not measured

### Fixed

- native Rune presses now wake a frame, so a click on a still HUD reaches the game at once instead of waiting for the next input.
- the rule effect registry test no longer fails when Scrap Signal's perks load first in the same worker.
- gamepad taps, held input and landing lock checks no longer race host scheduling
- Deepward's pause menu no longer covers the save-failure, reprint and blocked-record sheets
- a finger tap on a non-modal Rune control reaches it instead of the game below
- Deepward sheet titles and item names wrap on phones; the Fitter windup no longer re-renders each frame
- convert game package declarations and browser fixtures, preserve static form selections, and remove stale React Three Fiber documentation

### Removed

- `@jgengine/core/settings/settingsBlocks.view` no longer exports `adjustSettingRow`.
- `@jgengine/core/ui/kit/uiKitRoot.view` no longer exports `ActionBindingsProvider`, `useActionBindings`.
- `@jgengine/react` no longer exports `ActionBindingsProvider`, `useActionBindings`.
- verify:fast's rerun of timed-out test files; a timeout stays red and names the file. The bg-tasks exit-event test that timed out under load is quarantined with #3118
- jg-ui's CSS box host (css.rs, style.rs), its canvas-frame and box patch/scroll exports, and the old widget spec; the Rune wasm takes only native nodes and RuneUi drops patch, patchText, scrollTo, canvasFrame, removeCanvas and rects.
- the CSS-to-Rune mirror (RuneLayer, ?ui=rune, cssMirror, cssStates, domMeasure, runeInput, patches, boxTransform, videoFrames, cssValues) and the uiTour flow built on it. Every game draws its UI on native Rune surfaces; loadGameFonts now registers fonts with the native surface.
- `@jgengine/core/play/uiTour` no longer exports `TourStep`, `uiTour`.
- `@jgengine/core/ui/rune/cssMirror.view` no longer exports `MirrorReport`, `WireBox`, `boxOfElement`, `elementOf`, `idOf`, `mirrorContents`, `mirrorElement`, `mirrorRoot` and 5 more.
- `@jgengine/core/ui/rune/cssStates.view` no longer exports `stateMatters`, `twinStateRules`.
- `@jgengine/core/ui/rune/cssValues` no longer exports `WireDim`, `WireImageLayer`, `WireLayer`, `WireShadow`, `WireTextShadow`, `WireTrack`, `WireTransform`, `averageOfStops` and 18 more.
- `@jgengine/core/ui/rune/domMeasure.view` no longer exports `RuneScrollDriver`, `installRuneMeasure`, `invalidateRuneLayout`, `runeRectOf`, `setRuneRect`, `setRuneScroll`.
- `@jgengine/core/ui/rune/patches` no longer exports `compactPatches`.
- `@jgengine/core/ui/rune/runeInput.view` no longer exports `RuneInput`.
- `@jgengine/core/ui/rune/runeLayer.view` no longer exports `RuneLayer`, `runeUiEnabled`.
- `@jgengine/core/ui/rune/runeStage.view` no longer exports `RuneStage`, `registerRuneFont`.
- `@jgengine/core/ui/rune/videoFrames.view` no longer exports `VideoFrameSource`.
- `@jgengine/react` no longer exports `AbilitySlotBindingOptions`, `AccessibilityProvider`, `AchievementGallery`, `AchievementGalleryProps`, `AchievementToast`, `AchievementToastProps`, `ActionBar`, `ActionBarChrome` and 627 more.
- `@jgengine/react/engineStore` no longer exports `EventfulEngineStore`, `ReadableEngineStore`.
- `@jgengine/react/engineStyles` no longer exports `ENGINE_STYLESHEET`, `ensureEngineStyles`, `useEngineStyles`.
- `@jgengine/react/hooks` no longer exports `AbilitySlotBindingOptions`, `DomEventTarget`, `EventMeterView`, `GameClockControls`, `InventoryGridBinding`, `PerFrameRenderError`, `UseAxisChannelResult`, `WorldBrowserState` and 47 more.
- `@jgengine/react/preview` no longer exports `GamePreviewComponent`, `GamePreviewProps`, `GamePreviewStates`.
- `@jgengine/react/previewFixtures` no longer exports `PREVIEW_FIXTURES`, `PreviewFixture`, `previewFixtureNames`, `resolvePreviewFixture`.
- `@jgengine/react/provider` no longer exports `GameContextBridge`, `GameProvider`, `useGameContext`, `useOptionalGameContext`.
- `@jgengine/react/selectSnapshot` no longer exports `HotSelectionPace`, `SelectCache`, `selectionEqual`.
- `@jgengine/react/store` no longer exports `useKeyedStore`, `useStore`.
- `@jgengine/react/testFixtures` no longer exports `MENU_THEME_STYLE`.

## 0.55.1

### Migrate

- **Bump lockstep SDK packages to `^0.55.1`:** `@jgengine/{core,rapier,react,ws,node,sql,convex,shell,editor,assets,navbake}`. CLI `jgengine` is `0.52.1`; `@jgengine/github` is `0.42.1`.

### Fixed

- a save whose stored environment (wet surfaces, fires, flocks) no longer fits the game's authored world loads the rest of the save and starts the environment fresh, with a degraded: console line. On 0.55.0 it threw, so Harbor Heat showed a runtime error instead of its menu for anyone holding a save from 0.54.0.

## 0.55.0

### Migrate

- **Bump lockstep SDK packages to `^0.55.0`:** `@jgengine/{core,rapier,react,ws,node,sql,convex,shell,editor,assets,navbake}`. CLI `jgengine` is `0.52.0`; `@jgengine/github` is `0.42.0`.
- HudFade watch and hold, and useHudAwake, take getters read every frame (watch={() => [air, suit]}, hold={() => alarm})
- useGameStoreLive is removed; use useGameStore (now shallow by default) or LiveText/useFrameBind for a value that changes every frame
- useStore and useGameStore compare selections shallowly by default; a selector returning a fresh object or array no longer re-renders every tick

### Added

- `FlatWalkRenderer` (`@jgengine/core/render/flatSceneWalk.draw`): The renderer parts the flat walk wraps: three's render lists and shadow pass, and its render counter.
- `SceneWalkStarts` (`@jgengine/core/visibility/culledTransforms.draw`): The walk starts the scene's last matrix pass found; `serial` changes with every pass.
- `IdSet` (`@jgengine/core/visibility/visibilitySystem`): A read-only set of ids: membership, count and iteration. Also `RenderableSource`.
- `STEP_AHEAD_MAX_FRAME_SHARE` (`@jgengine/core/runtime/simAhead`): Frames shorter than this share of a fixed step get their next step run ahead, between frames. Also `IdleTask`, `RecordedTime`, `createIdleTask`, `createRecordedTime`, `shouldStepAhead`.
- Grass style `detail` (follows realism): up to six times the blades at 1 and half at 0, each narrower or wider by the same factor, so the ground a field covers holds. A bunchgrass puts the extra blades into its clumps; a sward spreads them over more tufts. Flowers per square metre hold at every detail
- Grass style `exaggeration` (follows 1 - realism): toward cartoon, even heights, deeper curls and round tips; toward natural, uneven heights and blades leaning every way, with mown blades getting torn, pale tips instead
- The turf under a grass patch follows `detail`: a flat painted colour at 0, its grain as before at 0.5, finer and stronger at 1
- A page's `?realism=` sets every grass patch's realism, so any scene can be shot or profiled at any realism (`--param realism=1`)
- `scrambledSobol2` (`@jgengine/core/random/scrambledSobol`): an even 2D spread where every prefix is even and none falls into rows
- Grass style `shading` (follows realism): toward 0 the sun falls into three flat cel bands, the gloss goes matt and a rim of sky light outlines each blade; toward 1 the blade glosses and light shines through more of the leaf
- Grass style `colourSteps`: snaps each blade's root-to-tip colour to three flat tones and quiets the blade-to-blade noise, on toward cartoon
- Grass style `saturation` and `contrast`: brighter, purer colour and a stronger root-to-tip gradient toward cartoon, the species' own colour and a softer gradient toward photoreal
- Grass style `outline`: dark ink along each blade's edges so clumps read as outlined shapes, on toward cartoon and settable by hand anywhere
- bun run perf ab answers whether a branch's frames are faster or slower than its base per game with a 99% interval in minutes of perf lock: both load once in a Chrome of their own and take turns in 2 s windows with the other side's renderers suspended, each base window paired with the branch window after it, stopping as soon as the interval answers; a planted 5% was caught in 4-24 pairs and same-code no-ops never read changed
- bun run perf post-audit redraws each changed post draw three's way on live frames and counts differing texels; bun run check postfx-exact checks the half-float rounding on the GPU
- bun run perf post-audit redraws each changed post draw three's way on live frames and counts differing texels, sharing shadow-audit's lock-first per-game loop; bun run check postfx-exact checks the half-float rounding on the GPU
- `PostAuditStats` (`@jgengine/core/postfx/postAudit.draw`): What the changed draws did and, with the audit on, what comparing them with three's draws found.
- perf names the phase a game's measurement is in (load, warmup, frame window, draw-timed GPU window, profile), so a session killed at its deadline says which one hung
- `GpuTiming` (`@jgengine/core/devtools/frameBreakdown`): How the breakdown times the GPU.
- `ShadowPassPlan` (`@jgengine/core/lighting/shadowCache`): Same-image shadow caching, the renderer-agnostic half: what one light's depth pass draws this frame.
- useSceneSwap and useSceneSwapping change place without a frozen frame, building the new place in the background behind a travel card
- prepareBeforeLink patches a lazily patched material (wet ground) before its first link, so a model that streams in mid-play compiles once
- `HitchScript` (`@jgengine/core/devtools/frameBreakdown`): One script the browser ran inside a slow frame, as its long-animation-frame timing names it. Also `HitchSession`.
- `installRenderCounter` (`@jgengine/core/devtools/renderCounter`): Install the counter as React's devtools hook on `scope`. Also `ComponentRenders`, `RenderCounter`, `RenderCounts`, `renderCounter`.
- `useSceneSwap` (`@jgengine/core/render/sceneSwap.draw`): Change place (a dive, a lift, a district, a level) without a frozen frame.
- `LiveTextTag` (`@jgengine/core/ui/liveBind.view`): Inline and block elements a live text can be.
- `sceneSwapping` (`@jgengine/core/ui/sceneSwap.view`): True while a scene swap's card is up, outside React (the frame breakdown marks stalls drawn behind it). Also `useSceneSwapping`.
- `shallowEqual` (`@jgengine/react/selectSnapshot`): Whether two selections show the same thing: the same value, or arrays or plain objects whose entries are each the same value.
- `prepareEngineRenderer` (`@jgengine/core/webgpu/engineRenderer.draw`): Do the asynchronous part of starting `backend` (on WebGPU: the shader translator and one device) and return the synchronous factory for one canvas. Also `EngineRendererFactory`, `useEngineRendererFactory`.
- `requestWebGpuDevice` (`@jgengine/core/webgpu/webgpuGl.draw`): Request the WebGPU device, or `null` when this browser has no usable WebGPU adapter. Also `WebGpuDevice`.
- perf runs queue machine-wide. A queued run prints 'perf lock: waiting for pid <n> (<branch>: <run>, since <hh:mm>) …' once, waiters go in arrival order, its guard does not count the wait, and its record says the seconds it waited
- perf, drive and shoot, and the Chrome they start, run below normal priority so Jon's game and editor come first. Only the Chrome or desktop app a mode measures goes back to normal (decided per mode in scripts/perf.ts), and each record says the priority its Chrome drew at. verify:fast, lane:close, check and test stay at normal: at below normal, starved tests failed four landings in a row
- a capture's Chrome dies with its launcher. A detached watchdog (scripts/chrome-watchdog.ts) ends Chrome's tree and removes its profile within about a second of the launcher being force-killed, and logs every outcome to jg-chrome-watchdog.log in the temp folder
- bun run perf <game> --production, perf ab --production and perf gate --production time the build players get (the runner as the web deploy builds it: minified, bundled, production React, built once per tree and served locally); the dev server stays the default, and the gate's budgets and baselines are unchanged
- every perf and perf ab report leads with a scorecard: frame p50, p95, p99 and the worst frame, frames over 16.7 and 33 ms, main-thread ms per frame with the share inside React and react-three-fiber, MB allocated per second and GC time, the same frames with the CPU slowed 4x, load time and download size; --tally <group> records it in the local tally store
- `GlanceDriver` (`@jgengine/core/anim/characterGlance.draw`): The default head glance without React: resolves the rig once, then {@link pose} turns the head toward the local player each frame. Also `GlanceDriverOptions`.
- `drawCharacterMotion` (`@jgengine/core/anim/characterMotion.draw`): The resolved parts of the default character motion for draw code. Also `noteGameCharacterMotion`.
- `CorpseRagdolls` (`@jgengine/core/anim/CorpseRagdolls.draw`): ⚠ undocumented Also `CorpseRagdollsDrawProps`.
- `ModelAnimationDriver` (`@jgengine/core/anim/modelAnimationDriver.draw`): The engine's model animation driver without React: the same mixer `useModelAnimation` runs — `"auto"` derivation, speed-driven crossfades, one-shots from game events, held poses, death clamp, graph playback with root motion, and character-LOD pose pacing. Also `GraphPose`, `ModelAnimationDiagnostic`, `ModelAnimationDriverOptions`, `ModelMotionStep`, `createGraphPose`, `diagnoseModelAnimation`, `readModelAnimationParams`.
- `skinnedInstancesDraw` (`@jgengine/core/anim/SkinnedInstances.draw`): Draw-side form of {@link SkinnedInstances}: loads the rig through the shared per-url GLTF cache, bakes its clips to the bone texture once per (url, clips, once, fps) signature, and rebuilds the instanced mesh when capacity changes or rewrites its buffers when the instance list does — the same boundaries the old memos and layout effect had.
- `FootIkDriver` (`@jgengine/core/anim/useFootIk.draw`): Foot IK without React: resolves the rig once, then {@link pose} applies one frame of correction after the animation mixer. Also `FootIkDriverOptions`.
- `buildingKitBatchDraw` (`@jgengine/core/buildings/BuildingKitBatch.draw`): The draw-side form of {@link BuildingKitBatch}: loads the GLB once through the shared per-url cache, harvests instanceable sources, and mounts chunk draws per style group.
- `buildingChunkBudgetScratch` (`@jgengine/core/buildings/BuildingRenderBudget.draw`): ⚠ undocumented
- `instancedBuildingsDraw` (`@jgengine/core/buildings/GeneratedBuilding.draw`): The draw-side form of {@link InstancedBuildings}: buckets the placements once per prop-identity change, then mounts one draw per box family and per kit model URL.
- `interiorDressingDraw` (`@jgengine/core/buildings/InteriorDressing.draw`): The drawn side of a planned interior as one draw: trims, pipes, fittings and lamp housings as static instance batches, every cable as one merged tube, and every stain style as one instanced decal mesh. Also `practicalLightsDraw`.
- `ActiveCameraControls` (`@jgengine/core/camera/activeCameraControls.draw`): What a tool may do to the camera controls that own a scene's view: retarget them and switch them off for a drag.
- `chaseRigDraw` (`@jgengine/core/camera/cameraRigs.draw`): Vehicle chase rig that trails behind the followed entity's heading. Also `CameraRigEnv`, `cinematicRigDraw`, `lockOnRigDraw`, `observerRigDraw`, `rtsRigDraw`, `shoulderRigDraw`, `sideScrollRigDraw`, `topDownRigDraw`.
- `firstPersonBodyInstance` (`@jgengine/core/camera/firstPersonBody.draw`): The entity whose body the first-person camera sits in, for draw code. Also `noteFirstPersonBody`.
- `GameFirstPersonCameraDrawProps` (`@jgengine/core/camera/GameFirstPersonCamera.draw`): Everything the first-person draw reads, resolved by the React wrapper.
- `GameOrbitCameraDrawProps` (`@jgengine/core/camera/GameOrbitCamera.draw`): Everything the orbit draw reads each frame, resolved by the React wrapper.
- `SplitScreenRendererProps` (`@jgengine/core/camera/Viewports.draw`): ⚠ undocumented
- `ImpactFeedbackDrawProps` (`@jgengine/core/combat/ImpactFeedback.draw`): Props the impact draw reads; resolved by the React wrapper each commit.
- `HitMarkersDrawProps` (`@jgengine/core/combat/ShotFeedback.draw`): ⚠ undocumented Also `MuzzleFlashesDrawProps`.
- `dataObjectsDraw` (`@jgengine/core/data/DataObjects.draw`): The instanced-box path as an {@link EngineDraw}; `renderItem` stays on the React wrapper.
- `groundPadDraw` (`@jgengine/core/environment/GroundPad.draw`): A flat circular or rectangular pad resting on a terrain field.
- `TerrainGroundDrawProps` (`@jgengine/core/environment/terrainGround.draw`): Props for {@link terrainGroundDraw}: the terrain descriptor, live field, optional island center and sculpt snapshot.
- `fireLandscapeDraw` (`@jgengine/core/fire/FireLandscape.draw`): Draw a {@link FireLandscape}: a ground overlay of flaming, smouldering, charred and ashen cells, flame billboards as tall as each cell's flame length, and smoke puffs rising from burning cells and drifting downwind.
- `flushAfterRenderTasks` (`@jgengine/core/frame/afterRenderBoard.draw`): Run every task joined with {@link joinAfterRenderTask}, in join order. Also `flushBeforeRenderTasks`, `joinAfterRenderTask`, `joinBeforeRenderTask`.
- `EngineCanvas` (`@jgengine/core/frame/engineCanvas.draw`): The engine-owned replacement for r3f's `<Canvas>`: one canvas, one {@link createEngineLoop}, and an {@link EngineHostProvider} so every draw wrapper underneath mounts through `useEngineHost`/`useEngineDraw` exactly as it did under `R3FEngineHost`. Also `EngineCanvasProps`.
- `EngineHost` (`@jgengine/core/frame/engineHost.draw`): The render host a React subtree draws through: the engine loop's provider.
- `childFrameState` (`@jgengine/core/frame/engineLoop.draw`): A frame state scoped to a subtree: draws mounted through this add their objects under `parent` instead of the scene root. Also `EngineDraw`, `EngineFrameBoard`, `EngineFrameState`, `EngineFrameloop`, `EngineLoop`, `EngineLoopOptions`, `createEngineLoop`, `groupDraw`.
- `bindFrameSource` (`@jgengine/core/frame/frameBoard.draw`): Drive the shared board from `next` by hand (a test, a headless harness): it becomes the primary whatever was bound before. Also `FrameOwner`, `FrameSource`, `FrameTask`, `FrameTaskRef`, `joinFrameTask`.
- `clearLoadDrawCache` (`@jgengine/core/frame/loadDraw.draw`): Drop every cached load (tests, scene teardown). Also `LoadDrawOptions`, `loadDraw`, `loadDrawSystem`.
- `createTestEngineHost` (`@jgengine/core/frame/testEngineHost.draw`): ⚠ undocumented Also `MountedTestDraws`.
- `disposeObjectTree` (`@jgengine/core/frame/useEngineDraw.draw`): Dispose every geometry and material under `root` â€” for demo/preview object trees built outside draws. Also `DrawTransform`.
- `generatorMeshInstanceDraw` (`@jgengine/core/generator/GeneratorMeshInstance.draw`): One placed generator instance drawn through the mesh builder registered for its output family (`registerGeneratorMesh`), regrown from its params and seed.
- `grassCoverDraw` (`@jgengine/core/grass/GrassCover.draw`): The turf surface under one authored `grass_field` patch: a ground-draped, edge-feathered mat that turns a bare pavement footprint into grass the blade field stands in.
- `grassPatchDraw` (`@jgengine/core/grass/GrassPatch.draw`): The engine's one grass renderer: a camera-streamed blade field over a turf mat.
- `AnchoredOverlay` (`@jgengine/core/hud/hudOverlay.draw`): A world-anchored DOM overlay: drei's `<Html position center>` while r3f owns the canvas; under the engine loop a div projected to the anchor every frame, with `distanceFactor` scaling matched to drei's `distanceFactor / (2·tan(fov/2)·distance)`. Also `HudOverlay`.
- `staticShapeBatchDraw` (`@jgengine/core/instancing/staticShapeInstances.draw`): One instanced batch as an {@link EngineDraw}.
- `worldItemMarkerDraw` (`@jgengine/core/item/WorldItems.draw`): Draw-side form of the marker's meshes: the ground ring and bobbing gem are added under the caller's pose group, which the frame writes the entity pose onto.
- `backdropFogDraw` (`@jgengine/core/lighting/SceneLighting.draw`): Draw-side form of {@link BackdropFog}: writes the backdrop's linear or exponential fog onto the real scene (a scoped mount group's `scene` is not the scene fog lives on); clears it on dispose. Also `configuredLightingDraw`.
- `lightBeamDraw` (`@jgengine/core/map/LightBeam.draw`): A glowing column of light rising from where it is placed, for finding something from afar: a fallen body, a supply crate, an objective.
- `markerAccess` (`@jgengine/core/map/map.view`): Non-hook access to a marker collection's subscribe/snapshot pair, for draw factories. Also `MarkerAccess`.
- `mapMarkerBeaconsDraw` (`@jgengine/core/map/MapMarkerBeacons.draw`): World-space beacons for map markers (the visible in-world side of a ping): a floating diamond over a soft light beam, colored by marker kind.
- `hairCardsDraw` (`@jgengine/core/material/hairCards.draw`): ⚠ undocumented
- `leasedMaterialMeshDraw` (`@jgengine/core/material/materialAsset.draw`): An {@link EngineDraw} mesh whose material arrives asynchronously: mounts with `fallback` (or a plain standard material), swaps in the leased material when `load` resolves, and disposes the lease with the draw. Also `materialAssetMaterial`, `materialAssetSwatchDraw`.
- `surfaceMaterialPreviewDraw` (`@jgengine/core/material/surfaceMaterialPreview.draw`): ⚠ undocumented
- `trackSurfaceScan` (`@jgengine/core/material/surfaceScanTextures.draw`): Acquire a scan for draw code: the first holder starts the decode, `onChange` fires once the maps are ready or have failed, and the last release frees the GPU textures. Also `SurfaceScanTrack`.
- `triplanarAssetMaterial` (`@jgengine/core/material/triplanarMaterial.draw`): The draw-side form of the old `useTriplanarAssetMaterial`: resolves the asset's maps, applies world-space triplanar projection and returns an owned lease.
- `entityModelDraw` (`@jgengine/core/model/entityModelDraw.draw`): Draws an entity's model without React: loading, cloning, materials, paint, attachments, parts, animation, foot IK, glance, bounds and collision measurement — the `EntityModel` contract on the engine frame loop. Also `EntityModelDrawOptions`, `MeasureTarget`, `ModelTextureEntries`, `entitySpriteDraw`, `isolatedEntityModelDraw`, `isolatedModelUsesVariants`, `loadModelMaterialTextures`, `singleVariantModelDraw`.
- `measuredBoundsDraw` (`@jgengine/core/model/measureBounds.draw`): Wraps custom-rendered actor content (`renderEntity` / `renderObject`) and reports its measured entity-local bounds into collider resolution, so the hitbox wraps what is actually on screen instead of the fixed-size fallback box.
- `modelInstanceDraw` (`@jgengine/core/model/modelInstanceDraw.draw`): The draw-side {@link ModelInstanceConfig} renderer: loads the shared GLTF, clones and places the model through the same build path entity draws use, then poses it every frame. Also `ModelInstanceConfig`, `ModelInstanceDrawOptions`, `ModelInstanceOptions`, `ModelInstanceReady`.
- `naturePreviewDraw` (`@jgengine/core/nature/naturePreview.draw`): ⚠ undocumented
- `instancedJointsDraw` (`@jgengine/core/physics/InstancedJoints.draw`): Debug overlay drawing a PhysicsWorld's joints (suspension, ragdoll links, carry tethers) as one LineSegments batch.
- `placementGhostDraw` (`@jgengine/core/placement/PlacementGhost.draw`): Cursor-following build ghost: valid/invalid tint from a placement controller preview.
- `postProcessingDraw` (`@jgengine/core/postfx/PostProcessing.draw`): Draw form of the old `PostProcessing` component: owns the EffectComposer graph, the devtools audit probe, tone-mapping override and the cover-gated effect reveal. Also `PostProcessingProps`.
- `spriteBatchDraw` (`@jgengine/core/render/SpriteBatch.draw`): Renders a sprite sheet / tile atlas as a single InstancedMesh — one draw call for the whole batch.
- `tileLayerRendererDraw` (`@jgengine/core/render/TileLayerRenderer.draw`): Renders a tilemap as one instanced quad mesh with atlas UV rectangles.
- `RoadJunctionsProps` (`@jgengine/core/roads/RoadJunctions.draw`): Props for {@link RoadJunctions}.
- `roadRibbonsDraw` (`@jgengine/core/roads/RoadRibbons.draw`): Renders every road that looks like `road` (equal {@link roadLookKey}) from their trimmed centerline sub-paths (cut back at every junction by {@link buildAuthoredRoadNetwork}): an asphalt ribbon, a curb/edge strip along each border, an optional dashed centerline, and optional sidewalks. Also `RoadRibbonsProps`, `roadsDraw`.
- `scannedRibbonDraw` (`@jgengine/core/roads/surfaceRibbonMaterial.draw`): One ribbon mesh whose material follows a scanned surface: hidden while the scan decodes (so the shader warmup links only the programs the first frame draws), rebuilt when the maps land or the spec changes, and swapped for the flat fallback whenever the ribbon material is absent. Also `ScannedRibbonSpec`.
- `instancedScatterDraw` (`@jgengine/core/scatter/InstancedScatter.draw`): Renders resolved {@link ScatterInstance}s grouped into per-chunk, per-species GPU-instanced draws that frustum-cull independently.
- `ScatterImpostorFieldDrawOptions` (`@jgengine/core/scatter/ScatterImpostorField.draw`): ⚠ undocumented
- `ProxyPolesSpec` (`@jgengine/core/scene/PoleLineRenderer.draw`): ⚠ undocumented
- `sceneCaptureBindingDraw` (`@jgengine/core/scene/sceneCapture.draw`): In-canvas binder that registers the live renderer for `requestSceneCapture` and `requestSceneThumbnail` (a photo-mode Capture button, a save slot's thumbnail), which wait for this mount and the first painted frame.
- `SceneWarmupGateProps` (`@jgengine/core/scene/SceneWarmupGate.draw`): ⚠ undocumented
- `studioStageDraw` (`@jgengine/core/scene/StudioStage.draw`): The stage's lights, floor and backdrop as an {@link EngineDraw}; `getSpin` resolves the group the React children render under so turntable/faceCamera still spin them.
- `skyDomeDraw` (`@jgengine/core/sky/Daylight.draw`): Draw-side form of {@link SkyDome}: an owned shader-material sphere that follows the camera on x/z, converts its zenith/horizon through the display-color writers each frame, and rebuilds its material and geometry only when the resolved inputs change â€” the same memo boundaries the hooks had. Also `SkyFogDrawProps`, `SunLightDrawProps`, `skyDraw`, `skyFogDraw`, `sunLightDraw`.
- `CameraPoseDraw` (`@jgengine/core/stage/stageDraw.draw`): Mount a {@link CameraPoseSpec} as one draw. Also `CameraPoseSpec`, `OrbitControlsDraw`, `OrbitControlsSpec`, `StageDraw`, `StageLight`, `StageSpec`, `cameraPoseDraw`, `orbitControlsDraw` and 1 more.
- `carvedTerrainDraw` (`@jgengine/core/terrain/CarvedTerrain.draw`): Renders a `TerrainField` as a deformed ground mesh — the crater/mound view for destructible terrain.
- `editableGroundDraw` (`@jgengine/core/terrain/EditableGround.draw`): Mesh an editable terrain inside its bounds, coloured by each point's painted surface; bump `version` after an edit.
- `proceduralGroundDraw` (`@jgengine/core/terrain/ProceduralGround.draw`): A seeded noise-height ground mesh coloured from low to high ground.
- `RequiredTerrainMaterialInput` (`@jgengine/core/terrain/requiredTerrainMaterial.draw`): ⚠ undocumented
- `terraformBrushCursorDraw` (`@jgengine/core/terrain/TerraformBrushCursor.draw`): A ground ring showing where a terraform brush will act, coloured by its mode.
- `noteTerrainQuality` (`@jgengine/core/terrain/terrainQuality.draw`): The graphics tier for draw code, which has no React context. Also `terrainQuality`.
- `TerrainSurfacesInput` (`@jgengine/core/terrain/terrainSurfacesDriver.draw`): What a terrain surface bake needs: the resolved surface roles, paint-layer scans and graphics tier. Also `TerrainSurfacesSnapshot`.
- `TolerantTerrainMaterialInput` (`@jgengine/core/terrain/tolerantTerrainMaterial.draw`): ⚠ undocumented
- `RuneUi` (`@jgengine/core/ui/runeUi.view`): One mounted Rune UI layer. Also `RuneUiEvent`, `RuneUiFrame`, `RuneUiNode`, `RuneUiOptions`.
- `particleFieldDraw` (`@jgengine/core/vfx/ParticleField.draw`): One pooled simulation drawn as a point cloud or instanced quads, as an {@link EngineDraw}. Also `ParticleFieldDrawOptions`.
- `CullingProviderDrawProps` (`@jgengine/core/visibility/CullingProvider.draw`): ⚠ undocumented
- `oceanDraw` (`@jgengine/core/water/Ocean.draw`): An animated Gerstner-wave water surface lit by the scene's sky: it reflects the sky's colours, takes the sun's and moon's light, clears over shallows and foams at the shore wherever `bedAt` puts the bed, and follows the camera to the horizon when `config.follow` is set. Also `OceanDrawProps`.
- `dustFieldDraw` (`@jgengine/core/weather/DustField.draw`): Renders wind-borne particulate as camera-facing motes.
- `birdsDraw` (`@jgengine/core/weather/LivingWorldLayer.draw`): Draw-side form of `Birds`: an instanced gull flock orbiting the camera's look point, fading in only in fair daylight. Also `BirdsDrawProps`, `LitterDrawProps`, `LivingWorldProps`, `SteamDrawProps`, `litterDraw`, `livingWorldDriverDraw`, `livingWorldVisualsDraw`, `steamDraw`.
- `rainFieldDraw` (`@jgengine/core/weather/RainField.draw`): GPU-animated rain streaks around the camera, sheltered under authored roofs.
- `rainImpactFieldDraw` (`@jgengine/core/weather/RainImpactField.draw`): Bounded ground ripples sharing precipitation intensity and authoritative animation time.
- `snowFieldDraw` (`@jgengine/core/weather/SnowField.draw`): GPU-animated drifting snowflakes around the camera, sheltered under authored roofs.
- `markerAccess` (`@jgengine/react`): Non-hook access to a marker collection's subscribe/snapshot pair, for draw factories. Also `MarkerAccess`.
- WebGPU programs keep camera and light uniforms in a persistent buffer, uploading only the spans that changed each frame
- `WgslUniformBlock` (`@jgengine/core/webgpu/glslToWgsl.draw`): Where one of three's uniform names lives: `shared` is the program-wide block (binding 0, persistent across frames), `object` the per-object block (binding 1, restaged per draw batch).

### Changed

- Background jobs started through Git Bash now write their output to the job log
- A scene that sets no style draws the same grass as before, with tufts in new places (the placement fix above)
- A scene that sets no style draws the same grass as before: every new slider sits on today's look at realism 0.5, and all of them are shader uniforms, so moving one never compiles a new shader
- lane:close merges its own PR once its verify:fast receipt covers the pushed head; no landing queue and no PR CI
- A passing verify:fast --landing of the same tree is reused: lane:close skips preflight and verify in one line
- Timed runs share one machine-wide perf lock (scripts/perf-lock.ts), so two never overlap
- A release publishes even when beta moves while it waits
- Shadow cache: static casters draw once into a per-light depth layer and each pass redraws only the casters that changed, bit-identical to a full redraw (0 differing texels on all 9 frame games, walking and standing). Closes #3018
- Tally before/after benchmarks ride every lane close into the PR body
- WebGPU: correct boot and shadows, cheaper passes, MSAA resolved in its own pass, perf tooling (part of #3066)
- Before/after (WebGPU p50 ms on the same frozen moment, beta -> branch, run back to back): Fernwild 35.3 -> 13.1, Scrap Signal 17.1 -> 12-15, Harbor Heat 14.8 -> 10.3, Ember Command 11.3 -> 7.6, Odd Orbit 7.6 -> 3.7, Beacon Bastion 5.5 -> 4.0. WebGPU/WebGL went from 1.2-3.2x to 0.8-1.2x. Drift Foundry and Deepward were fast on beta only because they drew less (a missing program, a black frame). Full table and per-run ratios: https://github.com/Noisemaker111/jgengine/issues/3066#issuecomment-6722682320
- Unequal coverage: there is no paired perf desktop --all run on the final head, because C: had 1-4 GB free and a build set needs 2.6 GB plus the 2 GB capture floor. The last desktop run is at 9c03ac0fe. Repeats per game range from 2 to 5.
- Cut per-frame engine garbage in hot paths: pooled frame-breakdown timers and draw keys, scene-walk stacks and starts, particle, flock, grass, terrain and visibility scratch, single world-model fact merge
- # one-pr-split: first PR landed before the goal was met
- The game-flow system defines its commands from a list with one entry each, with its own comment; a new command adds an entry, and the test lists one command name per line
- Fernwild's game.config.ts lists every import one name per line, and its prompt sources, systems and movement settings one per line
- Verified: depth-run passed 135 steps in the browser dev build and in the WebView2 desktop build; the model cannot view images, so screens were checked through probe data and shot.json pixel signatures.
- Owns lock-before-dev-server/browser for fps-gap, audits, desktop: every perf script that takes the lock (play, gate, fps-gap, shadow-audit and the audits that share its loop, network, desktop, native, timing, drive --hitches/--trace) takes it before it asks for a dev server or launches a browser or app; #3083 and #3087 drop their copies when they rebase
- The repo's AGENTS.md perf rule and the perf docs say a claim about what players experience comes from a --production run and quotes the scorecard. The dev-against-production comparison was not run (Jon, 2026-11-09)
- Measured on the Linux host, dev server started the way the broker starts it, deepward then beacon-bastion loaded headless with perf's URL, vite process read from /proc, two paired runs each: after both games resident memory 1,081-1,098 MB before vs 706-839 MB after, peak 1,574-1,600 MB vs 745-872 MB, CPU 26-32 s vs 6.3-6.7 s. Proof on code not edited by hand: a game freshly generated by jgengine create builds its stylesheet in 0.28 s CPU at 383 MB; with the old template line the same file took 11.25 s CPU and 803 MB. bun run perf deepward ran end to end through the broker with the server at 470 MB.
- The class: every agent worktree runs its own dev server, so any per-server cost that grows with the repo's assets rather than the game being served is multiplied by every running thread. Chosen layer: the engine's own config and templates make the cheap scan the default, and a test keeps it, so the next game (template) and the next script (all use apps/dev's config) get it without anyone remembering. Rejected: one shared dev server per machine keyed by worktree already exists (scripts/devBroker.ts, one per checkout, stopped after 10 idle minutes) and cannot share module graphs between checkouts whose code differs, so it does not cut per-copy cost; moving apps/dev/public out of the Vite root covers only the runner, not a game's own public/ when it runs standalone, and moves 1,200 tracked files; capping glibc malloc arenas (MALLOC_ARENA_MAX=2) was measured and changed little, and it is Linux-only. Checked and left alone: the texture-compression pass each server start spawns costs 0.6 s CPU and 130 MB once the store is filled; the remaining ~700 MB is Vite's module graph for ~3,700 served modules (JS heap 175 MB after two games).
- Unverified: the Windows numbers were not re-measured (needs a PC thread: start a runner with bun run shoot <game> and read the vite process's private memory); the scan is file reading, not file watching, so nothing here is Windows-specific.
- lane:close runs its gate (preflight and verify:fast --landing) on the boat host when it is up, so landings started on the PC stop loading it; when the host cannot run it, the gate runs on the PC after a degraded: line
- Capture tools report a dead browser daemon as a failure, restart it once, and the broker no longer dies with a fairshare slot
- Boat host timings, alone: dry throat 2650 ms -> 522 ms of a 20 s limit; understeer 40% 3459 ms -> 2310 ms and 60% 3182 ms -> 1967 ms of a 30 s limit, with the measured-vs-analytic gap unchanged (0.0315 and 0.0507 deg/g against the 0.08 tolerance)
- lane:close resolves a rebase conflict in a game's suite report by merging its rows by proof file, then regenerates the README/PLAN score
- lane:close keeps both sides when two lanes only added lines at the same place (the base's first); an edit to a line the other side changed stays a real conflict, and the rebased tree is verified before it merges
- A session that starts on a lane whose AGENTS.md changed on beta since it branched is told to read beta's rules

### Fixed

- Runs no longer lose their dev server and browser mid-flow because an older checkout started the shared dev broker inside its own fairshare slot. The broker protocol is now 2, meaning "runs outside its starter's job". A run passes by a busy protocol 1 broker with its own servers, and replaces an idle one. On 2026-11-08 the broker died silently 15 times in 3 hours, each time right after a run from a checkout without #3056
- frames cost less CPU in every game with the same image: culling walks only changed stores and marks its sets on each object's record, static prop batches re-gather only when their own members entered or left the view and run their sources only after a change, terrain height samples are about 40% faster with identical heights, grass bakes are faster and keep their tufts, foot IK no longer recomposes every ancestor, and three's render and shadow walks start from the nodes they draw
- the stray browser sweep counts a kill by whether the browser exited, so a busy PC's slow taskkill no longer leaves a dead browser's profile behind
- A far grass field no longer draws faint rows like a planted crop: tuft roots follow a scrambled Sobol spread instead of R2, whose short prefixes (what a far field keeps) were a near-regular lattice
- Grass patches share one GPU copy of the blade template instead of uploading their own each, so walking into new grass costs less, most at realism 1
- Dev telemetry no longer turns off at random on a busy PC: the page waits 30 s, not 1.5 s, for the dev server's report route, and says so in its log when it gives up (perf records had come back without a frame breakdown)
- `bun run lane:close` on a lane branched before beta's current verify:fast receipts stops in seconds with "Merge beta into this branch (git merge origin/beta) and close again". Before, it ran the whole verify:fast (40 minutes on 2026-11-08), then refused to merge with a misleading "the files changed while verify:fast ran"
- A lane that changes `scripts/verify-receipt.ts`, which lane:close reads receipts with, now lands with its own landing code, like one that changes lane-close or land
- the post chain draws three fewer full-screen copies (exposure meter, GTAO blend, atmosphere apply), one draw for the beauty copy, AO and contact shadows, and bloom without its twelve clears, with every frame bit-identical (perf post-audit: 0 differing texels in all 9 games); GPU post time dropped in every game measured
- perf fps-gap and the perf audits take the perf lock before starting a game's dev server and browser
- the core API-surface test's budget fits a whole-package type walk on a loaded machine
- the subcommand test still expected perf gate's old 1500 s guard after the gate's guard became 5400 s
- the sky dome draws after the opaque scene, pinned to the far plane, so its depth test shades only the open sky instead of every pixel the scene then paints over (0.12-0.18 ms of GPU a frame in Harbor Heat and Fernwild, about 0.03 ms after), and a large sky radius no longer depth-clips to black
- draw-timed GPU work brackets only the context's draw, clear and blit calls, because a timer opened before three binds uniforms and textures also counts the GPU idle during that setup (Harbor Heat's scene pass read 6.6 ms that way against about 2 ms of draws)
- baked crowds (cars, planes, buses, people) and scatter proxies keep their index buffers instead of flattening every part to loose triangles, so each shared vertex is shaded once rather than once per triangle corner: the same triangles in the same order, so the same pixels, with about a third of the vertex shading in every pass that draws them (Harbor Heat's 37k-triangle car batch drew 783k triangles a frame at three vertex runs each)
- perf gate and fps-gap give each game's browser session a deadline that covers the capture's two readiness windows, its warmup and its windows, instead of a fixed 300 s that killed a busy PC's page right after the capture granted it more time; their run guards back that up at 5400 s
- the frame breakdown can time every draw and clear on its own (gpuTiming "draws"), because a pass timer also counts the GPU idle while the CPU submits; perf fps-gap now reports that GPU work per game and pass beside the old span (Harbor Heat's scene pass: 2.75 ms of work in a 7.7 ms span)
- Deepward's half-second-plus stalls on dives, lifts and stratum changes, Harbor Heat's freeze getting into a car in the rain, and HUDs that re-rendered every panel every tick (Deepward React renders 8,192/s to 131/s; worst stall in browser long-play 8.2 s to 491 ms)
- the WebGPU backend draws every game as WebGL does and is now about level with it on the same frozen frame (up to 3.2x slower on beta). WebGL stays the default because WebGPU wins on no game on every run
- shadow checks run only on frames a pass can serve from the cache, churned and always-dynamic casters skip dead snapshot work, far scatter bands stop casting shadows past 250m, and Fernwild adopts hlod with tighter mesh LODs
- the fernwild dry-throat test proves food outlasts water at the measured drain rates again
- lane:close keeps both of two blocks lanes added at one place whole when they open or close with the same lines
- lane:close keeps one copy of lines a lane carries from another unlanded lane it branched from, instead of a duplicate import name that does not compile
- a perf run no longer fails on ERR_CONNECTION_REFUSED after a long lock wait; a test fails any script that takes the perf lock and fetches a dev server outside it
- verify:fast reruns once the test files of a step whose every failure is a timeout (a starved run on a busy PC) and prints a degraded line; a real hang still fails. Browser tests that symlink into a fixed scratch folder clear it first, so a rerun after a killed run does not fail on EEXIST. Also: a failing browser-process listing prints a degraded line, and the capture-readiness, headRevision, guard, harness-parity and land.test limits no longer depend on a fast, idle PC
- a production build of the runner bundled every game's tests and standalone main.tsx (the glob exclusions only held in the dev server), so opening a game ran its tests and mounted a second React root that crashed the first; jgengine.com's current build has the same 480 test chunks and 9 game entries and needs a release to get the fix
- the dev runner (apps/dev) holds about a third less memory and spends a quarter of the CPU per server: every Tailwind stylesheet named no source folder, so Tailwind scanned from the Vite root and read all 341 MB of GLB models in apps/dev/public for class names, about 12 CPU-seconds and 700 MB per stylesheet, twice per game load (the runner's stylesheet and the game's)
- each canvas on a page runs its own frame tasks, so model previews and second viewports no longer draw with another canvas's camera
- a scene group keeps one group across renders, and a draw rebuilt on every render warns once
- the fernwild dry-throat test and the reference-car understeer tests no longer sit near their time limits
- the WebGPU pass recorder and vertex attribute copies stopped allocating per frame

### Removed

- `@jgengine/core/ui/liveBind.view` no longer exports `frameBindSubscriberCount`.
- `@jgengine/react` no longer exports `useGameStoreLive`.
- `@jgengine/react/hooks` no longer exports `useGameStoreLive`.
- `@jgengine/core/webgpu/engineRenderer.draw` no longer exports `engineRendererFactory`.
- `@jgengine/core/lighting/CascadedShadows.draw` no longer exports `CASCADE_DEPTH_STEP_TEXELS`.
- boat.dev machines and the fairshare slot from verify:fast and lane:close. Checks and landings now run every step on whatever machine the session runs on (T3 Code decides where sessions run), so there is no boat/local branch, no exit 75, and no JG_VERIFY_BOAT, BOAT_EXE, JG_BOAT_TIMEOUT or JGENGINE_SUITE_WRITE.
- react-three-fiber and drei. The 3D layer runs on plain three.js under an engine-owned frame loop (createEngineLoop, EngineCanvas, useEngineDraw); bun run check r3f-free keeps them out
- `@jgengine/core/anim/PartMotion.draw` no longer exports `PartMotionRig`.
- `@jgengine/core/buildings/GeneratedBuilding.draw` no longer exports `BuildingBlock`, `BuildingBlockProps`.
- `@jgengine/core/material/authoredSurfaceMaterial.draw` no longer exports `AuthoredSurfaceMaterial`, `useAuthoredSurfaceMaterial`.
- `@jgengine/core/material/materialAsset.draw` no longer exports `MaterialAssetSurface`, `useMaterialAssetMaterial`.
- `@jgengine/core/material/surfaceScanTextures.draw` no longer exports `useSurfaceScan`.
- `@jgengine/core/material/triplanarMaterial.draw` no longer exports `TriplanarAssetMaterial`, `useTriplanarAssetMaterial`.
- `@jgengine/core/model/SceneModels.draw` no longer exports `MeasureTarget`.
- `@jgengine/core/model/useModelInstance.draw` no longer exports `ModelInstance`, `ModelInstanceConfig`, `ModelInstanceOptions`, `useModelInstance`.
- `@jgengine/core/scene/useDecalTexture.draw` no longer exports `useDecalTexture`.

Earlier releases (0.1.0–0.54.0): see git history (`git log`) or GitHub Releases.
