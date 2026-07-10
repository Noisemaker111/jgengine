# jgengine-api — UI — @jgengine/react

Reference module for the [`jgengine-api`](../SKILL.md) skill. Load this when you need the React UI layer. The **UI quality bar** section at the bottom is how the HUD must look and behave — required, not optional polish.

```tsx
import { GameProvider, useSceneEntities, HealthBar } from "@jgengine/react";

<GameProvider context={ctx}>…</GameProvider>
```

Import provider, hooks, and headless components from the package root `@jgengine/react` (a barrel re-export). The per-file subpaths (`@jgengine/react/provider`, `/hooks`, `/components`) resolve the same symbols if you prefer them.

All hooks bind through the ctx change signal (`ctx.subscribe`/`ctx.version`):

| Hook | Returns |
|------|---------|
| `useGame()` / `usePlayer()` | `{ commands, events }` / `{ userId, isNew }` |
| `useSceneEntities()` / `useSceneObjects()` | live snapshots for rendering |
| `useWorldItems()` / `useNearestWorldItem(radius)` | ground-loot snapshots / nearest pickup for a HUD prompt |
| `useEntityStat(instanceId, statId)` | `StatValue \| null` |
| `useTarget(fromId)` | locked instanceId \| null |
| `useInventory(id)` / `useCurrency(id)` | slots / balance |
| `useFeed({ action, limit? })` | recent entries — kills, loot, any action |
| `useQuestJournal()` | active quests + objective progress |
| `useFriends()` / `useParty()` / `usePresence(userId)` / `useWorldInvites()` | social panels |
| `useFriendRequests()` / `usePartyInvites()` | pending inbound requests/invites for the local player |
| `useWorldBrowser({ fetchSessions, filter?, limit?, refreshMs? })` | polls a host-supplied fetcher (e.g. `createWsBackend().browse`) through matchmaking's `browseSessions` |
| `useSession()` / `useAuthedPlayer({ guestSeed? })` | auth session from `<GameIdentityProvider>` / the `{ userId, isNew }` player seam for `createGameContext` |
| `useChat(channelId, { limit? })` | local-player-filtered recent messages from `ctx.game.chat` |
| `useChatBubbles({ channelId?, ttlMs?, limit? })` / `useEntityChatBubble(instanceId, options?)` | ttl-expiring over-entity speech bubbles — newest live message per user from `ctx.game.chat` (default `proximity`, 4s ttl) / the local bubble for one entity; `latestChatBubbles` is the pure helper |
| `useVoice({ transport?, channelId?, mode?, resolveRoutes? })` | mic capture + PTT + voice-channel roster over the `VoiceTransport` seam |
| `useRoster(userId?)` | owned/captured roster entries for a user (defaults to the local player) |
| `useLeaderboard(stat, { scope, limit? })` | `{ userId, value }[]` |
| `useActivePrompt(prompts)` | nearest proximity prompt |
| `useGameClock()` | clock snapshot (`now`, `paused`, `speed`, `calendar`) + `controls` (pause/play/setSpeed) |
| `useLocalPlayerDead()` / `localPlayerEntity(entities, userId)` | death-screen gating; local player from a snapshot |
| `useMarkers(markerSet)` / `useFog(fogField)` | live map-marker list / fog-cell snapshot (bind a core `MarkerSet`/`FogField`) |
| `useGameStore()` | raw store handle — escape hatch under the typed hooks |
| `useEngineState(store)` / `useEngineStore(store, selector)` / `useEngineEvent(store, event, handler)` | bind/select/subscribe against any `ReadableEngineStore<TState>` / `EventfulEngineStore<TEventMap>` — the escape hatch below `useGameStore()` for state that isn't wired into a typed hook yet |
| `useHeldKeys()` | `(code: string) => boolean` — raw window keydown/keyup/blur-backed held-key predicate, no `ctx` needed; the primitive `useAxisChannel` and the shell's own movement sampling are built on |
| `useAxisChannel(config: AxisChannelConfig)` | `{ channel: AxisChannel, isDown }` — wires `useHeldKeys` into a fresh `AxisChannel` (`@jgengine/core/input/axisInput`) for a per-frame `channel.sample(dt, isDown)`; a driving/twin-stick HUD or custom control scheme reads analog throttle/steer without touching `window` directly |

