# JGengine technical critique and recovery plan

Audit date: 2026-07-16  
Scope: `packages/*`, runtime-facing apps/examples/games, CI, publishing, tests, and package contracts.  
Explicit exclusion: no pre-existing critique file was opened, searched, diffed, or used as input.

## Executive verdict

JGengine has an unusually broad, well-tested TypeScript foundation, but its marketing-level promises currently run ahead of its trust boundaries. The engine is strongest as a deterministic single-process gameplay toolkit. It is not yet safe to present its multiplayer, private-session, hosted persistence, or token-backed web surfaces as production-ready.

The most serious problems are not style complaints:

- A public web route can proxy arbitrary GitHub REST and GraphQL reads using the server's token.
- "Private" sessions can be enumerated and joined directly without their join code.
- hosted Convex defaults let callers claim another player's identity.
- shared world snapshots expose every player's inventory to every client.
- reconnect replay can execute non-idempotent commands twice.
- saves advertised as whole-world saves omit many first-class engine systems.
- current `main` builds and tests, but the canonical type gate is red because generated skill API documentation is stale.

Do not spend the next cycle adding more gameplay primitives. Freeze surface-area growth until Phases 0-2 are complete. The engine already has more breadth than its runtime, persistence, package, and security contracts can honestly support.

### Severity key

- **P0** — exploitable security/privacy failure or release blocker; fix immediately.
- **P1** — data loss, duplicated actions, broken authority, serious lifecycle leak, or false core contract.
- **P2** — scale failure, API integrity problem, or recurring product defect.
- **P3** — maintainability, efficiency, polish, or defense-in-depth.

### Repository snapshot

- 1,651 TypeScript/TSX files and 497 test files outside generated/build output.
- `core` alone has 671 TypeScript files, 328 test files, and roughly 3,144 `export` declarations.
- Major orchestrators are oversized: `GamePlayerShell.tsx` is about 2,250 lines; `gameContext.ts` exceeds 1,700; `DevtoolsOverlay.tsx`, `EditorChrome.tsx`, and several runtime/world files exceed 1,000.
- `bun run build`: passes.
- `bun run test`: passes.
- `bun run test:games`: 335 pass, 0 fail.
- `bun run check-types`: fails because `.claude/skills/jgengine-ui/api.md` is stale.

---

## Phase 0 — emergency containment

Exit criterion: all four exploit/privacy paths have regression tests, deployed defaults are closed, secrets are no longer exposed through generic proxies, and private player/session state is projected per viewer.

### [ ] 0.1 P0 — remove the public token-backed GitHub general proxy

Evidence:

- `packages/github/src/server.ts:178-202` accepts an arbitrary REST path and arbitrary GraphQL POST body.
- `packages/github/src/server.ts:9-13` adds `Access-Control-Allow-Origin: *` and `Cache-Control: public` to responses.
- `apps/web/src/routes/api/github-proxy.ts:5-13` mounts the general handler with `GITHUB_TOKEN`, with no authentication and no `allowPath`.

Impact: any browser can use the server as a confused deputy to read whatever the token can read, potentially including private repositories, organization data, viewer identity, and other token-scoped GraphQL fields. Token-derived responses are also marked publicly cacheable. Calling the proxy "read-only" does not make disclosure safe.

Required change:

- Delete or disable `/api/github-proxy` immediately.
- Replace it with named, server-owned operations returning purpose-built response schemas.
- Require application authentication and authorization, strict field/path allowlists, request/rate limits, same-origin policy, and `Cache-Control: private, no-store` for token-derived data.
- Add server tests that attempt private REST paths, arbitrary GraphQL, cross-origin access, large bodies, aliases/fragments, and cache leakage.

### [ ] 0.2 P0 — make private sessions actually private

Evidence:

- `packages/ws/src/readsHandler.ts:64-69` returns open/running session listings without filtering visibility; `readsHandler.test.ts:213-229` currently blesses private IDs appearing in results.
- `packages/ws/src/host.ts:280-318` accepts a direct `serverId` and checks existence, game, and capacity, but not visibility or join code.
- `packages/convex/src/server.ts:838-869` lists every running server without privacy filtering.
- `packages/convex/src/server.ts:526-531` rejects private sessions only when `args.serverId === undefined`; supplying an enumerated ID bypasses the check.

Impact: a join code is theater. An attacker lists or guesses a private server ID, supplies it directly, and joins.

Required change:

- Never include private server IDs in unauthenticated/public listings.
- Treat a direct ID as lookup, not authorization. Require membership, a verified invite capability, or a join code for every private join path.
- Store join codes as hashed, rate-limited credentials; do not return them in ordinary listings.
- Apply identical rules in Node/ws, HTTP reads, Convex, loopback, and future transports.
- Add direct-ID attack tests for every backend.

### [ ] 0.3 P0 — stop trusting caller-supplied Convex identities

Evidence:

- `packages/convex/src/hostedServer.ts:178-184` defaults hosted servers to `auth: "anonymous"`.
- `packages/convex/src/server.ts:175-194` accepts any non-empty claimed `externalId` when anonymous.
- shipped examples explicitly enable this mode (`examples/convex-host/convex/runtime.ts:15`, `examples/convex-host/convex/hosted.ts:40-43`).

Impact: callers can impersonate another player, send their inputs, invoke their commands, alter their state, or leave their session.

Required change:

