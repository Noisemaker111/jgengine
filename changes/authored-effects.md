### Added

- Named particle emitters reuse the existing director, pooled simulation, and shell renderer. Start/stop preserves live particles; burst, seed, bindings, and output remain retunable and serializable. Capacity checks reject standing-emitter overflow explicitly.

- Disc, sphere, and cone spawn volumes compose with the shared force-field sampler. Explicit environment influence shares live wind and physical field envelopes; cosmetic pools follow simulation pause and time scaling. Particle collisions use bounded scene queries and consume-once cosmetic events; bounded child impacts cannot recurse. Graphics settings cap visual pools without changing physical authority.

- The existing renderer supports instanced streaks, flakes, flames, smoke, ribbons, and ground ripples alongside point output. Caller-selected projectile and flock models follow authoritative simulation positions; their existing model owner handles animation and cleanup. Habitat gameplay actors remain game-owned.
