# LLMville plan

Brief: LLMville becomes a real game built on the engine, and one of the best-made games in the repo. It used to run on the engine and drifted into its own private engine. The engine carries everything that is not LLMville's own rules, content and look. Tracking issue #2837 (line S6).

## Direction

The game design stays as the README checklist states it. This plan changes what the game is built on, not what it is.

- **Genre and references.** A cosy co-op AI-lab tycoon in one shared world. From Stardew Valley it takes a plot that grows one placed piece at a time. From Factorio it takes machines that are always busy on a job you gave them. From Cookie Clicker it takes numbers that compound into the next tier.
- **Faithfulness.** The current LLMville is the reference. Every price, rate and rule in `packages/game/src` keeps its value. Saved worlds keep loading: the seeds and hashes in `packages/game/src/world/cityHash.ts` are pinned.
- **Breadth.** Everything in today's game stays: racks, GPUs, data scraping, training, serving, research tiers, bills, the daily market, the frontier, the tutorial, world chat, presence and bots.
  - Out of scope for this idea: new systems, rebalancing and sound. Sound is a gap in the README; it gets its own idea once the HUD is on the kit.
- **Players.** One persistent shared world on Convex, with accounts through Better Auth and guests. This does not change.
- **Platforms.** Desktop and phone. The touch controls stay.
- **Camera and controls.** First person in the world, plus a tablet that holds the menus. Both stay.
- **Look.** The owner wants this to be the nicest-looking game in the repo. `src/art-direction.md` describes today's look and offers three directions.
  - **Chosen: A, "Miniature lab diorama"** (owner, 2026-11-02). Keep today's warm cream, coral and teal palette and push it into tilt-shift, soft-shadowed miniature scenes.
- **Done.** Every row below marked "game" is the only private code left. All other rows import their engine owner. The game boots and plays the README's minute-5 state:
  - two GTX 1060s in one rack
  - one card scraping
  - one card serving a fine-tuned model at about $200/hr
  - bills arriving on the engine schedule
  - the world, the settings and the HUD all on engine parts
- **Production.** llmville.com and Convex prod `adorable-oriole-506` keep deploying from the old repo through milestone 6. The owner approved switching them to this repo as milestone 7, once the shared world on the engine's Convex parts is done and tested (2026-11-02). No earlier milestone deploys.

## Design brief

To be written once milestone 2 puts the game on the shell game player. That is the first point where a headless from-zero flow can boot it. Until then `games/scripts/depth-known-failing.json` keeps LLMville's brief, from-zero and depth entries.

## Features

`bun run jgengine has` was run for all 44 features in one call, and every partial was read. "Game" means LLMville's own rules, content or presentation; it stays in the game. Line counts are from today's tree.