- Default to required Convex identity.
- Remove raw external identity claims from public functions.
- If guest play is required, mint short-lived signed guest identities server-side and bind them to a session/device.
- Make the insecure mode unmistakably development-only and impossible to deploy accidentally.
- Add cross-user impersonation tests against actual exported Convex handlers, not only helper functions.

### [ ] 0.4 P0 — separate shared world state from per-player private state

Evidence:

- `packages/core/src/runtime/gameContext.ts:1463-1471` serializes every entry in `inventoryByUser` into the shared world snapshot.
- `packages/core/src/runtime/worldChannel.ts:83-87` broadcasts one identical session state to all connections.
- the production world host similarly exposes one full `serverState` snapshot through `packages/ws/src/worldHost.ts:93-103`.

Impact: opponents can inspect hidden card hands, inventories, loadouts, quest items, or future private state. This makes competitive and hidden-information games impossible to secure.

Required change:

- Define explicit replication scopes: public world, team/party, owner-only player, and server-only.
- Build snapshots/diffs from a viewer projection rather than from one global object.
- Make new feature modules declare their replication scope; reject unspecified state in development.
- Add two-client privacy tests proving that one player never receives the other's private fields.

### [ ] 0.5 P1 — temporarily narrow production claims

Until 0.1-0.4 and Phase 1 land, documentation and examples should label hosted multiplayer/private sessions as experimental. This is not cosmetic humility: the current defaults invite users to deploy unsafe configurations.

---

## Phase 1 — networking authority, ordering, and ingress safety

Exit criterion: state-changing operations are authenticated, membership-gated, bounded, ordered/idempotent as appropriate, reconnect-safe, and covered by adversarial transport tests.

### [ ] 1.1 P1 — prevent duplicate commands after reconnect

Evidence:

- `packages/ws/src/createWsBackend.ts:169-182` renumbers and replays pending RPCs.
- `createWsBackend.ts:315-323` preserves state-changing RPCs after a connection closes.
- the protocol has no stable operation ID and the host has no deduplication ledger.

Impact: if the server applies a purchase, attack, reward, chat/feed append, or other mutation but the reply is lost, reconnect can apply it again.

Required change:

- Give mutations stable client operation IDs that survive reconnect.
- Deduplicate on the authoritative host with bounded retention.
- Replay reads automatically; replay mutations only under explicit idempotent semantics.
- Add lost-reply-after-commit tests for every mutation class.

### [ ] 1.2 P1 — restore membership correctly on reconnect

Evidence:

- host-router close removes joined memberships (`packages/ws/src/hostRouter.ts:554-560,590-597`).
- reconnect resubscribes and replays pending RPCs (`packages/ws/src/createWsBackend.ts:285-323`) but does not track and rejoin previously joined servers.

Impact: after a transient network loss, subscriptions and commands can be replayed against a server that no longer considers the user a member. Recovery is partial and order-dependent.

Required change: introduce an explicit session-resume handshake carrying authenticated session/server membership and last accepted revision. Rejoin/resume must complete before resubscription or mutation replay.

### [ ] 1.3 P1 — add sequencing and coalescing to remote input

Evidence:

- `packages/shell/src/inputSink.ts:19-25` fires an independent `runCommand` promise for each changed frame and swallows failures.
- pointer/input state can change each rendered frame (`packages/shell/src/GamePlayerShell.tsx:1136-1155`).

Impact: a delayed "held" frame can arrive after "released," causing stuck or reverted authoritative input. There is no cancellation, backpressure, resync, or visibility into failure.

Required change: use a monotonic input sequence/tick, latest-state coalescing, one bounded in-flight pipeline or an ordered unreliable channel, and an explicit neutral frame on blur/disconnect.

### [ ] 1.4 P1 — runtime-validate command payloads before typed handlers see them

Evidence:

- `packages/core/src/commands/commandRegistry.ts:15-19,38-46` presents `TInput` to validators/handlers after casting arbitrary network `unknown`.
- `packages/core/src/runtime/worldChannel.ts:13-18` accepts arbitrary command input.
- `packages/core/src/runtime/hostedGameRunner.ts:104-105` runs commands without independently verifying membership.

Impact: TypeScript types provide a false boundary. Malformed remote data can reach handlers that reasonably assume their declared input shape. Unjoined identities can invoke command paths in lower-level transports.

Required change: command definitions need parsers/codecs that transform `unknown` into validated/branded input. Membership and authorization checks belong at the authoritative dispatch boundary, not only in one router adapter.

### [ ] 1.5 P1 — make join/leave/close idempotent and multi-connection aware

Evidence:

- `hostedGameRunner.ts:78-83` fires `onNewPlayer` every time `join` is called for an existing ID.
- `worldChannel.ts:75-77` closes a connection without leaving the session.
- membership is keyed only by user ID, so one of two tabs can remove the shared player.

Impact: duplicate grants/spawns, ghost players, and premature despawn.

Required change: model connection IDs separately from user membership, reference-count active connections, make join/resume distinct operations, and call player lifecycle hooks exactly once per membership transition.

### [ ] 1.6 P1 — bound every network ingress and queue

Evidence:

- `packages/node/src/wsServer.ts:22-40` sets no conservative `maxPayload`, origin policy, connection cap, heartbeat, or slow-consumer policy.
- `packages/ws/src/protocol.ts:36-50` leaves command input, feed entries, appearance maps, tags, IDs, and metadata unbounded.
- `packages/ws/src/hostRouter.ts:574-588` chains messages into an unlimited promise queue.
- `packages/node/src/webHandler.ts:15-24,31-35` buffers full requests and responses.

