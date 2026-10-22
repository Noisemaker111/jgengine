### Fixed

- The player shell re-renders only for the ctx slices it reads — the possessed entity and the touch control mode — instead of on every `ctx` write. Subscribing the shell root to the raw ctx version reconciled the canvas, the whole actor tree and the HUD on each per-frame entity pose write, which is what `subscribeMembership` and the markers' imperative `useFrame` pose reads exist to avoid (#625). Scrap Signal: 86.6 ms → 16.7 ms per frame at the same 621 draws; Harbor Heat: 102.8 ms → 46.2 ms at the same ~7.2k draws.
