### Changed

- `GrassField` partitions its existing seeded tuft stream into at most 64 shared-template draws. Each render camera skips offscreen or fully distance-faded chunks while preserving the density/budget prefix, transforms, material and shadow policy. Chunk geometries are disposed on replacement/unmount.

### Fixed

- Distance thinning now collapses blade width and wind displacement along with height. Fully faded blades vanish instead of leaving flat wind-displaced triangles; partially fading blades narrow, while `keep = 1` grass retains its existing appearance. `distanceFade: false` still disables distance rejection.
