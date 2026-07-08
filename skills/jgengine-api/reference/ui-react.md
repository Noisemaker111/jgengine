# jgengine-api — UI — @jgengine/react

Reference module for the [`jgengine-api`](../SKILL.md) skill. Load this when you need the React UI layer.

## UI — `@jgengine/react`

**Game UI/UX patterns** (frameless HUD, modals, keybinds, cooldowns, world VFX): read **`jgengine-ui`** skill — not optional.

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
**Chat (`@jgengine/react/chat`)** — headless `<ChatPanel>` (tabs + log + input composition with internal active-channel state), or compose `<ChannelTabs active onSelect>`, `<ChatLog channelId>` (auto-scrolls, `renderMessage` override), `<ChatInput channelId onSent onRejected>` yourself. All drive `ctx.game.chat` through `useChat`. `chatTransportFromSync(sync)` lifts a callback-style `ChatSync` (e.g. `createWsBackend(...).chatSyncFor(serverId)`) into the hook-shaped `ChatTransport` for remote chat.
**Voice (`@jgengine/react/voice`)** — `useVoice()` once per channel: `getUserMedia` mic capture (`requestMic()`, tracks gated by transmission), push-to-talk via `createPushToTalk` (hold/toggle/openMic + mute), roster from `VoiceTransport.subscribers`, and per-speaker `gainFor(userId)` when you pass `resolveRoutes: () => router.resolveRoutes(myUserId)` from `@jgengine/ws/voiceChannel`. Hand the returned state to the headless `<PushToTalkButton voice>`, `<MicToggle voice>`, `<SpeakingIndicator voice userId>`, `<VoiceRoster voice>`.
**Social (`@jgengine/react/social`)** — the headless social kit over `ctx.game.social`: friends (`<FriendsList>`, `<FriendRow>`, `<PresenceDot>`, `<AddFriendButton toUserId>`, `<FriendRequestsList>` with accept/decline), party (`<PartyFrame>`, `<PartyMemberRow>`, `<PartyInviteToast>`, `<LeavePartyButton>`), worlds (`<WorldBrowser listings onJoin>`, `<JoinByCode onJoin>` — normalizes codes, `<QuickMatchButton listings filter?>`, `<InviteToWorldButton toUserId target>`, `<WorldInviteToast onAccepted>` — hands you the `{ serverId, joinCode? }` join target), and `<EmoteWheel emotes>` over `emotes.play`. All className-passthrough with `data-*` hooks and `renderX` overrides; the `social-hub` demo in `apps/dev` (`?game=social-hub`) composes the whole kit.
**Drag/rotate/drop/snap gesture layer** (`@jgengine/react/dragLayer`) — a 2-D UI-space gesture layer over the card/shaped-grid primitives, distinct from 3-D world drag. `useDragLayer<T>({ onDrop })` owns pointer-follow drag state (begin/rotate/setTarget/end); pair it with the headless, className-passthrough `DraggableCard` (right-click rotates), `DropZone` (reports the snapped `cellFromPoint` cell + active state), and `DragGhost` (a pointer-anchored preview). Drop resolution and overlap validation stay the game's job via `canPlace`/`placeShaped` from `inventory/shapedGrid` — Balatro hand→play drags, Backpack Hero grid placement, Slay-the-Spire card-onto-enemy targeting.

