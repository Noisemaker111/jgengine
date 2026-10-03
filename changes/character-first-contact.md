### Fixed

- PhysicsWorldBackend capsule casts allow separating or tangent motion from machine-scale starting contact, so a valid character proportion can jump and move on its first authored-floor frame. Entering contact, real overlap, walls and ceilings still block movement; the numerical tolerance scales with the struck face's world coordinate.
- Headroom overlap checks use the same numerical contact tolerance, allowing a restored crouched character at exact floor height to stand and jump immediately while retaining real penetration and low-ceiling blocking.