| Module (lines) | What it is | Engine owner | Verdict |
| --- | --- | --- | --- |
| `src/settings` (1,060) | Settings modal, graphics preset, reduced motion, keybinds | `core/settings/settingsModel` `createSettingsStore`, `core/settings/accessibilitySettings`, `core/input/bindingOverrides`; modal onto `SettingsSection` / `KeybindingMenu` | covered (M1 store, M3 UI) |
| `src/storage/storage.ts` (192) | Raw localStorage camera look, menu session, stale account keys | `core/game/keyValueStore` `createKeyValueStore` with injected `KeyValueStorage` | covered (M1) |
| World save (Convex tables) | The authoritative shared world | `core/save/hostedWorldStore`, `convex` `createConvexSaveBackend`, `persistServerSnapshot` | partial (M5) |
| `src/movement` (1,301) | First-person controller, touch look, presence sync | `core/movement/movementModel`, `cameraRig`, `solidObstacles` (already imported), shell player movement | covered (M2) |
| `src/runtime` (5,403) | Session shell, engine glue, clock, timers, profiler, HUD bar | `shell` `GamePlayerShell`, `core/time/calendarClock`, `core/time/timerSet`, `core/devtools` `PerfPanel` / `FrameTelemetry` | partial (M2; profiler is a gap) |
| `src/runtime/clock.ts` (72) | Server-offset calendar clock | `core/time/calendarClock`, `core/time/serverTick` | covered (M2) |
| `src/runtime/engineEphemeralTimers.ts` (54) | One-shot UI cue timeouts | `core/time/timerSet` | covered (M2) |
| `src/runtime/runtimePerformance*.ts` (807) + overlay (463) | Per-section frame profiler and jank report | `core/devtools` `PerfPanel`, `perfDiagnose` | gap: per-section timing |
| `src/components/ui` (597) | shadcn-style button, card, panel, progress, toast | `core/ui/kit` tokens, `HudSlots`, `@jgengine/core/hud/kitHud.view` | covered (M3) |
| `src/index.css` (2,353) | Tailwind and the token palette, plus every component style | `core/ui/kit` `customizeKit` tokens; game keeps only its skin | covered (M3) |
| `src/tablet` (1,964) | In-game tablet OS that holds the menus | Windows and app frames from the HUD kit; app content is the game | partial (M3) |
| `src/economy/components` (703) | Bill cards and news tweets | `core/notifications` `createNotificationCenter`, `ToastStack`; injected rng | covered (M3) |
| `src/tutorial` (771) + `packages/game/src/tutorial` (484) | 9-step first-model tutorial | `core/onboarding/onboardingSystem`, `OnboardingCallout`; steps are game content | covered (M6) |
| `src/branding`, `src/seo`, `src/pwa` (512) | Landing page, logo, mascot, meta tags | game | game |
| `src/auth`, `src/user` (2,613) | Better Auth session, character and world creation | Accounts stay on Better Auth. `NewCharacterPane` for character creation (M3). | partial |
| `src/dev` (7,442) | Private level builder and asset workbench; the runtime reads nothing it writes | `@jgengine/editor`, `editor.scene.json`, `core/editor` | covered (M4: delete) |
| `packages/game/src/builder` (1,515) | Pure builder document core used only by `src/dev` | `core/editor` document ops | covered (M4: delete) |
| `packages/game/src/world` (1,601) | City grid, map decor, world model catalog, `cityHash` | Editor scene for placed decor; `cityHash` seeds stay game data | partial (M4) |
| `src/world`, `src/scene` (3,190) | Map app, endless datacenter, diorama props, scene composition | `core/scene/AuthoredScene.draw`, `Minimap`; prop models are game content | partial (M4) |
| `src/build`, `packages/game/src/build` (1,643) | Build mode and placement preview | `core/worldModel/buildTool`, `core/world` `validatePlacement`, `core/placement/TerritoryOverlay.view` | covered (M4) |
| `packages/game/src/datacenter` (1,622) | Plot claims, placed objects, cell rent | `core/world/territory`, `createPlotPermissions`, `convex/territory` | partial (M5) |
| `src/multiplayer`, `packages/backend/convex/multiplayer` (703) | Presence and world chat | `core/multiplayer/presenceContract`, `convex` `convexPresenceTransport`, `convexChatTransport` | covered (M5) |
| `packages/backend/convex/jgengine` (266) | Wrappers over the `@jgengine/convex` factories | `convex` `createConvexBackend`, `hostedServer` | covered (M5) |
| `packages/game/src/simulation` (1,169) | Client engine store and reducer | `core/runtime/gameRuntime`, `core/commands/commandRunner`, `core/scene/objectStore` | partial (M2/M5) |
| `packages/game/src/infrastructure` (1,707) | Rack slots, thermal curve, grid hookup tiers, power throttle | Meter `stats/statPool` (heat), Ladder `threshold/thresholds` (hookup tiers), `core/inventory` slots; catalogs are game | partial (M6) |
| `packages/game/src/economy/servingTick.ts`, `servingAdapter.ts`, `servingEconomy.ts` (631) | Serving income per tick, scraping | `core/time/accrueSince`, `core/time/serverTick`, `core/economy` wallet; income formula is game | partial (M6) |
| `packages/game/src/economy/billing.ts`, `billingRates.ts` (214) | Daily and monthly bills, grace period, late fee, APR | Schedule `time/pacedSchedule`, `createResourceLedger`, `createLoanBook` / `buildLoanSchedule` | partial (M6) |
| `packages/game/src/economy/dailyMarket.ts` (103) | One of 5 daily market modifiers, picked by hash | Table `random/pick`, Modifiers `progression/statGraph` | covered (M6) |
| `packages/game/src/economy/frontier.ts` (79) | Frontier benchmark decay | Phases/Schedule `time/`, Modifiers; the curve is game | partial (M6) |
| `packages/game/src/research/researchUnlocks.ts` (137) | Research tiers priced in data tokens | Ladder `threshold/thresholds`, Requirement `rules/predicate`, `core/game/unlocks` | covered (M6) |
| `packages/game/src/models` (2,211) | Training work, stat rolls on reveal, base models | `core/work/jobQueue` (already used), `core/random/rng`; the stats are game | partial (M6) |
| `packages/game/src/store`, `src/store` (637) | Shop catalogs and screen | `core/economy` `createMarket`; catalogs are game | partial (M6) |
| `packages/game/src/user` (315) | Founder perks and personal upgrades | Modifiers `core/stats/statModifiers` (already used) | covered |
| `src/models`, `src/inference`, `src/infrastructure` UI (5,349) | Model cards, compute assignment app, 3D racks, rack menu | HUD kit windows (M3); 3D rack models and copy are game | game, chrome M3 |
| Shared neighbourhood goal | Five labs build together | `core/world` `createContributionPool` | covered (M6) |
| Sound | None today | `useUiCue`, `createGameMenuSound` | out of this idea |