Import hooks from `@jgengine/react/hooks`, components from `@jgengine/react/components`, `GameProvider` from `@jgengine/react/provider` (the package uses deep paths like core). `useEngineState`, `ReadableEngineStore`, `useEngineStore`, `useEngineEvent` also ship from the main `@jgengine/react` entry point (defined in `@jgengine/react/engineStore`, re-exported at the package root) — no deep import required.

Headless components (className passthrough, no baked-in styling): `SlotGrid`, `HealthBar` (+ `fillClassName`), `CurrencyPill`, `ProximityPrompt`, `Screen`, `KeybindRow`, `DialogueBox` (+ `lineClassName`/`speakerClassName`/`choicesClassName`/`choiceClassName`/`checkClassName`, `rollCheck`-gated choices), `SkillCheckBar` (+ `trackClassName`/`zoneClassName`/`markerClassName`), `QteTrack` (+ `stepClassName`/`activeClassName`/`doneClassName`), `CaptureOdds` (+ `fillClassName`), `ToastStack`, `DeathScreen`, `LevelUpFlash`. Map components (bind a core `MarkerSet`/`FogField`, `kindStyles` palette overridable): `Minimap` (framed circular player-centered map — fog + markers + facing arrow, optional baked terrain `background`+`mapBounds`), `Compass` (facing strip with cardinals + marker pips), `WorldMap` (full-bounds top-down overlay). Not yet implemented: `useServer`, `useDialogue`.
**Identity (`@jgengine/react/identity`)** — `<GameIdentityProvider source={…}>` + `useSession()`. Sources: `clerkIdentity({ isLoaded, isSignedIn, user })` maps Clerk's `useUser()` shape, `betterAuthIdentity({ data, isPending })` maps better-auth's `useSession()` shape (both pure structural mappers — no SDK imports, one line at the call site), `guestIdentity(seed?)` for local/dev. Gate UI with `<RequireSession fallback loading>`; `<UserBadge>` / `<SignOutButton>` are headless like everything else. `useAuthedPlayer({ guestSeed? })` returns the `{ userId, isNew }` to hand `createGameContext` — feed the player seam from the session instead of hand-picking a userId.
**Chat (`@jgengine/react/chat`)** — headless `<ChatPanel>` (tabs + log + input composition with internal active-channel state), or compose `<ChannelTabs active onSelect>`, `<ChatLog channelId>` (auto-scrolls, `renderMessage` override), `<ChatInput channelId onSent onRejected>` yourself. All drive `ctx.game.chat` through `useChat`. `chatTransportFromSync(sync)` lifts a callback-style `ChatSync` (e.g. `createWsBackend(...).chatSyncFor(serverId)`) into the hook-shaped `ChatTransport` for remote chat. For speech bubbles anchored over an entity, use `useChatBubbles`/`useEntityChatBubble` (`@jgengine/react/chatBubbles`) with the `chat-bubble` / `entity-chat-bubble` registry items — the caller projects entity world position to percent x/y (`projectToView` from `@jgengine/core/sensor/frustumSensor`). Safe chat: pass a `createChatFilter` (`@jgengine/core/game/chatFilter`) as `ChatDeps.filter` to mask or reject blocked words at send time.
**Voice (`@jgengine/react/voice`)** — `useVoice()` once per channel: `getUserMedia` mic capture (`requestMic()`, tracks gated by transmission), push-to-talk via `createPushToTalk` (hold/toggle/openMic + mute), roster from `VoiceTransport.subscribers`, and per-speaker `gainFor(userId)` when you pass `resolveRoutes: () => router.resolveRoutes(myUserId)` from `@jgengine/ws/voiceChannel`. Hand the returned state to the headless `<PushToTalkButton voice>`, `<MicToggle voice>`, `<SpeakingIndicator voice userId>`, `<VoiceRoster voice>`.
**Social (`@jgengine/react/social`)** — the headless social kit over `ctx.game.social`: friends (`<FriendsList>`, `<FriendRow>`, `<PresenceDot>`, `<AddFriendButton toUserId>`, `<FriendRequestsList>` with accept/decline), party (`<PartyFrame>`, `<PartyMemberRow>`, `<PartyInviteToast>`, `<LeavePartyButton>`), worlds (`<WorldBrowser listings onJoin>`, `<JoinByCode onJoin>` — normalizes codes, `<QuickMatchButton listings filter?>`, `<InviteToWorldButton toUserId target>`, `<WorldInviteToast onAccepted>` — hands you the `{ serverId, joinCode? }` join target), and `<EmoteWheel emotes>` over `emotes.play`. All className-passthrough with `data-*` hooks and `renderX` overrides; the `social-hub` demo in `apps/dev` (`?game=social-hub`) composes the whole kit.
**Drag/rotate/drop/snap gesture layer** (`@jgengine/react/dragLayer`) — a 2-D UI-space gesture layer over the card/shaped-grid primitives, distinct from 3-D world drag. `useDragLayer<T>({ onDrop })` owns pointer-follow drag state (begin/rotate/setTarget/end); pair it with the headless, className-passthrough `DraggableCard` (right-click rotates), `DropZone` (reports the snapped `cellFromPoint` cell + active state), and `DragGhost` (a pointer-anchored preview). Drop resolution and overlap validation stay the game's job via `canPlace`/`placeShaped` from `inventory/shapedGrid` — Balatro hand→play drags, Backpack Hero grid placement, Slay-the-Spire card-onto-enemy targeting.

