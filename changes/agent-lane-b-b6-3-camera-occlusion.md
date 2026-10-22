### Added

- `clearCameraBoom` (`@jgengine/shell/camera`) answers where a camera can sit without entering world collision: the desired position is rejected when the boom hits a surface, and the camera is placed one `clearance` before it. Pulling in is immediate, easing back out follows `releaseRate`, so a boom reads as a spring arm rather than a hard stop. `sceneCameraQuery(ctx.scene.raycast)` feeds it the existing world solids, object colliders and walls — no new collision layer — and any other hit query can be passed instead.
- `FirstPersonCameraConfig.collision` (`{ clearance?, armBack? } | false`) keeps the `first` rig's eye out of the trunk or wall the body can reach. On by default; `false` restores the unchecked camera.
