# Critique — Grok (2026-07-16)

Hard read of the JGengine monorepo as it sits today (~0.10.x). Not a compliment sandwich. Strengths only appear where they change what you should do next.

**How to use this file**

- Cutlist, not essay. Each item: **severity · problem · evidence · fix**.
- Severities: `P0` ship-blocker / product-lie · `P1` structural debt · `P2` real pain · `P3` polish / hygiene.
- Action IDs (`G1`, `G2`, …) are stable handles for ADRs/issues/PRs. Physics already points at an older `Y1` style in `packages/core/src/physics/README.md` — same idea.
- Phases are **priority order for work**, not “do Phase 0 forever.” Later phases assume earlier ones are honest.

**Snapshot of what was inspected**

| Area | Scale / fact |
| --- | --- |
| `@jgengine/core` source | ~671 `.ts` files (~343 non-test, ~328 tests) |
| `gameContext.ts` | ~1.7k lines, ~65k chars — composition root + public surface |
| Orphan baseline | **358** exported symbols with no game adopter / skill example (`scripts/api-orphan-baseline.json`) |
| Orphans by package | core 177 · shell 91 · editor 29 · assets 29 · convex 22 · node 8 · ws 2 |
| In-repo games | 10 under `Games/*` (13–93 TS files each); only **claudecraft** wires `ws({ authority: "server" })` as flagship host path |
| Shell | only renderer; R3F + three peers; `GamePlayerShell` ~2.2k lines |
| Editor package | ~33 source files on top of shell/core |
| License | AGPL-3.0-only on published packages |
| Product claim | “TypeScript game framework for AI agents,” **not** a general 3D engine / not an ECS |

---

## Phase 0 — Product honesty (stop lying to yourselves)

### G0.1 · P0 · “Engine” vs “framework for agent-built games”

**Problem.** Marketing and package keywords say “game engine.” README correctly walks it back: not ECS, not general-purpose 3D. Internally the culture still ships like a universal Unreal-lite (combat kits, BR rings, extraction, concealment sensors, nonogram, …).

**Evidence.** README line ~9; `package.json` keywords; skill surface spanning every genre; `features` opt-in still coexists with hundreds of always-importable modules.

**Fix.** Pick one product sentence and enforce it:

> **JGengine is an agent-first game framework SDK: catalogs + commands + optional systems + one R3F shell.**

Everything that does not serve *that* either graduates to a real first-class story (skills + game adopter + docs) or gets marked `@internal` / extracted / deleted. Stop measuring success by module count.

### G0.2 · P0 · AGPL is a commercial kill-switch you under-communicate

**Problem.** README has one careful paragraph. Agents and vibe-coders will still treat npm packages as “free to ship closed.” AGPL on a network-hosted game stack is a landmine for studios, steam pages, and most commercial agent-built prototypes that want to go paid.

**Evidence.** `LICENSE` AGPL-3.0-only; README “Who this fits”; no dual-license path, no “game code vs engine derivative” FAQ agents can cite.

**Fix.** Ship a one-page **licensing FAQ** (site + skill). Explicitly: what a game built *on* the SDK can keep proprietary vs when network use of *modified* engine forces source share. If commercial adoption matters, open dual-license talks *before* 1.0 — not after someone ships.

### G0.3 · P0 · Default multiplayer is not multiplayer

**Problem.** `authority` defaults to **client / presence-only**. Agents wire `ws()` / `convex()`, ship “multiplayer,” and get independent sims with shared chat/pose. That is a product lie in practice.

**Evidence.** `packages/core/src/runtime/adapter.ts` docs; only `Games/claudecraft` uses `authority: "server"` among in-repo games; shell warns when server authority has no URL.

**Fix.**

1. Make presence-only configs scream in types/names: `wsPresence()`, not `ws()` with silent client default.
2. Skill intake: multiplayer without `authority: "server"` + host recipe is **not done**.
3. Gallery / site copy must never imply shared-world sim without the host path.

### G0.4 · P1 · Version 0.x with a 1.0-sized surface

**Problem.** Lockstep 0.10.x already spans combat MMO surfaces, mobile layout composition, visibility systems, editor, assets mirror. Pre-1.0 is permission to churn — but orphans + migrate blocks show churn *without* surface discipline.

**Evidence.** CHANGELOG 0.8–0.10 additive walls; orphan baseline 358; deprecations like `GameDefinition.scene` retained for API compat.