**Responsive HUD panels** (`@jgengine/react/hudLayout` over `@jgengine/core/ui/hudLayout`) — the self-solving layout layer every HUD block lives in. `useHudLayout({ storageKey?, snap?, locked? })` creates a `HudLayoutStore` (pure core store: anchor-relative placements, z-order, clamp/snap math, `editing`/`locked` flags, serialize/hydrate) and, when `storageKey` is set, persists dragged panels to `localStorage` automatically. Wrap the HUD in `<HudCanvas layout={layout}>` (the full-bleed `pointer-events-none` root you would otherwise hand-roll) and put each cluster in `<HudPanel id="minimap" anchor="top-right">`. Panels sharing an anchor **flow into that region and auto-stack outward from the screen edge with a gap** — no pixel insets, no manual clearance for sibling panels, the touch dock, or device safe areas. Order the stack with `order` (ascending outward from the edge, default 0).

`HudPanel` props: `anchor` (one of nine regions), `order`, `compact: "keep" | "chip" | "hide"` (behavior on phone-scale displays — `chip` collapses the panel to a tap-to-expand pill labeled by `chip`, `hide` unmounts it), `interactive` (`false` = pointer events pass through so a read-only readout never eats a tap; default true). `HudCanvas` handles device safe areas, scales the whole HUD down on compact displays (`compactScale`, default 0.85), and reserves space above the engine touch dock automatically via `--jg-hud-dock-clearance`. `inset` is legacy — used only as the reset placement for a dragged panel, never for normal layout.

During play the layout is fixed; **holding F2 and pressing C toggles HUD-edit mode** (`HudCanvas` installs the chord, customize or disable via `editChord`; Esc also exits), where every panel becomes draggable with dashed outlines, id labels, a click shield over its content, and a top-center bar with Reset/Done — dragging leaves the flow, clamps to the viewport, re-anchors to the nearest region, brings the panel to front, and sets `data-dragging`; `data-hud-editing` is set on the canvas root. Custom drag placements are **ignored on compact displays** (panels return to the flow). Programmatic control: `layout.setEditing(b)`, `layout.reset(id?)`, per-panel `locked` prop to exempt a panel, `locked: false` on `useHudLayout` for tldraw-style always-draggable panels (4px drag threshold keeps buttons and inputs inside panels clicking normally). Core math (`nearestAnchor`, `placementFromRect`, `rectFromPlacement`, `clampRect`, `anchoredPlacement`, `isPanelDraggable`) is pure and browserless-testable. Reference HUD: `Games/turbine-city/src/game/ui/GameUI.tsx` — anchored panels, a chip'd fan schedule (`compact="chip"`), read-only clusters (`interactive={false}`).

**Layout rule:** every HUD block lives inside `HudCanvas`/`HudPanel` with an `anchor` + a `compact` behavior — that is how it survives resizes, phone scale, and the touch dock. Hand-rolled `absolute top-4 left-4`-style HUD divs are **no longer acceptable**. The only raw children of `HudCanvas` (no `HudPanel`) are full-screen overlays — start/results screens, countdowns, vignettes — and centered transient cues; those cover the viewport by design and don't anchor. A full-screen overlay with content near the bottom (a CTA button, a stats card) must pad its container with `calc(env(safe-area-inset-bottom, 0px) + var(--jg-hud-dock-clearance, 0px))` so the touch dock never covers it, and should swap keyboard-binding tables/badges for a one-line touch hint when `coarsePointer` is true (see turbine-city's `StartScreen.tsx`). `ui/components/` files are content + hooks only — internal `relative`/`absolute` for bar overlays or slot badges inside a component is fine; never anchor a component to the viewport from a child file. Pass `className` to primitives for **visual** styling (colors, borders, size), not screen placement. For content-level adaptation (a smaller minimap SVG on phones, fewer rows) read `useDisplayProfile()` (`@jgengine/react/display`) inside the component — its `compact` flag also trips on short landscape-phone viewports, not just narrow width.

