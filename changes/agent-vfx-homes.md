Particles and VFX live in one folder per layer, and the particle budget has one planner.

### Migrate

- `@jgengine/core/game/vfxInstance` → `@jgengine/core/vfx/vfxInstance`.
- Shell VFX moved from `world/` to `vfx/`: `@jgengine/shell/world/WorldParticles` → `@jgengine/shell/vfx/ParticleEmitters` (component `WorldParticles` → `ParticleEmitters`), `@jgengine/shell/world/WorldVfx` → `@jgengine/shell/vfx/SpellVfx` (component `WorldSpellVfx` → `SpellVfx`), `@jgengine/shell/world/RetainedVfx` → `@jgengine/shell/vfx/RetainedVfx`.
- `resolveParticleBudget` is gone. Pass the tier's per-effect cap to `planParticleBudget(entries, cap, { effectCap })` (`@jgengine/core/vfx/particleBudget`), which clamps each request to it before sharing the total out.

### Added

- `planParticleBudget` takes `{ effectCap }`: each request is clamped to it, an entry with no `requested` takes the whole effect cap, and every clamped request keeps at least one particle. An `Infinity` total cap admits every request.