**Styled game-UI kit (`@jgengine/react/gameui`)** — ~50 fully styled, game-native components (inline styles, zero CSS/Tailwind setup needed; every visual token comes from a theme). Start here before hand-rolling HUD chrome; the headless primitives above remain the low-level escape hatch. Theming: wrap in `<GameUiThemeProvider theme={emberTheme | synthwaveTheme | fieldkitTheme | your GameUiTheme}>` — every component reskins from the one token object (`useGameUiTheme()` inside custom components). Families, each with its own construction so nothing looks like the same card twice: **vitals** (`VitalBar`/`EntityVitalBar` slant-clipped bars with damage ghost-trail + segment ticks, `UnitFrame`/`TargetFrame` portrait plates with level rosette, `CastBar`, `BossBar` with phase ticks, `ResourceOrb` liquid orbs, `HeartRow`, `XpBar`, `ChargeMeter`, `BreakMeter`); **slots** (`AbilitySlotButton` with the four required states + conic cooldown sweep + charge pips + corner `KeybindBadge`, `ActionBar`, `AbilityActionBar` bound to an `AbilityKit` via `useAbilitySlots`, `HotbarSelector`, `ItemGrid`/`InventorySlotGrid` with rarity borders, `EquipmentDoll`, `BuffTray`/`MoodleTray`, `LootCard`); **feedback** (`CombatFloatLayer`/`GameEventFloats` floating combat text, `HitMarker`, `KillFeed`/`FeedKillFeed`, `AnnouncementBanner`, `ComboCounter`, `StreakCallout`, `PickupToastStack`/`FeedPickupToasts`, `LevelUpSplash`); **meters** (`ScoreReadout`, `MatchTimer`, `CountdownPips`, `WaveIndicator`, `AmmoCounter`, `CurrencyDisplay`/`WalletCurrencyDisplay`, `ObjectiveChannel`, `TeamScoreBoard`, `RacePosition`, `ArcGauge`, `EventChargeMeter`); **panels** (bracket-cornered `HudPanel` chrome: `QuestTracker`/`JournalQuestTracker` — frameless per MMO convention, `ScoreboardOverlay`, `RankList`/`StatLeaderboard`, `CombatLogPanel`/`FeedCombatLog`, `VendorPanel`, `CraftingPanel`, `DialoguePanel`); **screens** (`TitleScreen`, `PauseScreen`, `DeathScreenView`/`DeathOverlayBound`, `ResultsScreen`, `LoadingScreen`, `MenuButton`/`MenuList`, `SliderRow`/`ToggleRow`/`SettingsGroup`); **reticles** (`Reticle` variants with spread, `LockOnMarker`, `DamageDirectionIndicator`, `WaypointMarker`/`HudMarkerLayer`, `InteractionRing`); **icons** (`GameIcon` + 59-name `GAME_ICON_NAMES` silhouette catalog, `iconForItemId` keyword resolver — satisfies the no-placeholder-icon rule out of the box). Engine-bound variants (prefixed `Entity`/`Ability`/`Journal`/`Feed`/`Wallet`/`Stat`/`GameEvent`) wrap the hooks table above; everything else is prop-driven and works without a `GameContext`. Browse everything staged: `apps/dev` `?game=ui-kit&mode=ui` (tabs via `&tab=hud|items|meters|panels|screens|icons`, theme via `&kitTheme=`).

**Layout rule:** all **screen** positioning (`absolute`, `inset-*`, grid zones, flex regions) lives on wrappers inside `ui/GameUI.tsx` only. `ui/components/` files are content + hooks only — internal `relative`/`absolute` for bar overlays or slot badges inside a component is fine; never anchor a component to the viewport from a child file. Pass `className` to primitives for **visual** styling (colors, borders, size), not screen placement.

**Tailwind sources:** add `@source` entries in your CSS for your game source dirs plus `node_modules/@jgengine/shell` and `node_modules/@jgengine/react`. Without them, classes used in dynamically imported game code are **not generated** — layout wrappers in `GameUI.tsx` silently fail and every HUD cluster stacks in one corner.

### UI quality bar (required — not optional polish)

Headless primitives mean **you** ship the visual design. Functional wiring alone is not shippable UI.

| Requirement | Minimum |
|-------------|---------|
| **Contrast** | HUD text and borders readable on the game's scene background — never bare `text-stone-400` on near-black without a panel |
| **Scale** | Primary HUD (unit frames, hotbar slots, menu buttons) ≥ 48px touch targets; body text ≥ `text-sm` (12px); key labels never below 11px |
| **Framing** | Every persistent HUD cluster gets a panel: border, fill, shadow, or backdrop — not floating unstyled text |
| **Hotbar / slots** | Icon or color-coded tile per ability; keybind badge; hover/active state; empty slots visually distinct |
| **Unit frames** | Name + level + labeled bars with numeric values; health/mana/resource colors genre-appropriate |
| **Layout** | No overlapping anchors; reserve space for frames that appear conditionally (target, quest log) |
| **Panels** | Modal/slide panels: title, close control, section headers, consistent chrome with the HUD |
| **Feedback** | Errors, cooldowns, and empty actions surface to the player (toast, dim, shake) — not `console.warn` only |

**Genre fit:** MMO/RPG → ornate dark panels, gold accents, portrait + bars, action bar with icons. Shooter → crosshair + ammo + ability cooldowns. Tycoon → resource pills + build menus. Match the game's fantasy; do not ship debug-gray placeholders.

**Shared chrome:** extract repeated panel/slot styles into `ui/<theme>.ts` or `ui/components/<Frame>.tsx` — do not copy-paste three classes per file.

**Self-check before calling UI done:**

- [ ] Screenshot at 1080p: can you read every label without squinting?
- [ ] Hotbar identifiable in 2 seconds at game zoom?
- [ ] Panels do not overlap when target + quest + menu are all visible?
- [ ] Would a player think this is intentional art direction, not an unstyled prototype?

