### Fixed

- Games on the `rts` and `topDown` camera rigs hear positional sound again. The spatial-audio listener sat at the camera, 35–50 m above the ground, so the default 24 m falloff silenced every ground event even at screen centre; for these rigs it now sits where the camera looks at the ground. Chase, first-person and other rigs keep the camera-anchored listener.