**Fix.** Freeze a **public contract set** for 1.0 (defineGame, GameContext, PlayableGame, adapter, shell mount). Everything else experimental / `@internal` / skill-gated until an adopter proves it.

---

## Phase 1 — Architecture: core is a warehouse, not a kernel

### G1.1 · P0 · `createGameContext` is a god factory

**Problem.** One function wires combat, projectiles, death, inventory, economy, quests, chat, social, cards, turn, race, camera, input, save, snapshots, … The file is the architecture diagram: if it does not fit in a human head, agents will cargo-cult call sites.

**Evidence.** `packages/core/src/runtime/gameContext.ts` ~1673 lines; `GameContext` interface alone is a multi-screen facade.

**Fix.** Split composition:

- `createBaseContext` — scene, store, commands, events, feed, time, input, signal.
- Feature modules register via a real plugin seam (`install(feature)`), not a growing `if (features.quest)` nest.
- Public `GameContext` type assembled from feature interfaces so TypeScript *narrows* by declared features (today optional props are still a bag of `?`).

### G1.2 · P1 · “Not an ECS” without a coherent alternative model

**Problem.** Entity store is a keyed map of fat `SceneEntity` blobs (`position`, `rotation*`, `velocity`, `role`, `movement`, `behaviors`, `meta`). Parallel systems (stats map, possession, body bind, world items, object store) sit beside it. Then Unity-style `Behaviour` lifecycle is bolted on for tree/update semantics. Three mental models: bag-of-entities, subsystem facades, behaviour components.

**Evidence.** `scene/entityStore.ts`; `behaviour/behaviour.ts`; shell `behaviourDriver`; skill docs teaching all three.

**Fix.** Document **one** runtime model in a short ADR:

- Entities = identity + pose + role + meta.
- Systems = pure modules + optional `ctx` facades.
- Behaviours = optional attachment for tree/lifecycle only — not a second game loop.

Kill dual ownership of “where does my tick logic live?” (`onTick` vs `Behaviour.onUpdate`).

### G1.3 · P1 · Layering is good on paper, soft in practice

**Problem.** Declared rules (`core` zero deps; shell only renderer) are real strengths. But shell is a second game engine: movement integration, cameras, audio, weather, terrain materials, culling, world HUD, multiplayer sinks. Games that need a non-R3F renderer or non-React host hit a wall.

**Evidence.** Package table + `packages/shell/src/**` breadth; peer deps on react/three/fiber/drei; no alternate shell.

**Fix.**

- Extract **headless playable runner** (tick + input + command sink + snapshot) from R3F shell.
- Keep `GamePlayerShell` as *one* presentation backend.
- Stop putting genre presentation (ocean shader, rain, grass budget) in the only path agents can ship — or accept that the product *is* “R3F framework” and say so (Phase 0).

### G1.4 · P1 · Features flag vs module dump mismatch

