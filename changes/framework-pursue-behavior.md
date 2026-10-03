### Added
- `pursue` behavior data schedules bounded target acquisition, solid-aware chase, cooldown effects and return to spawn through the existing behavior lifecycle; optional threat uses the shared threat table.

### Changed
- GameContext lazily persists pursuit home, targets, cooldown, scheduling, threat and lifecycle state in `pursuitBehaviors`, including cold save/reload and AOI replication. Legacy snapshots without this module remain accepted.

### Fixed
- Same-ID behavior updates and warm hydration reconcile changed/removed descriptors before subscribers without scanning the world; equal-data updates retain progress and lifecycle. EntityStore exposes `subscribeBehaviors`, and replaced running decision graphs release existing action ownership through an explicit exact-once `abort` lifecycle method.
- Warm pursuit-module hydration reuses the keyed behavior cache; cold initialization keeps its initial entity discovery.

### Migrate
- Consumers asserting an exact GameContext snapshot key set should include the always-on `pursuitBehaviors` key; empty worlds contain `{ version: 1, instances: [] }`. Replace game-local pursuit/home/cooldown maps with the descriptor when its direct movement and target policies match the game.
