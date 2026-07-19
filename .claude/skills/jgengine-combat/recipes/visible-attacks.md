# Recipe — make an attack you can actually see

**Seam:** authoritative hit resolution (`applyEffect` / `fireProjectile`) ↔ the one-shot
`combat.vfx` visual the shell renders. They are deliberately separate: **resolving damage
never draws anything on its own.** If you call `applyEffect`/`fireProjectile` and "nothing
happens on screen," you have the hit but not the picture — emit a `vfx` burst next to it.

The easy path is a named **preset**, so you never hand-pick a `VfxKind` or a hex color.

## The one line

```ts
import type { GameContext } from "@jgengine/core/runtime/gameContext";

// caster and enemy are entity instance ids (the shell follows their live pose)
function shootArrow(ctx: GameContext, caster: string, enemy: string): void {
  ctx.scene.entity.vfx({ preset: "arrow", from: caster, to: enemy });
}
```

That renders a visible bolt traveling from the caster to the enemy. Swap the flavor for the
attack you want — the vocabulary already covers the usual suspects:

| Want | `preset` | Archetype |
| --- | --- | --- |
| arrow / bolt / bullet | `"arrow"`, `"bolt"`, `"bullet"` | traveling `projectile` |
| fire / ice / poison / arcane spell | `"fireball"`, `"firebolt"`, `"frostbolt"`, `"poison"`, `"arcane"`, `"shadowbolt"`, `"holybolt"` | traveling `projectile` |
| lightning / laser / web / chain | `"lightning"`, `"laser"`, `"web"`, `"chain"` | connecting `beam` |
| sword swing / melee hit | `"slash"`, `"sword"`, `"melee"`, `"hit"` | impact `spark` |
| explosion / shockwave | `"explosion"`, `"blast"`, `"shockwave"`, `"frostNova"` | ground `nova` |
| heal / buff / shield aura | `"heal"`, `"buff"`, `"shield"`, `"cast"` | lingering `glow` |

Full list lives in `vfxPresets` (`@jgengine/core/combat`).

## Wiring it to a real projectile attack

`fireProjectile` returns a shot id; `settleProjectile` resolves the hit. Fire the visual when
you fire the shot so the bolt is in flight while it travels, then settle to apply damage:

```ts
function fireAt(ctx: GameContext, caster: string, enemy: string): void {
  const shot = ctx.scene.entity.fireProjectile({
    from: caster,
    via: { item: "shortbow" },
    aim: { yaw: 0, pitch: 0 },
    effect: "arrow-hit",
  });
  ctx.scene.entity.vfx({ preset: "arrow", from: caster, to: enemy }); // <- the picture
  ctx.scene.entity.settleProjectile(shot);                            // <- the damage
}
```

For a melee swing there is no projectile — just resolve the effect and flash the spark:

```ts
ctx.scene.entity.effect({ from: caster, to: enemy, effect: "cleave" });
ctx.scene.entity.vfx({ preset: "slash", from: caster, to: enemy });
```

## Overrides and custom bursts

Any field on the call wins over the preset, so you keep the archetype but retint it:

```ts
ctx.scene.entity.vfx({ preset: "fireball", color: 0x00ff88, from: caster, to: enemy });
```

Skip `preset` entirely and pass `kind` + `color` for a fully bespoke burst. A **misspelled**
flavor still shows a `spark` rather than nothing, so a typo never silently drops the effect.

When you need the raw numbers — e.g. to seed a long-lived `vfxInstance` beam from the same
vocabulary — call `resolveVfxPreset("lightning")` and read `{ kind, color, durationMs?, radius? }`.

## Don't

- Don't expect `applyEffect`/`fireProjectile`/`settleProjectile` to draw a visual — they are
  headless authority. The `vfx` call is what the player sees.
- Don't put damage numbers in a preset. Presets are colors and shapes; combat values live in
  your effect/ability data.
- Don't disable presentation and wonder where the effect went: `presentationEffects` is on by
  default, but if a game passes `presentationEffects: { vfx: false }` the burst won't render.