**Problem.** `GameFeatures` opts in quest/trade/cards/… but dozens of domain modules (session/extraction, survival/moodle, sensor/*, tactics/*, puzzle/*, ai/*) are neither features nor clearly “always free utilities.” Agents cannot tell: import pure helper vs expect `ctx.game.x`.

**Evidence.** `defineGame.ts` `GameFeatures` (~15 flags) vs core directory tree (~40 domains); skill “Concept → Type” table is a phone-book.

**Fix.** Three tiers only:

1. **Kernel** — always on `ctx`.
2. **Feature** — `features: { … }` installs into `ctx`.
3. **Library** — pure import, never on `ctx`, never in orphan shame if skill-documented as library.

Promote or demote every domain into exactly one tier. Orphan gate should fail libraries without *either* adopter *or* skill library section — not a silent 358-line baseline.

### G1.5 · P2 · Double `defineGame` (core vs shell)

**Problem.** Agents already confuse engine fields and presentation fields. Two functions same name across packages is intentional layering that still burns tokens every session.

**Evidence.** `@jgengine/core/game/defineGame` vs `@jgengine/shell/defineGame`; skill has large dual docs; `GameLoop<any>` on core definition.

**Fix.** Rename core to `defineEngineGame` / `defineGameCore` in public API (shell keeps `defineGame`). One canonical import for games: shell only. Core export becomes advanced/host.

---

## Phase 2 — API surface: depth without discoverability

### G2.1 · P0 · Deep-path imports + no curated barrels = agent roulette

**Problem.** Zero root re-exports (`core/src/index.ts` only VERSION/CHANGELOG) is pure and tree-shake friendly. It is also hostile: every call site needs the exact file path. Skills compensate with a giant table; when the table and disk diverge, agents invent paths.

**Evidence.** `packages/core/src/index.ts`; skill “do not invent paths”; orphan + doc baselines; papercuts about false RED from unbuilt dist.

**Fix.**

- Keep deep paths for implementation.
- Add **curated entrypoints** per domain: `@jgengine/core/combat`, `@jgengine/core/world`, … exporting *stable* public symbols only.
- Generate those barrels from the same pipeline as `api.md` / capabilities — single source of truth.

### G2.2 · P0 · 358 orphans are a design smell, not bookkeeping

**Problem.** An orphan baseline that large means the product ships inventory, not capability. Harvest culture adds primitives for every genre probe; adoption never catches up.

**Evidence.** `scripts/api-orphan-baseline.json` length 358; core alone 177.

**Fix.** Policy change (enforce in gate):

- New export requires: skill example **or** in-repo game use **or** explicit `@internal` **same PR**.
- Quarterly orphan burn-down: 20% cut or promote to documented library.
- Stop harvest PRs that only add unadopted surface.

### G2.3 · P1 · Public APIs still leak engine mechanics

**Principle** (CLAUDE.md): public APIs express game intent. Reality: many factories expose buffer capacities, JSON-diff revisions, SoA indices, notify wrappers, internal joint constants.

**Evidence.** `PhysicsWorldConfig` capacity/cellSize/solver knobs as primary surface; `createWorldReplicator` JSON-string equality per entity; skill tables listing every helper including `@internal`-adjacent pieces.

**Fix.** Dual surface: `createX(intentConfig)` semantic + `createXAdvanced(engineConfig)` if needed. Default path should not mention cell size unless profiling.

### G2.4 · P1 · Skills are the real docs — and they are too long to be load-bearing

**Problem.** Main skill alone is a full manual (800+ lines in `jgengine/SKILL.md`). Domain references stack more. Agents “route selectively” but intake still dumps foundation + often multiple domains. Token cost is product cost.

**Evidence.** Skill file sizes; gen:skill-api / capabilities machinery; website renders skills as content.

**Fix.**

- Hard cap skill bodies; move encyclopedias to generated `api.md` / `reference.md` loaded only on demand.
- “Capability first, reference second” — `capabilities.md` is the real index; SKILL.md becomes routing + 10 examples max.
- Measure agent success by **first correct import**, not completeness of prose.

### G2.5 · P2 · JSDoc is excellent where present; consistency is not

**Problem.** Many public types have outstanding docs (`defineGame`, adapter authority, world features). Others are bare factories. Doc baseline exists *because* debt is permanent.

**Evidence.** `scripts/api-doc-baseline.json` ~2.6k lines; mixed JSDoc density across domains.

**Fix.** No new baseline entries. Debt only shrinks. Prefer deleting undocumented exports over documenting junk.

---

## Phase 3 — Simulation correctness & scale claims

### G3.1 · P0 · Scale is a slogan until proven

**Principle:** “Works at 10 but not 10,000 → not done.”

**Problem.** Spatial indexes, LOD scheduler, visibility culling, physics capacity — good seams. Replication still does full JSON re-serialize per entity for change detection (`createWorldReplicator`). Object raycasts default to unit boxes. Many queries are linear unless opted into grids.

**Evidence.** `worldReplication.ts` comment: “Change-detection is a full re-serialize per commit; dirty-hint acceleration is a later optimization.” `lod` / `visibility` exist but flagship multiplayer story is still one voxel game + express host.

**Fix.**

- Publish **one** stress bench number in-repo (entities × clients × tick) for host path; fail CI if it regresses beyond bound.
- Dirty flags on entity/store mutations → replication (not JSON equality).
- Document hard limits honestly (e.g. “presence-only not for competitive FPS”).

### G3.2 · P1 · Physics / movement split brain

**Problem.** ADR correctly keeps SoA `PhysicsWorld` separate from avatar controller. Games will still expect one physics. Custom solver re-owns stability forever (Y1 already logged).

**Evidence.** `packages/core/src/physics/README.md`; `playerMovement` / shell controller; body bind as manual bridge.

**Fix.** Keep Y1 decision, but:

- First-class `bodyBind` recipes in skills (character vs debris vs vehicle).
- Integration tests: projectile obstacles + controller + physics bodies in one scene.
- Explicit “when to leave for Rapier” criteria (ragdoll quality, continuous collision, tooling) so the revisit is not eternal.

### G3.3 · P1 · Snapshot / hydrate is powerful and fragile

**Problem.** Whole-world `ctx.snapshot()` / `hydrate()` dual-uses offline save and multiplayer baseline. That is elegant. It also means every new subsystem must remember to register as a snapshot module or silently desync.

**Evidence.** `GameContext.snapshot` docs; feature-gated modules in snapshot; `persist` offline path.

**Fix.** Feature installer **must** register snapshot/diff hooks or fail typecheck. No subsystem on `ctx` without serialize story. Golden tests: spawn → snapshot → empty → hydrate → equality for every feature flag combo used by games.

### G3.4 · P2 · Determinism is undersold and under-tested

**Problem.** Seeded RNG modules exist; tick uses game-time `dt`. No clear “lockstep / replay checksum” product story despite recording buffers and combat snapshot replay for tactics.

**Evidence.** `random/rng`, `sensor/recordingBuffer`, `multiplayer/combatSnapshot` for boards — not general world replay.

**Fix.** Either commit to **replay-grade determinism** (fixed dt, ordered events, checksum skill) or stop implying agent tests can re-sim multiplayer from logs. Pick one.

---

## Phase 4 — Rendering, shell, UI stack

### G4.1 · P0 · React + R3F is the product (own it or multi-shell it)

**Problem.** Pure TS core is a real differentiator. Shipping reality is React 19 + R3F + Tailwind v4 + `@source` rituals. Unstyled HUD is a documented class of failure. Non-React games are second-class.

**Evidence.** Agents.md unstyled UI note; shell peer deps; `HudCanvas` / mobile composition in react package; game harness always Vite+React.

**Fix.** Product page: “Browser games via React Three Fiber.” If true multi-frontend matters, extract runner first (G1.3). Do not pretend core alone is a complete game path.

### G4.2 · P1 · Shell is over-coupled to every presentation concern

**Problem.** Cameras, touch docks, settings chrome, postfx, weather, ocean, buildings, grass budgets, pointer service, command sink, world items, nameplates — one package. Editor sits on top. Failure modes (shoot hangs on heavy WebGL) take the whole stack down.

**Evidence.** `packages/shell/src` tree; Agents.md hung `shoot` policy; GamePlayerShell size.

**Fix.** Split publishable slices (even if monorepo-internal first):

- `@jgengine/shell-runtime` (host, tick, input, multiplayer wire)
- `@jgengine/shell-render` (R3F scene graph)
- `@jgengine/shell-env` (terrain/weather/water/buildings)

Games import runtime always; env/render as needed.

### G4.3 · P1 · Visual quality depends on agent eyes + flaky screenshots

**Problem.** Culture correctly says “judge by eye.” Tooling (`shoot` / `drive`) is fragile on GPU/Chromium. Fallback is `summarizeEnvironment` which proves content **exists**, not that it **looks good**. Agents will ship flat untextured worlds and call it done when screenshots hang.

**Evidence.** Agents.md shoot hang rule; verify skill ladder; papercuts on playwright rev mismatch / debugger timeout.

**Fix.**

- Stabilise browser harness (pinned browser path, retry, headless GPU policy).
- Automated **cheap** visual gates: sky/fog/lighting config present, material maps non-null for environment worlds, min prop density from summary — not a substitute for eyes, but a floor.
- Separate “content proof” from “beauty pass” in done-ledger so agents cannot conflate them.

### G4.4 · P2 · Mobile layout system is ambitious; games may not earn it

**Problem.** 0.9–0.10 invested heavily in HUD fit, orientation gates, collision composition. Flagship reference (Canyon Chase) is called out in CHANGELOG — unclear if in-repo gallery still matches current `Games/*` set naming.

**Evidence.** CHANGELOG 0.9/0.10; current `Games/*` list may not include every named reference.

**Fix.** One mobile golden game kept green in CI (`shoot --device both`). Delete or archive rhetoric about games that left the tree.

---

## Phase 5 — Multiplayer & backends

### G5.1 · P0 · One real hosted path is not a multiplayer platform

**Problem.** Adapters: ws, socket.io, p2p, lan, fly, convex, offline. Host packages: node, sql, convex examples. In practice the documented flagship is **claudecraft + express-host**. Everything else risks being adapter cosplay.

**Evidence.** `examples/HOSTED.md`; grep authority server mostly tests + claudecraft; convex package has many orphan exports.

**Fix.**

- Rank adapters: **Supported** (claudecraft path), **Experimental**, **Stub**.
- CI: two-client join test on Supported path only, every PR.
- Stop adding transports until presence *and* server-authority both have integration tests.

### G5.2 · P1 · Authority model is correct, incomplete

**Problem.** Host mirrors world; input sink routes under server authority; lag comp exists for hitscan presence history. Missing product-grade pieces: interest management, bandwidth budgets, client prediction for controller movement, reconciliation, authority cheating story, host migration.

**Evidence.** `inputSink`, `worldSync`, `lagCompensation`, world diff modules; no prediction/reconciliation modules of comparable weight.

**Fix.** Document **current multiplayer ceiling** (genre fit: cooperative voxel/RPG yes; competitive twitch no). Roadmap prediction only if a flagship needs it — do not half-build.

### G5.3 · P1 · Convex path complexity vs benefit

**Problem.** Convex adapters + example host + many exports, low in-game adoption signal, large orphan count. Second full backend multiplies maintenance.

**Evidence.** Orphan baseline convex 22; `examples/convex-host`; games mostly offline/ws.

**Fix.** Either make Convex the **recommended** hosted story with a gallery game, or mark experimental and shrink surface.

### G5.4 · P2 · Persistence story is split three ways

**Problem.** Offline `persist` / `RuntimeSave`, host `HostPersistence`, sql package, save cadence in node — good seams, easy to mis-wire.

**Evidence.** `defineGame.persist`, `save` config, `hostPersistence`, `@jgengine/sql`.

**Fix.** One skill decision tree: single-player offline → persist; authoritative host → HostPersistence; never both. Doctor CLI checks the mismatch.

---

## Phase 6 — Editor & authoring (the doctrine vs the tool)

### G6.1 · P0 · “Editor-first” doctrine outruns the editor

**Problem.** CLAUDE.md: scene placement, paths, foliage, terrain painting belong in editor documents; hardcoding geometry is the smell. Editor package is small relative to doctrine. Agents will still hardcode when RPC/CLI/GUI friction exceeds pasting arrays.

**Evidence.** `packages/editor` ~33 sources; core `editor/*` document model; AuthoredScene in shell; harvest games still dense with setup code.

**Fix.**

- Editor MVP definition of done: place marker, path, scatter, terrain sculpt, save `editor.scene.json`, runtime AuthoredScene parity — **integration-tested**.
- Skill: if editor cannot do X, file `[FEATURE]` — enforce by lint that large coordinate literals in `Games/*` fail unless tagged exception.
- Agent bridge (`editor-mcp`) must be as reliable as code edits or doctrine is fiction.

### G6.2 · P1 · Scene document is not the only source of truth yet

**Problem.** Worlds still compose `WorldFeature` descriptors in TS (`environment()`, buildings, roads) *plus* editor layers *plus* `onInit` placement. Three authoring channels.

**Evidence.** `world/features.ts` richness; game `world.ts` files; editor layers optional.

**Fix.** Convergence plan: environment descriptor *or* editor document as primary; generate one from the other; forbid triple authorship for new games.

### G6.3 · P2 · Standalone editor / desktop are product surface with monorepo complexity

**Problem.** Tauri desktop, `npx jgengine editor`, dev runner lazy-load — multiple entrypoints for one immature tool.

**Evidence.** `apps/desktop`, `packages/jgengine` CLI, editor package.

**Fix.** One blessed entry (`npx jgengine editor <dir>`). Desktop tracks it; no parallel feature matrix.

---

## Phase 7 — Assets & art pipeline

### G7.1 · P1 · Index-not-bytes is right; agent pull UX is still a cliff

**Problem.** `@jgengine/assets` ships catalogs + pull CLI, not GLBs — correct for license/size. Agents still need mirror base, public paths, dims, materials, attribution. Failures look like “pink boxes” and get ignored.

**Evidence.** assets package README; self-hosted mirror notes in CHANGELOG; Kenney ban (operational, good); Quaternius/KayKit guidance.

**Fix.** `jgengine doctor` checks: catalog resolve, sample URL HEAD, `@source`, attribution file. Create scaffold pulls a **minimal verified pack** so first boot is never empty.

### G7.2 · P2 · Generated building/water/weather credit trail is good; visual defaults are still “demo tech”

**Problem.** Credits to achrefelouafi are done right. Default environments can still read as tech demos (procedural palette ground, repeated kitbash). Culture says judge harshly — gates do not.

**Evidence.** CREDITS.md; shell environment primitives; visual quality bar in UI skill.

**Fix.** Environment preset packs: “meadow shipped”, “coast shipped”, “city block shipped” with materials + lighting + fog + prop density known-good. Agents pick a preset before inventing noise params.

---

## Phase 8 — Agent product, CLI, process

### G8.1 · P0 · Human interface is one sentence; agent interface is a bureaucracy

**Problem.** Outside monorepo: “Make a game that … with jgengine.” Inside monorepo: fan-out, ship ceremony, worktrees, MCP-only GitHub, papercuts, telegraph style, issue formats, skill routing, gate 30 minutes. That bureaucracy leaks into published skills and agent behavior.

**Evidence.** CLAUDE.md / Agents.md density; PAPERCUTS dominated by worker/ship process failures, not engine APIs.

**Fix.**

- Separate **engine contributor guide** from **game builder skills**. Builders should never see fan-out or PR merge policy.
- Published skills: only create/doctor/API/verify.
- Treat papercut volume on process as a product bug: simplify ship path until papercuts dry up.

### G8.2 · P1 · `npx jgengine create` must be the only path that works cold

**Problem.** Monorepo games use source aliases; published games use dist. Windows PATH, unbuilt packages, skills stage checks — many ways to get a red first hour.

**Evidence.** README Windows PATH note; Agents.md local bin vs published CLI; ensure-ready / frozen install papercuts.

**Fix.** Weekly cold-start CI: empty dir, `npx jgengine create`, `bun dev`, doctor green, on Linux **and** Windows. That job is more important than another domain module.

### G8.3 · P1 · Toolchain bets: bun + tsgo native preview

**Problem.** bun workspaces + `tsgo` (`@typescript/native-preview`) + playwright-core pin. Fast, modern, brittle. Contributors without the exact toolchain fail mysteriously.

**Evidence.** root `packageManager: bun@1.3.8`; tsgo in package builds; papercut chromium rev skew.

**Fix.** Document supported matrix. Pin browser bits. Consider `tsc` fallback for consumers who never open the monorepo (publish is already JS — ensure types are vanilla-stable).

### G8.4 · P2 · Game shape gate is both strength and straitjacket

**Problem.** `check-game-shape` keeps layout consistent for agents — excellent. Also rejects legitimate shared files (papercut: `preview.tsx` whitelist).

**Evidence.** PAPERCUTS check-game-shape; `scripts/check-game-shape.ts`.

**Fix.** Shape rules versioned with escape hatches that are skill-documented, not mid-ship whitelist edits.

### G8.5 · P2 · Harvest culture produces breadth, not depth

**Problem.** `harvest-game` / `harvest-full-game` intentionally poke gaps. Without orphan burn-down, harvest becomes a module factory.

**Evidence.** Many core domains with thin game usage; CLASSICS.md / probe games.

**Fix.** Harvest definition of done: **game playable + gap issue or merged primitive with adopter**. No primitive-only harvest merges.

---

## Phase 9 — Testing, verification, CI

### G9.1 · P0 · Local gate is a fortress; PR CI is a side door

**Problem.** Full `gate` is huge (preflight, types, tests, build, skill sync, capabilities, game shape). Culture says PR runs quick job; local gate proved the rest. That only works if every ship runs local gate — agents skip, main burns.

**Evidence.** package.json scripts; CLAUDE.md ship rules; lockfile papercut where local gate missed frozen install.

**Fix.**

- `ship:preflight` non-negotiable in CI for release branches (already partially there — extend frozen install).
- Split **fast PR** vs **merge queue full gate** so main cannot go red on skipped local work.
- Track flake budget for smoke/shoot separately from unit tests.

### G9.2 · P1 · Unit test density is high; system tests are sparse

**Problem.** Near 1:1 `*.test.ts` beside modules is excellent for pure functions. End-to-end: few multiplayer, few editor-roundtrip, few “boot game → command → snapshot” suites outside individual games.

**Evidence.** core test counts; HOSTED checklist is manual; shoot flaky.

**Fix.** Three mandatory system tests in CI:

1. Offline game boot + start + snapshot roundtrip (smallest game).
2. Server-authority two-client (headless).
3. Editor document → AuthoredScene summary non-empty.

### G9.3 · P1 · Browser automation is a known hang vector

**Problem.** Documented: never re-run hung shoot in foreground; GPU crash; corrupt output. That is operational scar tissue for a visual product.

**Evidence.** Agents.md; shots/* smoke logs.

**Fix.** Isolate shoot in containers with GPU policy; hard timeouts already via `guard.ts` — publish failure taxonomy (timeout vs assert vs boot). Prefer trace/event assertions over pixels for CI; pixels for human PR bodies only.

### G9.4 · P2 · Baseline files are debt ledgers that grow forever

**Problem.** api-orphan, api-doc, possibly others — ratchet only works if someone turns the crank.

**Evidence.** baseline JSON sizes.

**Fix.** Ratchet CI: baseline length must not increase; decreases encouraged. “Add to baseline” requires issue link + owner.

---

## Phase 10 — In-repo games as evidence (not gallery pride)

| Game | ~TS files | Rough signal |
| --- | ---: | --- |
| claudecraft | 93 | Flagship multiplayer + content density |
| the-robots | 50 | Large non-host probe |
| vice-isle | 46 | Select-then-act hotbar complexity (#743 class) |
| wreckway | 43 | — |
| starhome / tower-guard | 35 | Mid |
| loopline | 32 | — |
| duet-keys | 22 | Smaller |
| spire-cards | 17 | Cards / HUD-leaning |
| studio-showcase | 13 | Studio/asset showcase |

### G10.1 · P1 · Games are private probes but carry commercial IP shapes

**Problem.** README: do not copy Games/*; some recreate well-known titles for gap probing. Legal/ethical risk if agents ignore the rule; product risk if public site plays them as demos without clarity.

**Evidence.** README warning; site embeds runner games; CLASSICS.md.

**Fix.** Clear site labeling: “engine test games, not templates.” Prefer original IP for anything public-facing. Keep commercial lookalikes offline or private.

### G10.2 · P1 · Feature adoption is uneven — engine wider than gallery

**Problem.** Many `features` and domains barely show up in Games. Leaderboard/cosmetics orphans in spirit even if strings match elsewhere.

**Evidence.** Rough greps: strong quest/cards/race mention noise; weak cosmetics/leaderboard; only one clear features: block pattern usage.

**Fix.** Gallery matrix: each public feature flag must appear in ≥1 game’s `defineGame({ features })` or lose the flag. Domain modules follow G1.4 tiers.

### G10.3 · P2 · Shape compliance ≠ fun or completeness

**Problem.** Done-ledger is strong on harness completeness. A game can pass shape + summarizeEnvironment and still be a hollow loop.

**Fix.** Per-game “player verb list” test: N commands invokable, M feedback events, win/lose or extraction condition. Wire into game tests, not only skill prose.

---

## Phase 11 — Security, cheat, trust (if multiplayer is real)

### G11.1 · P1 · Client-trusted presence is default — say “not competitive-safe” louder

**Already in adapter docs.** Needs skill + site + doctor warnings when `authority !== "server"`.

### G11.2 · P1 · Command validation surface

**Problem.** Command registry is the verb boundary — good. Host must validate every command; skill says so; enforcement is game-specific.

**Fix.** Host middleware helpers: rate limit, auth session, schema validate `CommandDefinition` input, reject unknown commands. Ship in `@jgengine/ws` host, not as essay.

### G11.3 · P2 · Save / devtools endpoints

**Problem.** Dev save endpoint and editor save are powerful local tools. Must never ship enabled in production builds.

**Fix.** Doctor + create template: production build strips devtools endpoints; explicit env flags.

---

## Phase 12 — What is actually excellent (keep these)

Do not “fix” these away while cleaning house:

1. **Zero-dep core + structural adapters** (sql pool shape, transport pipe) — correct modularity.
2. **Catalog-first / three buckets / commands as verbs** — agent-aligned architecture.
3. **Opt-in `features` idea** — right direction; needs completion (G1.4).
4. **Migrate-led CHANGELOG + VERSION export** — rare and good for agents.
5. **Capability index + orphan gate concept** — world-class if baselines shrink instead of grow.
6. **Authority made explicit in types** — rare honesty in web game stacks.
7. **Whole-world snapshot seam shared by save and net** — elegant when snapshot registration is mandatory.
8. **Credits discipline + Kenney ban** — legal/ethical seriousness.
9. **Dense pure tests next to modules** — real engineering culture.
10. **guard.ts hard timeouts** — hang is a loud fail, not a silent CI stall.

The job is not to become Unity. The job is to make the **agent-first framework** true: small honest kernel, deep optional modules with adopters, one solid host path, one solid editor path, one cold-start create path.

---

## Execution roadmap (cutlist by phase)

### Phase A — Honesty sprint (1–2 weeks)

| ID | Action |
| --- | --- |
| G0.1 | Rewrite product sentence site/README/skills consistently |
| G0.2 | Licensing FAQ |
| G0.3 | Rename/default multiplayer to make presence-only explicit |
| G5.1 | Mark adapters Supported/Experimental; CI two-client on Supported |
| G8.2 | Cold-start CI create→dev→doctor |

### Phase B — Surface diet (ongoing, start now)

| ID | Action |
| --- | --- |
| G2.2 | Orphan ratchet: no net increase; burn 50 orphans |
| G1.4 | Tier every domain (kernel / feature / library) |
| G2.1 | Curated domain entrypoints generated |
| G2.4 | Shrink SKILL.md bodies; capabilities-first |
| G1.5 | Rename core defineGame |

### Phase C — Runtime hardening

| ID | Action |
| --- | --- |
| G1.1 | Split gameContext composition / plugin install |
| G3.1 | Dirty-flag replication + published stress number |
| G3.3 | Snapshot registration mandatory per feature |
| G9.2 | Three system tests in CI |

### Phase D — Authoring & shell

| ID | Action |
| --- | --- |
| G6.1 | Editor MVP integration tests + coordinate-literal lint |
| G6.2 | Single authoring source plan |
| G4.2 | Shell package split (runtime/render/env) |
| G4.3 | Shoot stability + cheap visual floor gates |

### Phase E — 1.0 contract

| ID | Action |
| --- | --- |
| G0.4 | Publish 1.0 public contract list; freeze |
| G5.2 | Document multiplayer ceiling; optional prediction only with flagship |
| G10.2 | Gallery matrix covers every public feature |
| G0.2 | Dual-license decision if commercial matters |

---

## Suggested issue titles (copy/paste)

1. `[P0] Multiplayer defaults are presence-only — rename APIs and fail intake without authority+host`
2. `[P0] Orphan baseline ratchet: forbid growth; burn down 50 exports`
3. `[P0] Cold-start CI: npx jgengine create on Linux+Windows`
4. `[P1] Split createGameContext into kernel + feature installers`
5. `[P1] Domain tiers: kernel | feature | library — map every core folder`
6. `[P1] Curated @jgengine/core/<domain> entrypoints generated from public API`
7. `[P1] World replicator dirty flags (stop JSON equality change detection)`
8. `[P1] Editor MVP round-trip test + AuthoredScene parity gate`
9. `[P1] Adapter support tiers + two-client CI for Supported only`
10. `[P1] Licensing FAQ for AGPL game vs engine derivative`
11. `[P2] Rename core defineGame → defineEngineGame`
12. `[P2] Shell split: runtime / render / env packages`
13. `[P2] Environment shipped presets (lighting+materials+density)`
14. `[P2] Snapshot module registration compile-time enforcement`

---

## Method notes (limits of this critique)

- Based on tree structure, key sources, READMEs, CHANGELOG, skills entrypoints, orphan baseline, adapter/multiplayer usage, package sizes — not a full line-by-line audit of all 671 core files.
- Did not re-run full `bun run gate` or play every game end-to-end in this pass.
- When evidence is statistical (greps in Games), treat as directional; confirm before mass-deleting modules.
- Physics ADR already records a prior critique action (`Y1`); this file is a fresh full-stack cutlist under `G*` IDs.

---

*End of critique-grok.md — update checkboxes/IDs in PRs as items close; do not let this become another unread baseline.*
