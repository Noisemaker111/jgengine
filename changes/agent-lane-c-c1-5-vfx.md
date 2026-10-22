### Added

- `EFFECT_LIBRARY` and `resolveEffect` (`@jgengine/core/vfx/effectLibrary`) name 24 GPU particle effects — fire, smoke, sparks, dust, splashes, muzzle flash, explosions, magic and weather — each authored as rate, lifetime, size, colour and a procedural sprite texture, so `ctx.particles.play("explosion/core", { position })` renders one by name and the editor authors the same name.
- `ctx.particles.play(name)` and `ctx.particles.attachEffect(id, name)` (`@jgengine/core/vfx/particleDirector`) play a library effect by name; `effectNames()` lists them.
- `planParticleBudget` (`@jgengine/core/vfx/particleBudget`) caps the live particle count to a graphics tier and drops whole effects lowest-priority-first when the request does not fit.
- `GraphicsProfile.particleBudget` is the tier's scene-wide live particle cap (low 1024, medium 2048, high 4096, ultra 8192); `particleCap` stays the per-effect pool clamp.
- `AuthoredEmitter.effect` (`@jgengine/core/editor/simulation`) authors a named library effect in `editor.scene.json` instead of a full config; `config` is now optional and exactly one of the two is required. `SimulationInspector` gains an effect picker.

### Changed

- `WorldParticles` allocates the tier's `particleBudget` across the standing emitters and queued bursts with `planParticleBudget`, and reports `cap`/`budgetParticles`/`droppedIds` on its `particles` diagnostics probe.
