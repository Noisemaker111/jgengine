### Fixed

- Capsule movement uses the same resolved timestep as its shared jump integrator: standalone stalled frames retain the movement clamp, while authoritative game-time steps integrate in full. Game position callbacks still receive their original frame timestep.

- Supported crouch input now overrides sprint and suppresses jumping. Capsule standing waits for headroom; `CharacterController.setCrouch` preserves standing and jumping on the same frame.
- Physics-backed capsules share heightfield jump buffering, coyote grace, release shaping, apex/fall gravity and landing recovery. Legacy held-jump saves retain their latch.
- Resolved movement feel and gravity/jump tuning follow live declaration getters without resetting movement state.
- Automatic stair stepping requires grounded motion. Near-contact ground casts maintain the configured capsule skin gap.
- Rapier ramps preserve collider surface normals without stair forgiveness. Character casts exclude the character before choosing a blocker, so its own collider cannot hide a wall.