**Tailwind sources:** add `@source` entries in your CSS for your game source dirs plus `node_modules/@jgengine/shell` and `node_modules/@jgengine/react`. Without them, classes used in dynamically imported game code are **not generated** — layout wrappers in `GameUI.tsx` silently fail and every HUD cluster stacks in one corner.

## Visual HUD via the shadcn registry

Styled HUD components are **copy-in code**, not npm exports — install them from the JGengine registry with the shadcn CLI:

```sh
npx shadcn@latest add https://jgengine.com/r/entity-vital-bar.json
```

The component lands in your game's `components/ui/`, themes through `--jg-*` CSS variables, and reads engine data through `@jgengine/react/hooks`. Health bar hookup, end to end:

```tsx
import { usePlayer } from "@jgengine/react/hooks";
import { EntityVitalBar } from "@/components/ui/entity-vital-bar";

const { userId } = usePlayer();
return <EntityVitalBar instanceId={userId} statId="health" />;
```

The full HUD catalog ships as registry items — vitals, slots, feedback, meters, panels, screens, reticles, plus the `game-icon` glyph catalog (`iconForItemId`/`iconForAction`), with engine-bound `Entity`/`Ability`/`Journal`/`Feed`/`Wallet` variants wired to the hooks. Where a registry item exists, prefer it — and never hand-roll a gray-box version of a component the registry already ships.

### UI quality bar (required — not optional polish)

Headless primitives mean **you** ship the visual design. Functional wiring alone is not shippable UI. Judge against staged screenshots, never your mental model of the code.

**See what you ship.** `@jgengine/shell`'s `GameUiPreview` renders your `GameUI` over a staged `GameContext` (ticks run, hostile targeted, first ability fired) with no gameplay or backend — mount it on a dev route, screenshot it, and judge the image before calling any HUD work done; pass a custom `scenario` to stage richer states (open modals, low health, active quest). Type-green says nothing about whether the HUD renders.

| Requirement | Minimum |
|-------------|---------|
| **Contrast** | HUD text and borders readable on the game's scene background — never bare `text-stone-400` on near-black without a panel |
| **Scale** | Primary HUD (unit frames, hotbar slots, menu buttons) ≥ 48px touch targets; body text ≥ `text-sm` (12px); key labels never below 11px |
| **Distinct construction** | Unit frame, hotbar, currency, quests, and toasts must not share one card style — same `rounded border bg-stone-900/80 p-3` on everything reads identical and cheap |
| **Real icons** | Every item/ability/hotbar slot shows a real, distinct silhouette or sprite (registry `game-icon`, asset-pack sprite) — never a gray box, first letter, emoji, or one generic shape reused everywhere |
| **Hotbar / slots** | Icon per ability; keybind badge on the slot corner; hover/active state; empty slots visually distinct |
| **Unit frames** | Name + level + labeled bars with numeric values; health/mana/resource colors genre-appropriate |
| **Layout** | No overlapping anchors; reserve space for frames that appear conditionally (target, quest log) |
| **Panels** | Modal/slide panels: title, close control, section headers, consistent chrome with the HUD |
| **Feedback** | Errors, cooldowns, and empty actions surface to the player (toast, dim, shake) — not `console.warn` only. Error text is ephemeral floating combat text, never a bordered toast card |

**Genre fit:** MMO/RPG → ornate dark panels, gold accents, portrait + bars, action bar with icons. Shooter → crosshair + ammo + ability cooldowns. Tycoon → resource pills + build menus. Match the game's fantasy; do not ship debug-gray placeholders.

