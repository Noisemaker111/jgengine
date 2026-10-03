### Added

- `registerFirstPersonMuzzle(camera, reader)` supplies a custom rig's live presentation muzzle with camera isolation, bounded reader work, and owner-scoped cleanup.

### Fixed

- First-person tracers can start at a custom world-overlay weapon's real muzzle even when the stock viewmodel is disabled. Stock muzzle tracking is camera-scoped; authoritative projectile origins remain unchanged.
