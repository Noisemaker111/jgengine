# jgengine domain API â€” UI â€” @jgengine/react

Reference module for the [`jgengine-ui` API](SKILL.md) skill. Load this when you need the React UI layer. The **UI quality bar** section at the bottom is how the HUD must look and behave â€” required, not optional polish.

```tsx
import { GameProvider, useSceneEntities, HealthBar } from "@jgengine/react";

<GameProvider context={ctx}>â€¦</GameProvider>
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
| `useFeed({ action, limit? })` | recent entries â€” kills, loot, any action |
| `useQuestJournal()` | active quests + objective progress |
| `useFriends()` / `useParty()` / `usePresence(userId)` / `useWorldInvites()` | social panels |
| `useFriendRequests()` / `usePartyInvites()` | pending inbound requests/invites for the local player |
| `useWorldBrowser({ fetchSessions, filter?, limit?, refreshMs? })` | polls a host-supplied fetcher (e.g. `createWsBackend().browse`) through matchmaking's `browseSessions` |
| `useSession()` / `useAuthedPlayer({ guestSeed? })` | auth session from `<GameIdentityProvider>` / the `{ userId, isNew }` player seam for `createGameContext` |
| `useChat(channelId, { limit? })` | local-player-filtered recent messages from `ctx.game.chat` |
| `useChatBubbles({ channelId?, ttlMs?, limit? })` / `useEntityChatBubble(instanceId, options?)` | ttl-expiring over-entity speech bubbles â€” newest live message per user from `ctx.game.chat` (default `proximity`, 4s ttl) / the local bubble for one entity; `latestChatBubbles` is the pure helper |
| `useVoice({ transport?, channelId?, mode?, resolveRoutes? })` | mic capture + PTT + voice-channel roster over the `VoiceTransport` seam |
| `useRoster(userId?)` | owned/captured roster entries for a user (defaults to the local player) |
| `useLeaderboard(stat, { scope, limit? })` | `{ userId, value }[]` |
| `useActivePrompt(prompts)` | nearest proximity prompt |
| `useGameClock()` | clock snapshot (`now`, `paused`, `speed`, `calendar`) + `controls` (pause/play/setSpeed) |
| `useLocalPlayerDead()` / `localPlayerEntity(entities, userId)` | death-screen gating; local player from a snapshot |
| `useMarkers(markerSet)` / `useFog(fogField)` | live map-marker list / fog-cell snapshot (bind a core `MarkerSet`/`FogField`) |
| `useGameStore()` | raw store handle â€” escape hatch under the typed hooks |
| `useEngineState(store)` / `useEngineStore(store, selector)` / `useEngineEvent(store, event, handler)` | bind/select/subscribe against any `ReadableEngineStore<TState>` / `EventfulEngineStore<TEventMap>` â€” the escape hatch below `useGameStore()` for state that isn't wired into a typed hook yet |
| `useHeldKeys()` | `(code: string) => boolean` â€” raw window keydown/keyup/blur-backed held-key predicate, no `ctx` needed; the primitive `useAxisChannel` and the shell's own movement sampling are built on |
| `useAxisChannel(config: AxisChannelConfig)` | `{ channel: AxisChannel, isDown }` â€” wires `useHeldKeys` into a fresh `AxisChannel` (`@jgengine/core/input/axisInput`) for a per-frame `channel.sample(dt, isDown)`; a driving/twin-stick HUD or custom control scheme reads analog throttle/steer without touching `window` directly |

Import hooks from `@jgengine/react/hooks`, components from `@jgengine/react/components`, `GameProvider` from `@jgengine/react/provider` (the package uses deep paths like core). `useEngineState`, `ReadableEngineStore`, `useEngineStore`, `useEngineEvent` also ship from the main `@jgengine/react` entry point (defined in `@jgengine/react/engineStore`, re-exported at the package root) â€” no deep import required.

Headless components (className passthrough, no baked-in styling): `SlotGrid`, `HealthBar` (+ `fillClassName`), `CurrencyPill`, `ProximityPrompt`, `Screen`, `KeybindRow`, `DialogueBox` (+ `lineClassName`/`speakerClassName`/`choicesClassName`/`choiceClassName`/`checkClassName`, `rollCheck`-gated choices), `SkillCheckBar` (+ `trackClassName`/`zoneClassName`/`markerClassName`), `QteTrack` (+ `stepClassName`/`activeClassName`/`doneClassName`), `CaptureOdds` (+ `fillClassName`), `ToastStack`, `DeathScreen`, `LevelUpFlash`. Map components (bind a core `MarkerSet`/`FogField`, `kindStyles` palette overridable): `Minimap` (framed circular player-centered map â€” fog + markers + facing arrow, optional baked terrain `background`+`mapBounds`), `Compass` (facing strip with cardinals + marker pips), `WorldMap` (full-bounds top-down overlay). Not yet implemented: `useServer`, `useDialogue`.
**Identity (`@jgengine/react/identity`)** â€” `<GameIdentityProvider source={â€¦}>` + `useSession()`. Sources: `clerkIdentity({ isLoaded, isSignedIn, user })` maps Clerk's `useUser()` shape, `betterAuthIdentity({ data, isPending })` maps better-auth's `useSession()` shape (both pure structural mappers â€” no SDK imports, one line at the call site), `guestIdentity(seed?)` for local/dev. Gate UI with `<RequireSession fallback loading>`; `<UserBadge>` / `<SignOutButton>` are headless like everything else. `useAuthedPlayer({ guestSeed? })` returns the `{ userId, isNew }` to hand `createGameContext` â€” feed the player seam from the session instead of hand-picking a userId.
**Chat (`@jgengine/react/chat`)** â€” headless `<ChatPanel>` (tabs + log + input composition with internal active-channel state), or compose `<ChannelTabs active onSelect>`, `<ChatLog channelId>` (auto-scrolls, `renderMessage` override), `<ChatInput channelId onSent onRejected>` yourself. All drive `ctx.game.chat` through `useChat`. `chatTransportFromSync(sync)` lifts a callback-style `ChatSync` (e.g. `createWsBackend(...).chatSyncFor(serverId)`) into the hook-shaped `ChatTransport` for remote chat. For speech bubbles anchored over an entity, use `useChatBubbles`/`useEntityChatBubble` (`@jgengine/react/chatBubbles`) with the `chat-bubble` / `entity-chat-bubble` registry items â€” the caller projects entity world position to percent x/y (`projectToView` from `@jgengine/core/sensor/frustumSensor`). Safe chat: pass a `createChatFilter` (`@jgengine/core/game/chatFilter`) as `ChatDeps.filter` to mask or reject blocked words at send time.
**Voice (`@jgengine/react/voice`)** â€” `useVoice()` once per channel: `getUserMedia` mic capture (`requestMic()`, tracks gated by transmission), push-to-talk via `createPushToTalk` (hold/toggle/openMic + mute), roster from `VoiceTransport.subscribers`, and per-speaker `gainFor(userId)` when you pass `resolveRoutes: () => router.resolveRoutes(myUserId)` from `@jgengine/ws/voiceChannel`. Hand the returned state to the headless `<PushToTalkButton voice>`, `<MicToggle voice>`, `<SpeakingIndicator voice userId>`, `<VoiceRoster voice>`.
**Social (`@jgengine/react/social`)** â€” the headless social kit over `ctx.game.social`: friends (`<FriendsList>`, `<FriendRow>`, `<PresenceDot>`, `<AddFriendButton toUserId>`, `<FriendRequestsList>` with accept/decline), party (`<PartyFrame>`, `<PartyMemberRow>`, `<PartyInviteToast>`, `<LeavePartyButton>`), worlds (`<WorldBrowser listings onJoin>`, `<JoinByCode onJoin>` â€” normalizes codes, `<QuickMatchButton listings filter?>`, `<InviteToWorldButton toUserId target>`, `<WorldInviteToast onAccepted>` â€” hands you the `{ serverId, joinCode? }` join target), and `<EmoteWheel emotes>` over `emotes.play`. All className-passthrough with `data-*` hooks and `renderX` overrides; the `social-hub` demo in `apps/dev` (`?game=social-hub`) composes the whole kit.
**Drag/rotate/drop/snap gesture layer** (`@jgengine/react/dragLayer`) â€” a 2-D UI-space gesture layer over the card/shaped-grid primitives, distinct from 3-D world drag. `useDragLayer<T>({ onDrop })` owns pointer-follow drag state (begin/rotate/setTarget/end); pair it with the headless, className-passthrough `DraggableCard` (right-click rotates), `DropZone` (reports the snapped `cellFromPoint` cell + active state), and `DragGhost` (a pointer-anchored preview). Drop resolution and overlap validation stay the game's job via `canPlace`/`placeShaped` from `inventory/shapedGrid` â€” Balatro handâ†’play drags, Backpack Hero grid placement, Slay-the-Spire card-onto-enemy targeting.

**Layout rule:** all **screen** positioning (`absolute`, `inset-*`, grid zones, flex regions) lives on wrappers inside `ui/GameUI.tsx` only. `ui/components/` files are content + hooks only â€” internal `relative`/`absolute` for bar overlays or slot badges inside a component is fine; never anchor a component to the viewport from a child file. Pass `className` to primitives for **visual** styling (colors, borders, size), not screen placement.

**Tailwind sources:** add `@source` entries in your CSS for your game source dirs plus `node_modules/@jgengine/shell` and `node_modules/@jgengine/react`. Without them, classes used in dynamically imported game code are **not generated** â€” layout wrappers in `GameUI.tsx` silently fail and every HUD cluster stacks in one corner.

## Visual HUD via the shadcn registry

Styled HUD components are **copy-in code**, not npm exports â€” install them from the JGengine registry with the shadcn CLI:

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

The full HUD catalog ships as registry items â€” vitals, slots, feedback, meters, panels, screens, reticles, plus the `game-icon` glyph catalog (`iconForItemId`/`iconForAction`), with engine-bound `Entity`/`Ability`/`Journal`/`Feed`/`Wallet` variants wired to the hooks. Where a registry item exists, prefer it â€” and never hand-roll a gray-box version of a component the registry already ships.

### UI quality bar (required â€” not optional polish)

Headless primitives mean **you** ship the visual design. Functional wiring alone is not shippable UI. Judge against staged screenshots, never your mental model of the code.

**See what you ship.** `@jgengine/shell`'s `GameUiPreview` renders your `GameUI` over a staged `GameContext` (ticks run, hostile targeted, first ability fired) with no gameplay or backend â€” mount it on a dev route, screenshot it, and judge the image before calling any HUD work done; pass a custom `scenario` to stage richer states (open modals, low health, active quest). Type-green says nothing about whether the HUD renders.

| Requirement | Minimum |
|-------------|---------|
| **Contrast** | HUD text and borders readable on the game's scene background â€” never bare `text-stone-400` on near-black without a panel |
| **Scale** | Primary HUD (unit frames, hotbar slots, menu buttons) â‰¥ 48px touch targets; body text â‰¥ `text-sm` (12px); key labels never below 11px |
| **Distinct construction** | Unit frame, hotbar, currency, quests, and toasts must not share one card style â€” same `rounded border bg-stone-900/80 p-3` on everything reads identical and cheap |
| **Real icons** | Every item/ability/hotbar slot shows a real, distinct silhouette or sprite (registry `game-icon`, asset-pack sprite) â€” never a gray box, first letter, emoji, or one generic shape reused everywhere |
| **Hotbar / slots** | Icon per ability; keybind badge on the slot corner; hover/active state; empty slots visually distinct |
| **Unit frames** | Name + level + labeled bars with numeric values; health/mana/resource colors genre-appropriate |
| **Layout** | No overlapping anchors; reserve space for frames that appear conditionally (target, quest log) |
| **Panels** | Modal/slide panels: title, close control, section headers, consistent chrome with the HUD |
| **Feedback** | Errors, cooldowns, and empty actions surface to the player (toast, dim, shake) â€” not `console.warn` only. Error text is ephemeral floating combat text, never a bordered toast card |

**Genre fit:** MMO/RPG â†’ ornate dark panels, gold accents, portrait + bars, action bar with icons. Shooter â†’ crosshair + ammo + ability cooldowns. Tycoon â†’ resource pills + build menus. Match the game's fantasy; do not ship debug-gray placeholders.

**Panel vs frameless.** Modal/panel chrome (backdrop + bordered window) is for on-demand windows only: backpack/bags, combat log/chat feed, social window. Everything persistent stays frameless â€” typography, bars, icons, shadows, no enclosing card: player/target/party frames, action bar, quest tracker, currency, voice cluster, floating combat text, world VFX. Backpack is the only bag UI (no hotbar inside it); character sheet holds equipment + stats; the abilities page lists catalog abilities with costs/cooldowns/keybinds, not a hotbar duplicate.

**Keybinds are badges on their control.** Every toggle and hotbar slot shows its binding on itself (slot corner, toggle button) â€” never a persistent "WASD to move / E to interact" legend pinned to the screen; if a control needs explaining, badge it or use a proximity prompt that fades. Labels derive from the game's `keybinds.ts` via `actionLabel(keybinds, action)` â€” hardcoded key strings drift. Register actions in `defineGame.input`, wire through `game.commands` (never UI click handlers only), and read the binding table once before shipping: **one key, one action**. Panel toggles follow the `ui.openBackpack`-style command pattern with state in `ctx.game.store` (`useGameStore`), not a hand-rolled module store.

**Action bar slot states â€” all four, visually:** ready (full color), cooldown (dim + sweep + numeric timer), no-resource (red tint/desaturate, cost checked before press), just-cast (brief bright ring flash ~200ms). Cooldown data lives in game code; UI reads it.

**Combat feedback:** bolts/bullets are `fireProjectile` + delayed `settleProjectile` so they visibly travel â€” never `effect({ to })`; instant heals flash the unit-frame bar; out-of-range/oom is floating text that fades, no bordered toast.

**Mobile / touch:** HUD fits a 390px portrait viewport with no horizontal overflow (`min()`/viewport units once compact); `useDisplayProfile().compact` (`@jgengine/react/display`) collapses side panels into a slim top bar; keep the bottom ~180px clear for the engine's touch dock on `coarsePointer`; never render key badges/legends on touch; non-interactive wrappers stay `pointer-events-none` (only real controls opt in with `pointer-events-auto`); â‰¥48px touch targets always. The engine touch dock auto-scales down on `compact`. A game with a start/results screen must gate the dock so it never paints over a menu. The one-call path is `setGamePhase(ctx, phase)` (`@jgengine/core/game/gamePhase`, phases `"menu" | "playing" | "paused" | "ended"`): call it wherever the run phase transitions (once in `onInit` with `"menu"`, `"playing"` on start, `"ended"` on win/lose). It publishes the phase for `useGamePhase()` and hides the touch dock for every phase except `"playing"` in one call. The lower-level `setPlayControlsActive(ctx, playing)` (`@jgengine/core/game/controlGate`) is the raw toggle underneath if you don't want the phase model; the key absent reads as active, so always-playing games ignore both.

**Settings menu (themed, four layouts, no forced chrome).** The engine builds the whole menu for free — Sound (master + per-bus volume), Graphics (quality/dpr + shadows), Gameplay (FOV slider, default 40â€“120), Controls (per-action key rebinding, inline click-to-rebind, persisted) — from the game's `audio.buses` and `input` map. What it does **not** do is bolt a fixed gear onto every game: **there is no auto trigger.** You place the entry yourself so it lives *inline with your game's own UI*, never a stray corner overlay. Drop `<SettingsTrigger className=…>` (from `@jgengine/react`) anywhere in your HUD or menu — headless button, `className` for skin/placement, optional `children` to replace the default gear glyph, renders nothing when there's nothing to show. Or call `useSettings().open()` from your own control. Tune the menu via `defineGame({ settings })` (`GameSettingsConfig` from `@jgengine/core/settings/settingsModel`):

- `variant: "panel" | "sheet" | "sidebar" | "fullscreen"` — the layout + skin (default `panel`; `sheet` is the mobile bottom-sheet). All four are fixed-size (no shrink-to-content jitter) and read the game's `--jg-*` theme tokens, falling back to a neutral dark skin.
- `actions: SettingsActionDef[]` — game-state actions (Restart, Quit to menu, …). They become the **first "Game" tab, shown before anything else** — the home for buttons that used to float over the HUD. Each: `{ id, label, kind?: "default"|"danger", description?, run(ctx) }`; the menu closes right after `run`.
- `hideBindings: string[]` — input actions to drop from the rebindable Controls list. A game-state key like `restart` belongs in `actions`, not the rebind grid — hide it here so it stops showing up as a "rebindable" control.
- `surface: "quick"` — additionally mount compact on-screen volume/graphics buttons. Omit for none. `settings: false` — off entirely.
- `extra: GameSettingDef[]` — append rows to any category, built-in *or a brand-new one* named by `category` (any string). Each row: `{ id, label, category, kind: "slider"|"toggle"|"select", default, min?, max?, step?, options?, onChange?(value, ctx) }`.
- `categories: SettingCategoryDef[]` — declare custom category tabs, or relabel/reorder built-ins (`{ id, label, order? }`).
- `hide: SettingCategory[]` — drop built-in categories.

**Game-state controls go in `actions`, never a floating button.** Restart/quit/new-game buttons stapled to the bottom of the HUD are the anti-pattern — declare them as `actions` (first Game tab) and place a `<SettingsTrigger>` inline. A contextual button on a win/lose *results* card is fine; a persistent game-state button pinned over live play is not.

**Present it any way you want.** `useSettings()` (`@jgengine/react`) returns the live controller — `{ categories, actions, variant, surface, isOpen, open, close, setOpen }` — so a game can drive its own pause-menu button, or render `categories`/`actions` (rows carry `value`/`set`/bounds, keybinds carry `rebind`/`reset`) entirely inside its own HUD. `useHasSettings()` gates a custom entry; `useSetting(id, fallback)` reads/writes one value. Set a slider's `min`/`max` explicitly â€” an omitted range collapses the thumb to 0/1.

**Social HUD:** build from the headless kits (`@jgengine/react/social`, `/chat`, `/voice`, `/identity`), never hand-rolled lists. Chat is a corner-anchored panel (channel tabs, log, input; sender names tinted apart from bodies); invite toasts are ephemeral with accept/decline that expire with the invite; presence is a dot (`data-online`), not a word; push-to-talk badges its keybind and visibly transmits (`data-transmitting`), speaking players glow on their party row; emote wheel appears on hold-key and fades. Every social button drives an engine verb (`social.friends.request`, `party.accept`, `worldInvites.accept` â†’ join) â€” one that only mutates local UI state is half a system.

**Camera feel is part of the HUD pass.** The shell's orbit camera (left-drag orbit, scroll zoom, tap = primary ability, camera-relative WASD) tunes per game via the `camera` field of `defineGame({...})` (`minDistance`, `maxDistance`, `targetHeight`, `rotateSpeed`, `zoomSpeed`, `dampingFactor`, smoothing) â€” defaults untouched means the feel was never checked; never hardcode camera position in `onTick` while a rig is active.

**Shared chrome:** extract repeated panel/slot styles into `ui/<theme>.ts` or `ui/components/<Frame>.tsx` â€” do not copy-paste three classes per file.

**Self-check before calling UI done** (against actual staged screenshots):

- [ ] Screenshot at 1080p: can you read every label without squinting?
- [ ] Could you mistake the unit frame and hotbar for the same component? If yes, redo.
- [ ] Every toggle shows its key on its own control â€” and no persistent controls legend anywhere?
- [ ] Every item/ability slot shows a real, distinct icon â€” no gray boxes, letters, or emoji?
- [ ] Do bolts visibly travel before damage lands?
- [ ] Only on-demand windows (backpack, log, social) have panel borders?
- [ ] Every declared system has its UI end state â€” quest â†’ tracker, cooldown â†’ sweep + timer, error â†’ floating text? A wired hook with no visual is half a system: finish it or cut it (see `jgengine`).
- [ ] Does the staged shot show the HUD *working* (target locked, cooldown mid-sweep, tracker populated), not resting-empty?
- [ ] Would a player think this is intentional art direction? If it looks like a debug build, it ships nothing.