**Panel vs frameless.** Modal/panel chrome (backdrop + bordered window) is for on-demand windows only: backpack/bags, combat log/chat feed, social window. Everything persistent stays frameless — typography, bars, icons, shadows, no enclosing card: player/target/party frames, action bar, quest tracker, currency, voice cluster, floating combat text, world VFX. Backpack is the only bag UI (no hotbar inside it); character sheet holds equipment + stats; the abilities page lists catalog abilities with costs/cooldowns/keybinds, not a hotbar duplicate.

**Keybinds are badges on their control.** Every toggle and hotbar slot shows its binding on itself (slot corner, toggle button) — never a persistent "WASD to move / E to interact" legend pinned to the screen; if a control needs explaining, badge it or use a proximity prompt that fades. Labels derive from the game's `keybinds.ts` via `actionLabel(keybinds, action)` — hardcoded key strings drift. Register actions in `defineGame.input`, wire through `game.commands` (never UI click handlers only), and read the binding table once before shipping: **one key, one action**. Panel toggles follow the `ui.openBackpack`-style command pattern with state in `ctx.game.store` (`useGameStore`), not a hand-rolled module store.

**Action bar slot states — all four, visually:** ready (full color), cooldown (dim + sweep + numeric timer), no-resource (red tint/desaturate, cost checked before press), just-cast (brief bright ring flash ~200ms). Cooldown data lives in game code; UI reads it.

**Combat feedback:** bolts/bullets are `fireProjectile` + delayed `settleProjectile` so they visibly travel — never `effect({ to })`; instant heals flash the unit-frame bar; out-of-range/oom is floating text that fades, no bordered toast.

**Mobile / touch:** put every block in a `HudPanel` with a `compact` behavior and the responsive HUD does the phone work for you — `HudCanvas` scales the whole HUD down (`compactScale`), reserves space above the touch dock (`--jg-hud-dock-clearance`), respects safe areas, and each panel applies `keep`/`chip`/`hide` so a 390px viewport has no overflow (chip the side clusters, hide the purely-desktop ones). Reach for `useDisplayProfile().compact` (`@jgengine/react/display`) only for content-level tuning inside a component (smaller minimap SVG, fewer rows); `compact` trips on short landscape-phone viewports too. Still your job: never render key badges/legends on touch; keep read-only panels `interactive={false}` so they pass taps through; ≥48px touch targets always.

**Social HUD:** build from the headless kits (`@jgengine/react/social`, `/chat`, `/voice`, `/identity`), never hand-rolled lists. Chat is a corner-anchored panel (channel tabs, log, input; sender names tinted apart from bodies); invite toasts are ephemeral with accept/decline that expire with the invite; presence is a dot (`data-online`), not a word; push-to-talk badges its keybind and visibly transmits (`data-transmitting`), speaking players glow on their party row; emote wheel appears on hold-key and fades. Every social button drives an engine verb (`social.friends.request`, `party.accept`, `worldInvites.accept` → join) — one that only mutates local UI state is half a system.

**Camera feel is part of the HUD pass.** The shell's orbit camera (left-drag orbit, scroll zoom, tap = primary ability, camera-relative WASD) tunes per game via the `camera` field of `defineGame({...})` (`minDistance`, `maxDistance`, `targetHeight`, `rotateSpeed`, `zoomSpeed`, `dampingFactor`, smoothing) — defaults untouched means the feel was never checked; never hardcode camera position in `onTick` while a rig is active.

**Shared chrome:** extract repeated panel/slot styles into `ui/<theme>.ts` or `ui/components/<Frame>.tsx` — do not copy-paste three classes per file.

**Self-check before calling UI done** (against actual staged screenshots):

- [ ] Screenshot at 1080p: can you read every label without squinting?
- [ ] Could you mistake the unit frame and hotbar for the same component? If yes, redo.
- [ ] Every toggle shows its key on its own control — and no persistent controls legend anywhere?
- [ ] Every item/ability slot shows a real, distinct icon — no gray boxes, letters, or emoji?
- [ ] Do bolts visibly travel before damage lands?
- [ ] Only on-demand windows (backpack, log, social) have panel borders?
- [ ] Every declared system has its UI end state — quest → tracker, cooldown → sweep + timer, error → floating text? A wired hook with no visual is half a system: finish it or cut it (see `jgengine-newgame`).
- [ ] Does the staged shot show the HUD *working* (target locked, cooldown mid-sweep, tracker populated), not resting-empty?
- [ ] Would a player think this is intentional art direction? If it looks like a debug build, it ships nothing.

