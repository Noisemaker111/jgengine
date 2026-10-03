### Added

- `Magazine.retune` changes capacity and reload duration while preserving ammo, shared reserve storage, and elapsed reload time; capacity overflow defaults to atomic rejection with explicit discard/return policies.
- `ProjectileSystemDeps.rng` supplies deterministic per-pellet spread sampling; `maxPellets` bounds ray work (64 by default, configurable up to 256).

### Fixed

- Scene-backed projectile spread now samples independent cone rays, each respecting its own nearest receiver, hitboxes, line of sight, and cover. Zero-spread pellets hit the nearest receiver instead of cycling through center-ray targets; center-ray prediction and ballistic paths remain unchanged.
- Projectile firing copies angular aim, explicit ray vectors and selected origin-policy vectors before injected RNG runs; caller reuse cannot redirect delayed settlement.