Required change:

- Set byte/count/depth limits for every wire shape and reject before allocation-heavy work.
- Add per-IP, connection, user, command, and session-creation budgets.
- Bound queues; disconnect abusive/slow peers; monitor `bufferedAmount`; add heartbeat/idle expiry and origin policy.
- Preserve response streaming in the Node adapter.

### [ ] 1.7 P1 — partition the global host mutation queue

Evidence: `packages/ws/src/host.ts:138` serializes joins, leaves, commands, feeds, ticks, and flushes through one promise queue; `host.ts:216` ticks/persists every live server inline.

Impact: one slow database operation or pathological world stalls every unrelated game and player in the process.

Required change: isolate mutation ordering per server/world, with a separate narrow queue for global matchmaking/index operations. Add fairness and maximum-tick-duration metrics.

### [ ] 1.8 P1 — add revision epochs, base revisions, acknowledgements, and resync

Evidence: `packages/core/src/runtime/worldMirror.ts:31-34` blindly applies any diff and assigns its revision. There is no expected base revision, session epoch, acknowledgement, or full-resync path.

Impact: stale, duplicate, skipped, future, or out-of-order frames can regress the mirror or apply a delta to the wrong baseline.

Required change: every diff declares epoch and base/next revision; the client accepts exactly the expected transition, ignores duplicates, and requests a baseline on gaps.

### [ ] 1.9 P1 — represent module deletion in world diffs

Evidence:

- `packages/core/src/runtime/worldReplication.ts:95-99` passes a fresh throwaway removal map for modules.
- `WorldDiff` has removed lists for entities/stats/store but no `removedModules` (`worldReplication.ts:11-21`).
- `applyWorldDiff` only overwrites module keys and never deletes them (`worldReplication.ts:220`).

Impact: when a module disappears from the authoritative snapshot, clients retain stale state forever.

Required change: add module tombstones and inverse tests for add/change/remove across both stateful and stateless diff paths.

### [ ] 1.10 P2 — reject unknown games instead of creating fallback namespaces

Evidence: `packages/ws/src/host.ts:124` and `packages/convex/src/server.ts:221` silently create fallback runtimes for unknown game IDs.

Impact: callers can create arbitrary persistent namespaces/sessions, consuming resources and bypassing intended game registration.

### [ ] 1.11 P2 — separate public errors from operational diagnostics

Evidence: router and HTTP adapters return raw thrown messages (`hostRouter.ts:548-549`, `webHandler.ts:36-39`), while queued failures are swallowed (`hostRouter.ts:575-588`).

Required change: stable public error codes/messages; structured internal logs, traces, and counters with sensitive detail retained only server-side.

---

## Phase 2 — truthful saves, persistence, and hosted state

Exit criterion: every first-class feature is explicitly persistent, replicated, or transient; snapshots are immutable owned values; persistence is concurrency-safe; backend designs have realistic scale limits and recovery tests.

### [ ] 2.1 P1 — make the "whole-world save" claim true

Evidence:

- time exists (`gameContext.ts:510-516`) but is absent from `snapshotModules`/`saveModules` (`gameContext.ts:1449-1548`).
- player stats, cosmetics, card piles, turn loops, races, motion queues, pose/possession/form state, paint, colliders, and other first-class state are also absent.
- turn loops expose `restore`, but the runtime does not register it (`packages/core/src/turn/turnLoop.ts:43-63`).

Impact: save/load silently resets or partially corrupts games built from advertised primitives.

Required change: each feature descriptor must declare save, replication, migration, and reset behavior. Add a completeness test that mutates every enabled feature, saves, recreates the runtime, hydrates, and deep-compares intentional state.

### [ ] 2.2 P1 — fix autosave clocks

Evidence: `packages/core/src/runtime/hostedWorldSession.ts:43-52,93-94,106-113` uses `0` whenever `now` is omitted. A positive `saveIntervalMs` can therefore never elapse.

Required change: default once to `Date.now`, or make a clock mandatory. Test real default time and fake deterministic time.

### [ ] 2.3 P1 — make snapshot boundaries immutable and owned

Evidence:

- `memoryWorldStore` stores and returns snapshot object references directly (`hostedWorldSession.ts:28-34`).
- entity snapshots expose live entity objects (`packages/core/src/scene/entityStore.ts:287-310`) that later update in place (`entityStore.ts:237-284`).

Impact: a supposedly saved record can change without a save, bypassing cadence, revisions, persistence events, and tests.

Required change: structured-clone/freeze at persistence and replication boundaries, or use immutable structural sharing with ownership documented and enforced.

### [ ] 2.4 P1 — make baseline hydration replace, not overlay, inventory state

Evidence: `gameContext.ts:1473-1477` hydrates only inventories present in the incoming snapshot; absent users/inventories survive locally.

Impact: ghost private state remains after authoritative correction, logout, schema changes, or slot removal.

### [ ] 2.5 P1 — make SQL feed append atomic

Evidence: `packages/sql/src/sqlPersistence.ts:284-301` performs `SELECT`, appends in application memory, and upserts without a row lock or atomic JSONB update. `sqlPersistence.test.ts:73` only appends sequentially.

Impact: concurrent writers read the same list and the last commit drops other entries.

