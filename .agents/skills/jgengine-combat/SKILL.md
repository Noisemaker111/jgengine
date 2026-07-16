---
name: jgengine-combat
description: Combat API: effects, projectiles, damage, abilities, loot, weapons.
---

# jgengine-combat

## Combat — effects, projectiles, death, feel, abilities

Combat primitives — effects & projectiles, death handling, melee/defense/telegraph feel, and abilities/resources/auto-target/resistance/run drafts. Full surface: **[reference.md](https://github.com/Noisemaker111/jgengine/blob/main/.Codex/skills/jgengine-combat/reference.md)**.

**One-shot rig animations.** A model's `animation.oneShots` (in `entityModels`) maps event names → clip name(s), played once over the locomotion `states` then released. `hit` and `death` auto-fire from the entity's own `combat.hitReaction` / `entity.died` (no wiring); trigger any other (e.g. `attack`) with `ctx.game.playEntityAnimation(instanceId, event)` when the swing lands. A `string[]` binding picks a random variant per trigger; `death` clamps on its final frame. Pairs with `animation.states` — the shell fades the loco state out for the clip and back in when it finishes (death holds the pose). Clip-selection logic is the pure `resolveOneShotClip` in `@jgengine/core/game/modelAnimation`.

## Spell / ability VFX

`ctx.scene.entity.vfx({ kind, color, from, to?, radius?, durationMs? })` emits a transient sprite-particle burst the shell auto-renders (mounted with the other world overlays — no setup). `from`/`to` take an instance id or a `[x,y,z]`; `color` is a `0xRRGGBB` number so games key it off their own school/element palette. Five archetypes: `projectile` (bolt travels `from`→`to`), `beam` (line `from`→`to`), `nova` (ring + burst at `from`, sized by `radius`), `glow` (aura pulse at `from` — heals/buffs), `spark` (impact scatter at `to` — melee). `durationMs` defaults per kind. Keep the school-color table in the game; map ability kind→archetype there.

```ts
const SCHOOL = { fire: 0xff7a2a, frost: 0x8ed2ff } as const;
ctx.scene.entity.vfx({ kind: "projectile", color: SCHOOL.frost, from: casterId, to: targetId });
ctx.scene.entity.vfx({ kind: "nova", color: SCHOOL.fire, from: center, radius: 8 });
ctx.scene.entity.vfx({ kind: "glow", color: SCHOOL.frost, from: healedId });
```

## Loot

```ts
lootTable({ id, rolls?, entries: [{ item? | currency? | generate?, count: n | [min,max], weight }] })
ctx.game.loot.register(table)        // in onInit
ctx.game.loot.has(id) / roll(id, rng?) / grantToPlayer(userId, drops, source?)
```

Tables colocate with their domain (`entities/enemies/loot-tables.ts`, `objects/loot-tables.ts`). Entities reference them via `onDeath.drops`; chests via a `loot.open` command arg. `grantToPlayer` fills declared inventories, grants currencies, and emits `loot.granted`.

**Procedural loot.** An entry's `generate` (instead of `item`/`currency`) rolls a runtime item instead of naming a static catalog id — the primitive behind "runtime-rolled items need a hand-rolled registry" (#536.1). `item/itemInstanceRegistry`'s `createItemInstanceRegistry<TDef>()` stores rolled instances behind a generated id (`"<prefix>:<baseId>:<n>"`); `proceduralLootEntry(registry, roll)` wraps any roller (e.g. `item/affix`'s `createAffixRoller`) into a `generate` callback. The game's `content.itemById` checks the registry for ids it doesn't recognize as static — inventories, loot rolls, and world-item drops then treat a generated id exactly like a catalog one, no parallel plumbing.

```ts
const registry = createItemInstanceRegistry<RelicInstance>("relic");
const rollRelic = proceduralLootEntry(registry, (rng) => {
  const rolled = affixRoller.rollRandom(RELIC_BASE, rng);
  return { baseId: rolled.baseId, def: { name: rolled.name, rarity: rolled.rarity, stats: rolled.stats } };
});
lootTable({ id: "drops_elite", entries: [{ generate: rollRelic, count: 1, weight: 6 }, ...] });
```

## Card, board & shaped-inventory primitives

