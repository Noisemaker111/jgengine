---
name: jgengine-combat
description: Combat API: effects, projectiles, damage, abilities, loot, weapons.
---

# jgengine-combat

## Combat — effects, projectiles, death, feel, abilities

Combat primitives — effects & projectiles, death handling, melee/defense/telegraph feel, and abilities/resources/auto-target/resistance/run drafts. Full surface: **[reference.md](https://github.com/Noisemaker111/jgengine/blob/main/.claude/skills/jgengine-combat/reference.md)**.

## Loot

```ts
lootTable({ id, rolls?, entries: [{ item? | currency?, count: n | [min,max], weight }] })
ctx.game.loot.register(table)        // in onInit
ctx.game.loot.has(id) / roll(id, rng?) / grantToPlayer(userId, drops, source?)
```

Tables colocate with their domain (`entities/enemies/loot-tables.ts`, `objects/loot-tables.ts`). Entities reference them via `onDeath.drops`; chests via a `loot.open` command arg. `grantToPlayer` fills declared inventories, grants currencies, and emits `loot.granted`.

## Card, board & shaped-inventory primitives