## Gaps

- **Per-section frame profiler.** `src/runtime/runtimePerformanceProfiler.ts` times named sections: movement, rack animation and webgl. The engine's `core/devtools` has `PerfPanel` and `FrameTelemetry` but no named sections. Build `recordProfileSection(name, ms)` and a ring buffer per section in `packages/core/src/devtools/frameSections.ts`, and give `PerfPanel` a sections tab. LLMville is the first adopter in M2; the game keeps it `framework-ok` until then.
- **Recurring bills with grace, late fee and APR.** `createResourceLedger` schedules recurring transactions and `createLoanBook` accrues interest. Nothing yet says that a charge left unpaid past a grace period starts accruing. Add a `dueAfter`/grace policy to `packages/core/src/economy/` beside the ledger and loan book. Do it only when a second game wants bills (Brightway Park's upkeep is the likely one); until then `billing.ts` stays in the game with `framework-ok`.
- **Convex shared-world save.** `createConvexSaveBackend` writes one save document. LLMville's world is many Convex tables written by authoritative mutations. M5 decides per domain: a domain whose state fits a hosted-world snapshot moves onto `core/save/hostedWorldStore` and `convex/hostedServer`; a domain that must stay a table (claims, chat) keeps its table behind `@jgengine/convex` factories. No engine change until a domain needs one.
- **Schedule part.** `README.md#the-parts` lists Schedule as planned in `time/`. Bills (daily and monthly) and the frontier (per real day) are its adopters. M6 uses `time/pacedSchedule.ts` when the part lands there.
- **Design brief and from-zero proof.** Play needs Convex and an account, so no headless flow has ever booted LLMville. M2 adds an offline mode on the shell's `offline` transport. A from-zero flow can then boot it, and the brief is written from that.

## Milestones

Each milestone keeps the game playing, deletes the private code it replaces in the same commit, and ticks itself here. They are ordered by risk, lowest first.

- [x] 1. **Settings and local state on engine parts.**
  - Settings now use the engine settings store: `graphics.quality` and `accessibility.reducedMotion`. Keybinds use engine binding overrides keyed `llmville`. Local camera look and tablet menu state live in one engine key-value store document, with storage injected.
  - A legacy `llmville:app-settings` blob and the per-key `ai-game:*` layout each move over once on first boot. Regression tests cover both.
  - Deleted: `src/storage/storage.ts` (192) and the localStorage code in `src/settings/settings.ts` (446 → 161, with keybind content split into `keybinds.ts`).
  - Accounts and the Convex world are unchanged.
- [ ] 2. **Movement and the shell game player.**
  - Mount the game in `shell` `GamePlayerShell` with the Convex transport, plus an offline mode for headless boots. Move movement onto shell player movement and `cameraRig`, the clock onto `calendarClock`/`serverTick`, and timers onto `timerSet`. Land the frame-sections gap.
  - Deletes:
    - `src/movement/PlayerMovementController.tsx` (244), `movementInput.ts` (289), `movementStepping.ts` (43), `playerStep.ts` (52), `useMovement.ts` (68)
    - `src/runtime/clock.ts` (72), `engineEphemeralTimers.ts` (54), `gameEngine.ts` (13), `gameEngineSession.ts` (32), `engineAccess.ts` (60), `engineWorldContext.ts` (43)
    - `runtimePerformanceProfiler.ts` (265), `runtimePerformanceDiagnostics.ts` (542), `components/PerformanceDiagnosticOverlay.tsx` (402), `components/PerformanceDiagnosticSampler.tsx` (61)
    - `packages/game/src/movement` (149)
    - about 2,390 lines in all
  - Then write the design brief and the from-zero flow.
- [ ] 3. **HUD on the kit, with tokens.**
  - Re-express the `index.css` palette as UI-kit tokens through `customizeKit`. Build the HUD bar, resource panel, tablet frame, bill cards, toasts and settings modal from `HudSlots`, `kitHud.view`, `SettingsSection`, `KeybindingMenu` and `ToastStack`.
  - Tweets get an injected rng and the engine notification center. This removes `Math.random` and `setInterval` from `TweetNotification.tsx`.
  - Deletes `src/components/ui/*` (597), `src/settings/components/*` (614), `src/runtime/components/GameHudBar.tsx` (19), `GameResourcePanel.tsx` (153), `UiHitTestOverlay.tsx` (206), and most of `src/index.css` (2,353 → the game's skin only).
  - Lands with before/after screenshots in direction A, the miniature lab diorama.
- [ ] 4. **World authored in the editor.**
  - Export today's city, plot grid and decor into `games/llmville/editor.scene.json`. The game reads it through `core/scene/AuthoredScene.draw`, and build mode moves onto `worldModel/buildTool`.
  - Deletes `src/dev` (7,442: builder, asset workbench, previews), `packages/game/src/builder` (1,515), `vite.devPlugins.ts`, `builder*.server.ts`, `builderAgent*.ts` and `builderScreenshotApi.ts`.
  - `cityHash` seeds keep their values.
- [ ] 5. **Rules on the parts.**
  - Rack heat becomes a Meter and grid hookup a Ladder. Bills move onto the Schedule part, the ledger and the loan book. Research tiers become a Ladder plus Requirement. The daily market becomes a Table plus Modifiers, and the frontier becomes Phases plus Modifiers. Training stays on `jobQueue`, the tutorial moves onto `onboardingSystem`, and the neighbourhood goal onto `createContributionPool`.
  - Every price and rate keeps its value, and the existing balance tests pin them.
  - Deletes the private copies in `infrastructure.ts`, `billing.ts`, `dailyMarket.ts`, `frontier.ts`, `researchUnlocks.ts` and `tutorialMachine.ts`. Only LLMville's numbers and names stay.
- [ ] 6. **Shared world on the engine's multiplayer contracts and the Convex adapter.**
  - Presence and chat move fully onto `convexPresenceTransport` and `convexChatTransport`. Claims move onto `convex/territory`. The world read-model moves onto `hostedServer`/`hostedWorldStore` where a domain fits a snapshot.
  - Deletes `src/multiplayer/*` (110), `packages/backend/convex/jgengine/*` (266) and most of `convex/multiplayer/worldPresence.ts` (398).
  - Migrations stay idempotent. Production keeps deploying from the old repo until milestone 7.
- [ ] 7. **Production deploys from this repo.**
  - Point llmville.com and Convex prod `adorable-oriole-506` at this repo, with the same env vars and schema, after milestone 6 plays against a Convex dev deployment.
  - Owner-approved. Done when the live site serves this repo's build and existing worlds still load.
