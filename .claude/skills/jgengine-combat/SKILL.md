---
name: jgengine-combat
description: Compose targeting, stats, damage, effects, abilities, and rewards.
---

# JGengine combat

## Ownership

This skill owns combat resolution: target policy, combat stats, teams/factions as combat inputs, effects, damage/healing, projectiles, abilities, cooldowns, death/downed state, encounters, and reward/loot resolution. Movement and perception live in `jgengine-world`; inventory/economy state lives in `jgengine-gameplay`.

Search [capabilities.md](capabilities.md), then use [api.md](api.md) for signatures and [reference.md](reference.md) for complete pipelines.

Existing projects keep their resource state and follow the
[portable stat-pool recipe](recipes/portable-stat-pools.md). Adapt the caller's
store through `StatPoolAccess`; do not require `StatValueMap`, `GameContext`, or
a parallel entity store. To bolt firing onto an existing game, compose
`createWeaponRuntime` (cadence + magazine + the caller's own raycast + portable
`resolveDamageHit`) per the
[portable weapon-plumbing recipe](recipes/portable-weapon-plumbing.md); never add
a default gun or FPS kit.
For a weapon that is plain data — fire mode, rate, delivery, magazine, recoil and
spread, damage — hand the definition to `createWeaponSystem`
(`combat/weaponSystem`): it runs single/auto/burst, hitscan or ballistic
projectiles, interrupted reloads and a readable ammo economy, and resolves both
deliveries through `createDamageRuntime`. Generated guns (rolled parts) are the
same `WeaponDefinition`: `loot/lootGen` rolls the item and `loot/lootWeapon`'s
`lootWeaponDefinition` maps its stats onto one, so no second weapon type exists;
see
[reference.md](reference.md#weapons-as-data).
For scene-backed `createProjectileSystem`, inject authoritative `rng`; spread
samples independent pellet rays and prediction stays on the center ray. The
weapon-plumbing recipe covers the bounded cone and cover contracts.
When a weapon is not a gun — grenade, mortar, arrow, hitscan explosive — state
how the shot travels and what it does on contact as one `ShotSpec`
(`combat/shotSpec`) and pass it as `ProjectileShotInput.spec`, or read
`resolveShotSpec` yourself. Delivery is `delivery.kind` ("trace" or "body") and
nothing else decides it; a splash, damage or falloff field never makes a shot
travel. A new weapon is a few fields, not a code path, so never branch combat
code on a weapon id or add a second classifier.
Tune how a weapon feels (recoil, bloom, ADS, shake and rumble) with the
[weapon-feel recipe](recipes/weapon-feel.md): feel target → `measureWeapon`
numbers → handling knobs, and `createWeaponFeedbackSignals` into the feedback mixer.

Damage commitment accepts the same structural pool adapter while the matchup,
receiver, interceptor, and status stages remain pure. Follow the
[portable damage/effects recipe](recipes/portable-damage-effects.md) to compose
them over an existing store, clock, RNG, spatial index, and death flow.
Damage types × resistance, the armor curve, hit-zone crits and carried statuses
compose through `createDamageRuntime` (`combat/damageRuntime`): a readable table,
time-to-kill quotes, and status ticks that follow the declared stack rule. It
snapshots/restores as plain data; see
[reference.md](reference.md#damage-runtime-armor-crits-and-statuses).
Both damage paths raise `combat.damage` on `ctx.game.events`, one event per target
application: the runtime with the table `type`, and `ctx.scene.entity.effect` with
the effect id as `type` and `remaining` read from the last pool in the receive
order. Use the runtime for new damage that needs types, zones or armor; keep the
effect path for games that already drain `receive` pools. Neither delegates to
the other, so a hit never raises the event twice.

Closure-backed magazines expose snapshot/restore and `retune` for capacity/reload
changes without reconstructing ammo state; capacity overflow is explicit.
`pauseReload`/`resumeReload` suspend a reload and keep its progress, so a
sprint or a weapon swap can interrupt one and continue it; a paused reload is
not `isReloading()` and does not advance in `tick`.
Stat modifiers expose snapshot/restore; ability
kits, shields, and meters expose state/restore for caller-owned saves,
rollback, replay, and workers. Follow the
[portable runtime-state recipe](recipes/portable-runtime-state.md); the caller
keeps its clock, reserve state, schema, and authority.

## Canonical pipeline

1. Acquire eligible candidates from a bounded spatial source.
2. Select a target through caller-owned policy and deterministic tie-breaking.
3. Validate costs, cooldowns, range, visibility, and authority.
4. Resolve typed effects through ordered, inspectable stages.
5. Apply damage/healing/status transitions and emit provenance-rich events.
6. Resolve death/downed and rewards separately from the hit itself.

Enemy squad AI is a consumer of that pipeline, not a parallel one: `createSquadCombat` (`combat/squadCombat`) picks cover from authored geometry by remembered threat, flanks by role, holds fire discipline, pins under suppression and falls back when hurt, while `engage` hands each paced shot to your damage resolution and `underFire` feeds the hit back in. Cover, roles and threat all live in [reference.md](reference.md#enemy-squad-ai).

Compose stages through registration/policy seams; adding a damage type, effect, target policy, or reward strategy must not add a central engine branch.

Weapon feel sits beside the pipeline, not inside it. `createWeaponHandling` (`combat/weaponHandling`) owns recoil pattern, camera kick versus aim kick, recovery, spread bloom, stance and ADS multipliers, and ADS time, all as serializable state. `weaponFire`/`magazine` own cadence and ammo, and call `fire()` on each shot. Sample the shot cone from `fire().spread`, add `tick().aimPitch/aimYaw` to the aim, and send `cameraPitch/cameraYaw` to the view. Two weapons differ by numbers in radians and seconds; assert them with `measureWeapon` (first and tenth shot spread, climb, reset time, ADS time, time-to-kill). To present it, return the frame from `camera.weapon` with a `createWeaponPresentation` tuning (`combat/weaponPresentation`); the first-person and shoulder rigs pose the viewmodel and camera from that one frame, and third-person code reads `aimPitch`/`aimYaw` from the same pose.

## Traps

- Stats are named caller data; the engine does not privilege genre attributes.
- Visual projectiles/VFX do not own authoritative hit resolution.
- Random rolls accept injected RNG and stable seeds.
- Interceptors record why values changed; hidden callbacks make outcomes unauditable.
- Reward generation and allocation are different operations, especially in multiplayer.
- Compose multiple loot pools with `createLootPipeline` (ordered stages, gates, fallbacks, roll modifiers, per-drop provenance) over `lootTable`; keep genre concepts (world/dedicated/boss/luck/pity) in game-space stages and modifiers, never in core.
- UI bars, reticles, and feedback route to `jgengine-ui`.