Required change: use `SELECT ... FOR UPDATE` or a single atomic expression, then test contention against real PostgreSQL, not only `pg-mem`.

### [ ] 2.6 P1 — redesign Convex work around touched partitions

Evidence:

- commands hydrate all member profiles and all chunks (`packages/convex/src/server.ts:257+`).
- scheduled ticks collect every server (`server.ts:871-880`) and hosted worlds (`hostedServer.ts:413+`).
- hosted snapshots are repeatedly whole-object JSON compared (`hostedServer.ts:63+`).

Impact: transaction read/write/size/time ceilings arrive far before the engine's stated scale target.

Required change: indexed due-work batches, per-world scheduling, touched-chunk/profile reads, bounded write sets, and load tests against deployed Convex limits.

### [ ] 2.7 P2 — harden file persistence and state its deployment limits

Evidence:

- `packages/node/src/persistence.ts:100-139` uses `encodeURIComponent(serverId)` as a directory component; `encodeURIComponent("..")` remains `".."`.
- locks are in-process only; feed lock entries are never removed (`persistence.ts:146-156`).
- there is no fsync policy, recovery/backup, corruption quarantine, or stale-temp cleanup.

Required change: use a one-way safe filename encoding (for example base64url/hash), remove completed locks, add recovery tests, and explicitly call this adapter single-process development persistence unless/until cross-process durability exists.

### [ ] 2.8 P2 — stop conflating `undefined`, missing, and `null`

Evidence: `worldReplication.ts:85-93,176-190` serializes `value ?? null` even though stores accept `unknown`.

Required change: either enforce a versioned JSON-value schema at writes or encode presence explicitly. Reject functions, symbols, cycles, bigint, NaN, and infinity with path-specific diagnostics.

### [ ] 2.9 P2 — compact replication tombstones

Evidence: removed entity/stat/store IDs stay in maps indefinitely (`worldReplication.ts:41-45,63-68,139-144`).

Impact: high-churn worlds leak memory proportional to every unique removed ID.

Required change: client acknowledgement floors, bounded history, baseline fallback for laggards, and metrics for retained revisions/tombstones.

### [ ] 2.10 P3 — replace ad hoc schema creation with migrations

Evidence: `packages/sql/src/sqlPersistence.ts:26-73` runs `CREATE TABLE/INDEX IF NOT EXISTS` statements but has no schema version or migration history.

Required change: versioned forward migrations, compatibility tests from prior published versions, and explicit rollback/recovery policy.

---

## Phase 3 — lifecycle, renderer, audio, and editor correctness

Exit criterion: every owned runtime/browser/GPU/audio resource has deterministic teardown; imported documents are validated; editor automation reports truthfully; lifecycle tests pass under StrictMode and repeated mode/game switching.

### [ ] 3.1 P1 — make audio loop handles actually stop audio

Evidence:

- `packages/shell/src/audio/audioEngine.ts:133-146` creates a source inside an async callback but retains no source/disconnect handle.
- `AudioEmitterHandle.stop()` only flips a boolean (`audioEngine.ts:148-158`).
- `AudioComponents.tsx:24-31,61-66` calls `stop()` believing the loop was torn down.

Impact: removed looping emitters can remain audible and graph-retained until the whole `AudioContext` closes.

Required change: retain source/gain ownership; stop and disconnect idempotently before or after load; remove ended sources; test repeated mount/unmount.

### [ ] 3.2 P1 — update spatial attenuation when the listener moves

Evidence: emitter gain updates on creation/`setPosition`, while `setListenerPose` only replaces a struct (`audioEngine.ts:142,149-164`).

Impact: walking away from a stationary sound does not attenuate it.

Required change: use `PannerNode` or update active emitters when the listener moves, with smoothing and distance-model tests.

### [ ] 3.3 P1 — dispose painted canvas textures

Evidence:

- each painted entity creates a 512x512 `CanvasTexture` (`packages/shell/src/render/modelRender.ts:84-98`, `GamePlayerShell.tsx:644-650`).
- scene change nulls the ref (`GamePlayerShell.tsx:588-598`), while unmount disposes only materials (`GamePlayerShell.tsx:441-446`).

Impact: repeated entity/model replacement leaks GPU textures. Material disposal does not dispose attached textures.

### [ ] 3.4 P1 — add a game/runtime disposal contract

Evidence:

- `GameLoop` has initialization/join/tick/leave but no `onDispose` (`packages/core/src/game/defineGame.ts:54-62`).
- shell context cleanup only clears React state (`GamePlayerShell.tsx:1637-1656`).
- editor mode changes recreate playables/contexts (`packages/editor/src/EditorApp.tsx:319-418`).

Impact: game-created timers, subscriptions, workers, sockets, and resources have no supported teardown seam.

Required change: lifecycle scope/disposer registry called exactly once; every subsystem implements `dispose`; StrictMode and edit/walk/play churn tests assert zero leaked listeners/timers/resources.

### [ ] 3.5 P1 — validate and migrate editor documents at one boundary

Evidence:

- `packages/core/src/editor/document.ts:309-317` parses JSON and checks only that it is an object.
- `normalizeEditorLayers` shallow-copies assumed arrays and stamps version 1 (`document.ts:80-92`).
- downstream code immediately dereferences positions and collections (`document.ts:374-385`).

