### Added

- Optional live travel in `createProjectileSystem` captures launch pose, applies injected environmental acceleration with per-shot response, target masks and force caps, sweeps each authoritative segment, and settles hits, range misses and lifetime expiry once. Active poses and detached snapshot/restore support caller rendering and replay; active and retained-shot budgets bound work and memory. Settlement reports and `projectile.settled` events carry the matching `shotId` and detached actual effect results so game policy can run after contact. Legacy immediate settlement remains available.
- Shared `physics/forceVolume` sampling covers signed sphere/box attraction, directional forces, independently tuned vortex spin and axial lift, attenuation, target masks and caps without renderer state. Authored physical fields and cosmetic particles reuse the sampler.

### Fixed

- Ballistic sweeps now test complete segment chords, so thin cover between samples blocks projectiles. Translating sphere/box sweeps handle targets crossing a projectile path between endpoint poses; authored cover uses centerline projectiles, with radius-aware collision available through an injected sweep.
- Headless, hosted and shell authority integrate player movement with scaled game time and retain queued motion while paused or at zero timescale. Fixed owners opt into full authoritative durations for normal, voxel and free-flight movement; standalone movement retains its historical frame clamp. Explicit hosted client prediction retains its input-step duration.

- Fixed-step movement now uses scaled game seconds without the standalone browser-frame clamp; pause keeps queued motion and leaves physics unchanged.
- Settlement events include matching shot IDs and detached actual effect results, so game-owned policies can settle once on the struck target.
