### Added

- Hit markers (`presentationEffects.hitMarkers`, default on): when the local player's attack damages something, a tick flashes over the spot hit, larger and red on a kill. It marks the hit itself, so it works with cursor aim and crosshair aim.
- Muzzle flashes (`presentationEffects.muzzleFlash`, defaults to the `tracers` setting): a 55 ms star where each direct-fire shot leaves the gun hand, barrel or first-person gun. Reduced motion makes it smaller and dimmer.
- `render/shotFeedback` devtools probe counts hit markers, kills and flashes.