Impact: valid JSON such as `{"markers":[{}]}` is accepted, then crashes far from import. Versions, finite coordinates, duplicate IDs, parent graphs, terrain lengths, and reference validity are not enforced.

Required change: authoritative decoder/migrator returning path-specific diagnostics; reject malformed/unknown versions before state installation; fuzz it.

### [ ] 3.6 P1 — enforce global editor object ID uniqueness

Evidence:

- add commands deduplicate only within their own collections (`packages/core/src/editor/commands.ts:336-373`).
- import/merge concatenates without global collision handling (`document.ts:98-109`).
- selection, parenting, collections, and removal treat IDs as document-global.

Impact: a marker and volume may share an ID, making transforms/removal/parenting ambiguous and capable of affecting multiple objects.

### [ ] 3.7 P2 — make editor RPC mutations report applied/rejected/no-op

Evidence: `packages/editor/src/session.ts:378-393` returns `{ok:true}` after `set_transform` even when the core rejected a locked/cyclic change; `session.test.ts:246-249` codifies this misleading success.

Impact: an agent can believe an edit landed, save, and ship unchanged content.

### [ ] 3.8 P2 — release pointer lock on rig teardown

Evidence: `GameFirstPersonCamera.tsx:65-80` and `cameraRigs.tsx:417-446` remove listeners but never exit pointer lock if they own it.

Impact: switching camera/editor modes can leave the cursor captured after its movement handler is gone.

### [ ] 3.9 P2 — fix stale/racy editor readiness markers

Evidence: `EditorApp.tsx:299-311` schedules nested animation frames, cancels only the outer frame, and does not clear `data-jg-frame-ready` on cleanup.

Impact: an inner callback may mark an unmounted page ready; later screenshots can observe stale readiness.

### [ ] 3.10 P2 — own standalone-editor object URLs and asset IDs

Evidence: `StandaloneEditor.tsx:130-138` creates model object URLs and never revokes them; `assetId` can map different/same-named files to identical IDs (`StandaloneEditor.tsx:72-75`).

Required change: revoke on replacement/unmount, validate models, resolve collisions deterministically, and display import errors.

### [ ] 3.11 P2 — fix same-theme music option updates

Evidence: `packages/shell/src/audio/musicDirector.ts:97-112` returns early when the theme ID is unchanged, before considering transpose/options.

Impact: re-entering the same theme in a new musical key silently ignores the requested transpose.

### [ ] 3.12 P2 — bound and authenticate the editor HTTP bridge

Evidence: `packages/editor/src/mcp/bridgeServer.node.ts:6-20,26-62` buffers unbounded bodies and supports configurable binding without byte/time limits, content-type enforcement, or authentication.

Required change: loopback-only default, explicit unsafe override, hard limits/timeouts, request token, and overflow tests.

---

## Phase 4 — performance and scale that match the stated bar

Exit criterion: measured budgets exist for 10k entities and realistic client counts; unchanged ticks are not O(total world); hot paths avoid allocation/rebuild storms; overload behavior is explicit.

### [ ] 4.1 P1 — replace full-world JSON diff discovery

Evidence: `packages/core/src/runtime/worldReplication.ts:73-98` rebuilds maps and `JSON.stringify`s every entity/stat/store/module on every commit; `diff()` reparses changed JSON per client (`104-130`).

Impact: unchanged ticks remain O(total world), then each client pays additional parse/allocation costs.

Required change: mutation journals/generations from stores, typed encoders, bounded retained revisions, and per-client cursor reads. Benchmark allocations, serialized bytes, and tick latency at 10k/100k entities.

### [ ] 4.2 P1 — add area-of-interest replication

Evidence: visibility exists, but replication snapshots the entire entity set and publishes it to every client (`worldReplication.ts:77-93`; `worldHost.ts:93-103`).

Impact: cost grows with total world size times client count rather than relevant nearby state.

Required change: viewer-aware AOI/spatial subscriptions with hysteresis, priority tiers, bandwidth budgets, and baseline/delta behavior at AOI boundaries.

### [ ] 4.3 P2 — stop scanning/allocating every audio emitter every frame

Evidence: `packages/shell/src/audio/AudioComponents.tsx:33-99` allocates a `Set`, lists/maps entities, and scans handles each frame.

Required change: event-driven emitter registry, dirty pose updates, listener-near spatial candidates, and scratch-buffer reuse.

### [ ] 4.4 P2 — do not enable `preserveDrawingBuffer` for all gameplay

Evidence: `GamePlayerShell.tsx:2165-2184` permanently configures the game canvas with `preserveDrawingBuffer: true` for screenshot convenience.

Impact: extra framebuffer retention and lost browser/GPU optimizations, especially harmful on mobile.

Required change: capture-only readback path or an explicit short-lived capture mode; benchmark GPU memory and frame time.

### [ ] 4.5 P2 — stabilize authored-path geometry inputs

Evidence: `AuthoredScene.tsx:146-159` creates fresh point arrays every render; `DrapedPath` memoizes by array identity (`105-119`), so unrelated parent renders rebuild/dispose every road geometry.

Required change: stable document revision/key inputs and an early return before building invalid short paths.

### [ ] 4.6 P3 — resize post-processing instead of rebuilding it

Evidence: `PostProcessing.tsx:34-89` constructs render target/composer/passes in a memo keyed by width/height; resize recreates the graph and only later disposes the old one (`102-107`).

### [ ] 4.7 P2 — accelerate editor picking

