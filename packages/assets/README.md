# @jgengine/assets

Curated CC0 3D asset packs, catalogs, and download tooling for JGengine games.

## Why

JGengine ships with real 3D models from day one — no colored boxes as enemies, no flat grids as ground. The `@jgengine/assets` package gives you:

- **A starter catalog** of 80+ commonly needed models (rocks, trees, weapons, potions, crates, vehicles)
- **A download CLI** that pulls entire CC0 packs from Kenney.nl and organizes them by category
- **Typed manifests** so your IDE autocompletes asset keys

## Quick start

### 1. Download starter assets

```bash
npx @jgengine/assets init
```

This downloads ~5 Kenney starter packs into `./public/models/`:
- `kenney-nature` — rocks, trees, bushes, cacti, logs, mushrooms
- `kenney-weapon-pack` — swords, axes, bows, guns, shields, daggers
- `kenney-survival-kit` — potions, coins, keys, backpacks, lanterns
- `kenney-furniture-kit` — crates, barrels, beds, chairs, tables, shelves
- `kenney-food-kit` — apples, bread, cheese, fish, meat

### 2. Wire into your game

```ts
import { defineGame } from "@jgengine/core/game/defineGame";
import { createStarterCatalog } from "@jgengine/assets/catalogs/starter";

const assets = createStarterCatalog({ basePath: "/models" });

export const game = defineGame({
  name: "my-game",
  assets,
  // ... rest of config
});
```

### 3. Map entities to models

```ts
export const myGame: PlayableGame = {
  game,
  // ...
  entityModels: {
    player_default: "weapon/sword",
    goblin_grunt: "weapon/axe",
    forest_wolf: "nature/rock_small", // or any asset key
  },
};
```

Models take priority over sprites. If an entity has no `entityModels` entry and no `entitySprites` entry, the shell falls back to primitive shapes.

## CLI reference

### `init [dir]`
Download the starter set. Default output directory is `./public/models`.

```bash
npx @jgengine/assets init
npx @jgengine/assets init ./static/assets
```

### `pull <pack-id> ...`
Download specific packs.

```bash
npx @jgengine/assets pull kenney-space-kit kenney-car-kit
npx @jgengine/assets pull kenney-fantasy-town-kit --dir ./assets
```

### `list`
List all available packs.

```bash
npx @jgengine/assets list
```

## Starter catalog keys

The starter catalog registers assets under these category prefixes:

| Prefix | Examples |
|--------|----------|
| `nature/*` | `rock_large`, `rock_small`, `tree_pine`, `tree_oak`, `bush`, `grass`, `cactus_short`, `log`, `mushroom` |
| `weapon/*` | `sword`, `axe`, `bow`, `shield`, `dagger`, `spear`, `pistol`, `rifle`, `shotgun` |
| `item/*` | `potion_red`, `potion_blue`, `coin`, `chest`, `key`, `gem`, `scroll`, `book`, `apple`, `bread`, `meat` |
| `prop/*` | `crate`, `barrel`, `campfire`, `tent`, `fence`, `sign`, `lantern`, `bed`, `chair`, `table` |
| `building/*` | `house_small`, `house_large`, `tower`, `wall`, `door`, `well` |
| `vehicle/*` | `car_sedan`, `car_police`, `truck`, `van`, `boat_small`, `boat_large` |

## License

All Kenney assets are [CC0 (public domain)](https://creativecommons.org/publicdomain/zero/1.0/). No attribution required. Commercial use allowed.

This package code is AGPL-3.0-only.
