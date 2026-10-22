### Added

- `createEffectSystem` (`@jgengine/core/combat/effects`) takes `onDamage?(application)`: one `EffectDamageApplication` per target a draining effect lands on, before `onLethal` despawns it. It carries `target`, `source` (the effect's `from`), `effect`, `incoming`, `dealt`, `remaining` (the last pool's current) and `lethal`; restorative applications stay silent.

### Changed

- `ctx.scene.entity.effect` (including telegraph-bound and projectile effects) now raises exactly one `combat.damage` per target on `ctx.game.events`, with the same shape `createDamageRuntime` emits: `type` is the effect id, `remaining`/`lethal` come from the last pool in the catalog's `receive` order. `createDamageRuntime` keeps its own emission, so a game using both paths gets one event per blow, not two.
- `.claude/skills/jgengine-combat` says which damage path to use: the runtime for typed/zoned/armored damage, the effect path for catalog `receive` pools.