Evidence: `SelectionGizmo.tsx:195-215` projects every marker/volume/note/path point and sorts candidates; fallback raycasts the entire scene recursively (`236-268`).

Required change: dedicated pick layer/ID buffer or spatial index, nearest-k without full sorting, and 10k/100k authored-object budgets.

### [ ] 4.8 P2 — validate/clamp world ticks and isolate failures

Evidence: `packages/node/src/worldServer.ts:42,75-82` accepts arbitrary `tickHz`, passes unbounded elapsed `dt`, and uses an interval with no per-world exception isolation; `packages/ws/src/worldHost.ts:51-56` lets one world exception abort the loop.

Required change: finite positive tick validation, max-dt policy/fixed-step accumulator, per-world time/error budgets, and observability for dropped/catch-up ticks.

### [ ] 4.9 P2 — evict or suspend empty worlds

Evidence: `packages/ws/src/worldHost.ts:33-48,70-75` keeps live sessions after the last member leaves; `tickAll` continues ticking every retained world (`51-56`).

Impact: CPU and memory grow with every world ever opened during process lifetime.

### [ ] 4.10 P2 — bound asset download/decompression

Evidence:

- hash verification is optional and actual catalogs do not pin hashes (`packages/assets/src/download.ts:97+`).
- downloads are fully buffered; `unzipSync` expands archives without compressed/uncompressed count/size limits (`download.ts:60+,182-190,250-253`).

Impact: provider/mirror compromise can replace assets; malformed or huge archives can exhaust memory.

Required change: immutable source revisions, mandatory SHA-256, streamed byte limits, bounded extraction, file-count/ratio limits, and temp-file cleanup.

### [ ] 4.11 P2 — validate all numeric public inputs as finite

Evidence: `packages/core/src/time/simClock.ts:104-110,168-172,248-252` accepts `Infinity`/`NaN` cases that can make time infinite or create immortal timers; the 10,000-fire cap silently drops catch-up work (`147-165`).

Required change: shared finite-number codecs and an explicit overload/catch-up policy.

---

## Phase 5 — architecture, API boundaries, and package integrity

Exit criterion: new features register through typed descriptors rather than central switchboards; public exports are intentional; packages install from tarballs in clean consumers; release/version metadata is generated from one source of truth.

### [ ] 5.1 P2 — break up the central runtime feature switchboard

Evidence: `gameContext.ts` exceeds 1,700 lines, has roughly 59 imports, and manually constructs/exposes/snapshots/hydrates each feature. `GameFeatures` is a closed boolean interface (`packages/core/src/game/defineGame.ts:64-97`).

Impact: every feature requires edits to the central runtime—the exact seam failure the repository's own principles prohibit. It also caused the save/replication omissions in Phase 2.

Required change: typed feature descriptors/plugins that own creation, context contribution, snapshot/save/replication scope, migration, reset, and disposal. The context composes descriptors; it does not know every feature.

### [ ] 5.2 P2 — remove `GameLoop<any>` and unchecked top-level types

Evidence: `defineGame.ts:150-151` uses `ui?: unknown` and `GameLoop<any>`, bypassing the "strict/no any" standard at the most important composition boundary.

Required change: infer hook/context types from the definition builder or parameterize `GameDefinition` over its feature/context composition.

### [ ] 5.3 P2 — stop exposing mutable internal references

Evidence:

- `ObservableKeyedStore.mapSnapshot()` returns its real map (`store/observableKeyedStore.ts:71-73`).
- entity `get/list/snapshot` expose live objects (`scene/entityStore.ts:287-310`).
- `InputSnapshot` retains/returns caller arrays (`runtime/inputSnapshot.ts:42-52`).
- connected-player getters expose mutable player records (`game/connectedPlayers.ts:39-47`).

Impact: callers can bypass signals, indexes, revision tracking, validation, and save semantics.

### [ ] 5.4 P2 — make typed store keys collision-safe and versioned

Evidence: `defineStore.ts:35-56` and `defineKeyedStore.ts:40-68` provide compile-time casts but no runtime key registry/schema. Two modules can claim the same key with incompatible types; hydration accepts arbitrary wire values.

Required change: namespaced descriptors, duplicate detection, codec, version, and migration ownership.

### [ ] 5.5 P2 — replace wildcard package exports with an intentional manifest

Evidence: packages publish `dist` and broadly expose `"./*"`; `@internal` annotations do not enforce a boundary. Test infrastructure such as `@jgengine/node/testFixtures` is generated/importable.

Impact: internal file layout becomes accidental semver API, tree-shaking/public-doc gates cannot define support honestly, and consumers can couple to implementation modules.

Required change: explicit supported subpath exports generated from a reviewed manifest; exclude fixtures/internal modules from tarballs; add API-extractor-style diff review.

### [ ] 5.6 P2 — scope scene-kind registries per host/game

Evidence: `AuthoredScene.tsx:17-20` registers at module load; `sceneKindRenderers.tsx:20-29` uses global mutable last-wins state with no unregister or collision diagnostic.

Impact: HMR, tests, plugins, and multiple games share load-order-dependent state.

### [ ] 5.7 P1 — decouple CLI and SDK version lines

Evidence:

- the `jgengine` CLI is 0.8.5 (`packages/jgengine/package.json:3`).
- SDK packages are 0.10.0.
- `packages/jgengine/src/create.ts:10` passes the CLI version as the engine dependency version; templates emit SDK packages at that version (`templates.ts:127+`).

