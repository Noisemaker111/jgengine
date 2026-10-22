### Added

- `createDamageRuntime` (`@jgengine/core/combat/damageRuntime`) announces every damage application as `combat.damage` on the game's own event bus: `target`, `source`, `type`, `amount`, `absorbed`, `remaining`, `lethal`, plus `status` for a status tick. Pass `events: ctx.game.events` and `healthOf` (the target's live health, read before you apply it) so a HUD can name the blow and tell whether the target died; without `healthOf` the event reports `remaining: null` and `lethal: false`. `recentDamage(limit)` and the devtools probe line carry the same stream.
- `StatusDamageTick.source` (`@jgengine/core/combat/statusRuntime`) names who applied the status that is ticking, so a burn names its arsonist.

### Changed

- `EntityDiedEvent.source` and `DeathReason` name what killed the entity: a `player_kill`'s `source` is the killer's instance id, and an environment death carries `attacker` for a non-player entity. `deathReasonFromEffect` fills both from the effect's `from`. Reading an existing environment reason keeps working; a rule that matched `kind` still matches.
