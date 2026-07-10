# jgengine-api — Cartridge

Reference module for the [`jgengine-api`](../SKILL.md) skill. Load this when building a game as a **cartridge** — one declarative config instead of hand-wired loop/state/UI files. A cartridge game is ~75% smaller than the classic shape and nearly all of it is data; reach for `defineGame` directly only when the game's simulation doesn't fit the cartridge archetypes even through the escape hatches.

## Why

Across the classic games, 78–91% of each game's LOC was generic wiring restated per game: a run-state store with subscribe/notify, chase-and-contact enemy loops, auto-fire weapon routines, magnet pickups, draft plumbing, phase-gated HUD trees, and tests for all of it. The cartridge layer owns every one of those; the game ships only its **data** (catalogs, tuning, layout) and any genuinely bespoke rules through typed escape hatches.

## Shape

`game.config.ts` is the whole game — `cartridge({...})` from `@jgengine/shell/cartridge` compiles the config into a `PlayableGame` (validating it first — a bad reference throws at import with a list of problems). `loop.ts` and `world.ts` disappear; the spec carries the world feature and the loop is engine-owned. `main.tsx` is 5 lines via `mountGame` (`@/components/ui/mount`, registry). Sprites/SVG art stay in `src/game/assets.ts`; the game keeps one test file under `src/game/`.

```ts
import { cartridge, type CartridgeConfig } from "@jgengine/shell/cartridge";
import { standardCartridgePanels } from "@/components/ui/cartridge-panels";

export const config: CartridgeConfig = {
  name, seed, panels: standardCartridgePanels, assets, entitySprites,
  player: { kind, health, walkSpeed },              // compiled into content + spawned per player
  enemies: { id: { label, health, walkSpeed, xp, contact: { damage, intervalSeconds } } },
  combat: { contactRadius },
  spawning: { director: SpawnDirectorConfig, placement: { kind: "ring", radius } },
  weapons: { id: { kind: "projectile" | "orbit" | "pulse" | "custom", damage, cooldownMs, maxLevel, ... } },
  progression: { xp: Curve, maxLevel, draft: { choices, upgrades } },
  fields: { magnetRadius, damageMultiplier },       // named run-scalars upgrades mutate
  xpGems: { collectRadius, pullSpeed, rarityThresholds, defaultRarity },
  rules: { win: { kind: "survive", seconds }, lose: { kind: "playerDeath" }, killLeaderboardStat },
  world, physics, camera, worldItem, theme, hud, screens,
};
export const game = cartridge(config);
```

## Core surface (`@jgengine/core/cartridge/`)

- `@jgengine/core/cartridge/spec` — the `CartridgeSpec` types, `Leveled` values (`number | { base, perLevel, min?, max? } | { table }` resolved by `leveled(value, level)`), `WASD_KEYBINDS` (the default when `input` is omitted).
- `@jgengine/core/cartridge/runtime` — `createCartridge(spec)` → `{ content, loop, run(ctx), weaponKit(ctx), chooseUpgrade(ctx, offerId) }`. Owns the run store (outcome/kills/fields/weapon levels, subscribe/notify), spawn director advance + ring placement, chase + contact-damage enemies (terrain-grounded), the three weapon archetypes with auto-targeting, magnet xp-gem pickups feeding `leveling()`, pause-and-draft level-ups, kill → gem drop + leaderboard, and win/lose rules.
- `@jgengine/core/cartridge/validate` — `validateCartridge(spec)` → problem list: spawn waves must reference declared enemies, upgrades must reference declared weapons/fields, stacks can't exceed weapon `maxLevel`, tuning must be positive, rarity thresholds descending. The game's test asserts it returns `[]`.

Weapon archetypes: `projectile` (auto-target nearest in `range`, travel-time bolt fx), `orbit` (leveled blade count/radius sweeping `hitRadius`), `pulse` (radial AoE with linear falloff and an expanding-ring fx). Upgrade effects: `weaponLevel` (+1 level per stack), `statBonus` (+max and +current on pick), `fieldAdd` / `fieldMultiply` (recomputed from stacks). Weapon damage is multiplied by the `damageMultiplier` field when declared.

## Presentation (shell + registry)

`hud.panels` is a schema — items `vital | xp | timer | score | abilityBar | component`, anchored via the movable HUD layout; `screens.win/lose` render the results/death screens; the upgrade-draft modal appears whenever a draft is pending. The shell renders the frame and injects concrete components through the `panels` seam — `standardCartridgePanels` (registry `cartridge-panels`) binds the jgengine UI kit; swap any binding for a custom component without touching the engine. Weapon fx render engine-side from the run store's bolt/pulse feeds (`fxColor`/`fxEmissive` per weapon). `theme` is the `--jg-*` CSS var block — hand-pick it or derive from a few seed colors with `deriveJgTheme` (registry `jg-theme`).

## Escape hatches — bespoke logic without leaving the cartridge

- `weapons.<id> = { kind: "custom", fire(ctx, run, args) }` — cooldown/level/damage handled for you; the fire shape is yours.
- `spawning.placement = { kind: "custom", position(ctx, run) }`.
- `rules.win = { kind: "custom", check(ctx, run) }`.
- `progression.draft.upgrades[].effect = { kind: "custom", apply(ctx, run, stacks) }`.
- `systems: [(ctx, run, dt) => ...]` — extra per-tick simulation after the built-ins, only while playing.
- `hud` items `{ kind: "component", Component }` — arbitrary React panels alongside the schema ones.

A game that is *mostly* bespoke simulation (custom physics, session machines) should keep `defineGame` and write its systems — the cartridge is for games whose shape the archetypes already cover.

## Testing

Cartridge behaviors are engine-tested once (`packages/core/src/cartridge/runtime.test.ts`); the game test is thin: `validateCartridge(config)` is `[]`, `summarizeEnvironment(config.world)` assertions, and one headless smoke via `createCartridge(config)` + `createGameContext` ticking the loop — see `Games/swarm-survivor/src/game/cartridge.test.ts`.