Impact: scaffolding can create stale or unresolvable projects whenever CLI and SDK releases differ.

Required change: generate SDK versions from workspace/package metadata or a dedicated compatibility catalog; test the real `runCreate` output against current manifests.

### [ ] 5.8 P1 — publish every intended package

Evidence:

- `.github/workflows/publish.yml:39,51` omits `@jgengine/editor` and `@jgengine/github` from changelog staging and publishing.
- source changes in those packages still trigger the workflow.
- `packages/jgengine/src/packaging.test.ts:40` hardcodes the incomplete list.

Impact: lockstep packages drift or never publish; the repository says `packages/*` are published while automation disagrees.

Required change: generate publish order from workspace dependency metadata, explicitly classify private/unpublished packages, and verify every public package with `npm pack`.

### [ ] 5.9 P2 — add clean installed-consumer tests

Current games/examples resolve `@jgengine/*` to workspace source paths, so they do not prove that tarball exports, declaration files, rewritten extensions, peer dependencies, bins, or package files work after publication.

Required change: pack every package, install tarballs into empty ESM/CJS/bundler consumers, compile documented imports, run CLI bins, and boot a minimal browser/server app.

### [ ] 5.10 P2 — address god components rather than merely accepting them

Targets: `GamePlayerShell.tsx` (~2,250 lines), `DevtoolsOverlay.tsx` (~1,225), `EditorChrome.tsx` (~1,205), `GameContext` (>1,700), and several 800-1,100-line world/editor modules.

Required change: split by ownership/lifecycle boundaries, not arbitrary file length. State machines/services should own session, input, canvas, audio, devtools, editor commands, and resource teardown behind narrow APIs. Preserve dense data catalogs where density is intentional.

### [ ] 5.11 P3 — remove duplicated compiler policy

There is no root TypeScript base config; nearly every workspace repeats target/module/strict/path policy, and stricter flags vary. Introduce layered base configs for pure core, browser/React, Node, and apps. Do not let path aliases become the only reason source imports work.

### [ ] 5.12 P3 — escape generated template values by context

Evidence: display names are accepted broadly (`packages/jgengine/src/templates.ts:29`) and interpolated into HTML and TypeScript (`templates.ts:84+`).

Required change: separate HTML text escaping, JS/TS string literal encoding, JSON encoding, and path/ID validation.

---

## Phase 6 — CI, tests, adoption, and operational proof

Exit criterion: PRs cannot merge without compilation/tests/package smoke; current main is green; highest-risk paths run against real backends and adversarial transports; performance and lifecycle budgets are enforced.

### [ ] 6.1 P1 — make pull-request CI compile and test code

Evidence: `.github/workflows/ci.yml:13-29` runs only artifact/skill checks for pull requests. Build, types, tests, web build, and smoke are restricted to pushes on `main` (`ci.yml:31+`). Publish starts independently on that same main push.

Impact: a PR can receive a green required check without compiling or running tests; publish can race/follow broken main.

Required change: run the real quick compile/test/package gate on PRs, retain heavier smoke as needed, and make publish depend on successful CI for the exact SHA.

### [ ] 6.2 P1 — restore a green canonical type gate

Observed on this audit: `bun run check-types` fails because `.claude/skills/jgengine-ui/api.md` is stale and asks for `bun run gen:skill-api`.

Required change: regenerate/commit the artifact, then make the generation check part of the same pre-merge job that validates code. A clean `main` should never have a knowingly red canonical gate.

### [ ] 6.3 P2 — type-check tests

Most package `tsconfig.json` files exclude `src/**/*.test.ts`; Bun executes tests without providing full TypeScript semantic checking. Create test tsconfigs or include tests in a dedicated typecheck job so fixtures and assertions cannot rot behind transpilation.

### [ ] 6.4 P2 — enable stronger state-oriented compiler checks deliberately

The repo uses `strict` but broadly omits `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`, while relying heavily on record/index access and patch/delta semantics. Adopt them in phases, starting with new code and wire/persistence/editor schemas.

### [ ] 6.5 P1 — test the actual exploit and failure modes

Mandatory suites:

- arbitrary GitHub REST/GraphQL proxy attempts and cache/CORS behavior;
- private lobby enumeration/direct-ID join attacks;
- Convex identity impersonation;
- private per-player snapshot leakage;
- dropped replies after committed mutations;
- reconnect resume and duplicate/out-of-order frames;
- malformed/oversized payloads, slow consumers, queue exhaustion, and rate limits;
- concurrent SQL feed/leaderboard updates;
- corrupt/truncated file persistence and recovery;
- malformed/fuzzed editor documents and ID collisions.

### [ ] 6.6 P2 — add lifecycle/resource test harnesses

- fake `AudioContext` source/gain ownership and stop tests;
- Three texture/material/geometry disposal spies;
- React StrictMode mount/unmount and editor-mode churn;
- pointer-lock acquisition/cleanup;
- object URL creation/revocation;
- RAF/timer/listener leak accounting.

### [ ] 6.7 P2 — add real backend integration tests

Current risk is inversely correlated with realism:

- Convex tests emphasize pure helpers rather than deployed handlers, schema/auth, scheduler, and transaction limits.
- SQL uses `pg-mem`, which does not prove real PostgreSQL contention behavior.
- ws tests are strong in-process protocol tests but omit slow consumers, payload caps, reconnect-after-commit, and multi-process persistence.

