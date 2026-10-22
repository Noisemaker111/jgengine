### Added

- `createWeaponSystem` (`@jgengine/core/combat`) runs one `WeaponDefinition`: single, automatic or burst fire, hitscan or ballistic projectiles, recoil that moves the aim the shot flies down, spread bloom, interrupted/resumed reloads, a readable ammo economy (`ammo()`, `stats()`), `snapshot()`/`restore()` and a devtools probe. Every hit, hitscan or projectile, resolves through `createDamageRuntime`. Pellet work is bounded per tick (`maxShotsPerTick`, default 4) and per weapon (`maxInFlight`, default 32).
- `WeaponDefinition` (`@jgengine/core/combat/weaponDefinition`) as plain JSON — rate, fire mode, delivery, magazine, handling, damage, falloff — with `assertWeaponDefinition`, `weaponIntervalMs`, `weaponDamageAt` and `weaponMaxInFlight`. A generated gun is the same shape.
- `Magazine.pauseReload()` / `resumeReload()` / `isPaused()` suspend a reload and keep its progress; a paused reload is not `isReloading()`, does not advance in `tick`, and round-trips through `snapshot()`/`restore()`.

### Changed

- `MagazineSnapshot` gains an optional `paused: true` field, present only while a reload is suspended, so existing snapshots and idle shapes are unchanged.

### Numbers

- Test fixture at 600 rpm, 30-round magazine: 2.9 s to empty; 17.0° pitch and 3.1° yaw climb over the magazine; back to half climb in 0.37 s and within 5% in 0.6 s; bloom 2.0 → 8.0 → 12.0 mrad (cap) by the tenth shot, settling to base 0.63 s after the last shot.
- A hitscan and a projectile contact at the same distance return the same damage (20 body, 30 on a 1.5x head zone) through one damage model; a 60 m/s projectile crosses 20 m in 0.33 s and drops 2.45 m in 0.5 s at 9.81 m/s².