Build one real game path end-to-end: browser -> ws/Convex -> authenticated authoritative command -> persistence -> reconnect -> process restart -> restored state.

### [ ] 6.8 P2 — make game smoke prove gameplay, not only a clean frame

`scripts/smoke-games.ts:16` boots only a subset and checks rendering. Add representative controls, command/state progression, save/reload, menu transitions, multiplayer join/resume, and backend round trips.

### [ ] 6.9 P2 — turn engine warnings into enforceable contracts

`bun run test:games` passed while warning that Claudecraft's rain/snow volumes are vastly oversized and that `area.position` is ignored. The offending configuration is `Games/claudecraft/src/world.ts:64-82`, and its test explicitly asserts the misleading position (`claudecraft.world.test.ts:29-36`).

Impact: the suite is green while a flagship game demonstrates incorrect engine usage.

Required change: decide whether the API should honor world placement or be explicitly camera-local. Make impossible/misleading configuration a validation failure, then fix the game and test visible behavior rather than merely object shape.

### [ ] 6.10 P2 — create enforceable performance budgets

At minimum:

- 10k/100k entity unchanged and dirty tick latency/allocation;
- 100-client replication bytes and CPU by AOI density;
- high-churn tombstone retention;
- audio emitter updates;
- 10k/100k editor picking;
- post-processing resize/GPU allocation;
- Convex/Postgres transaction contention and limits.

### [ ] 6.11 P2 — prove public API adoption before expanding it

The orphan baseline contains large unadopted adapter surfaces, and no shipped game exercises Node/SQL/Convex as a production backend. Stop treating type shape plus unit tests as proof of engine quality. Every public capability should have a real adopter, an installed-consumer example, or remain internal/experimental.

### [ ] 6.12 P3 — tighten supply-chain automation

- pin GitHub Actions to commit SHAs rather than movable major tags;
- pin asset source revisions and hashes;
- generate package publish order/allowlist rather than hardcoding it;
- make releases atomic enough to avoid partially published lockstep versions, or publish an explicit compatibility matrix.

---

## What is already good and should survive the rewrite

- `@jgengine/core` genuinely keeps a zero-runtime-dependency, renderer-neutral direction. The one-way package layering is one of the repository's strongest decisions.
- Test breadth is excellent for pure gameplay primitives. Focused core runtime/store/entity tests passed 271/271 during the audit; all game tests passed 335/335.
- Deterministic/injectable random primitives, transport-neutral interfaces, snapshot modules, and store seams are the right raw materials.
- React store integration uses `useSyncExternalStore`, stable subscriptions, and selector caching well (`packages/react/src/engineStore.ts:14-62`).
- Terrain history uses compact reversible deltas; scatter uses chunked instancing with substantially better resource ownership than the weak paths above.
- Editor undo/redo, RPC breadth, prefabs, collections, schema metadata, scene/runtime document sharing, and performance instrumentation are directionally strong.
- SQL queries are parameterized and `savePlan` is transactionally grouped.
- file writes stage then rename, which is a useful single-process durability baseline.
- pose validation rejects non-finite values; chat already has useful size/rate/history controls.
- frozen installs, bounded scripts, package-specific builds/tests, API docs, capability indexes, orphan checks, and smoke infrastructure provide a strong platform for fixing the gaps.

The right move is not a rewrite from scratch. Keep the pure primitives and narrow seams. Rebuild authority, snapshot ownership, lifecycle, public package boundaries, and proof around them.

## Recommended execution order

1. **Phase 0 in one security-focused change set.** Disable the GitHub proxy first; close private-session and Convex identity holes; introduce private state projection.
2. **Phase 1 before adding multiplayer features.** Idempotency, resume, membership, codecs, sequencing, limits, revision validation.
3. **Phase 2 before claiming persistence completeness.** Feature-owned state policy, immutable snapshots, SQL/Convex/file correctness.
4. **Phase 3 as a lifecycle hardening sweep.** Audio/GPU/editor imports/disposal/RPC truth.
5. **Phase 4 driven by benchmarks, not intuition.** Mutation journals, AOI, hot-path and GPU fixes.
6. **Phase 5 to shrink accidental API and repair release contracts.** Descriptor architecture, explicit exports, version/publish/install proof.
7. **Phase 6 continuously, with exploit regressions first.** Move the highest-risk tests into required PR CI as each fix lands.

## Final definition of done

JGengine can call itself production-ready when all of the following are demonstrably true:

- no generic server-token proxy is publicly callable;
- private session IDs and private player state are not disclosed;
- identity is server-authenticated and direct joins enforce authorization;
- reconnect never duplicates mutations and reliably resumes membership/state;
- every wire payload is decoded, bounded, authorized, ordered, and observable;
- save/restore round-trips every enabled first-class feature or explicitly rejects unsupported combinations;
- snapshots are immutable owned values with versioned codecs/migrations;
- unchanged tick cost is not proportional to the whole world, and replication is viewer/AOI scoped;
- every runtime/GPU/audio/browser resource has deterministic teardown;
- installed tarballs—not workspace source aliases—compile and boot in clean consumers;
- PR CI runs compile/tests/package smoke, and publish is gated on that exact green SHA;
- one real shipped game proves browser, authoritative backend, persistence, reconnect, restart, and restored play end-to-end.
