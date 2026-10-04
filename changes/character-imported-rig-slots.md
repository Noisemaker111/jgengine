### Fixed

- Resolve imported attachment slots by a unique original authored name when GLTFLoader sanitizes the runtime name, including `handslot.r` on the supported Knight and Rogue Hooded rigs. Exact runtime names retain priority; missing or ambiguous references report repair guidance instead of attaching to an arbitrary node.
- Explicit foot-IK joint, pelvis and look-at names use the same original-name fallback. Knight and Rogue authored leg chains retain the same walking corrections as their runtime-name configurations; ambiguous, disconnected and overlapping chains still warn and are skipped.

### Added

- `resolveRigNode` (`@jgengine/shell/render/rigNode`) resolves an instance's bone or Object3D slot by unique runtime/original imported name with structured diagnostics. Resolve once per model/slot change, preserving animated hierarchy, local offsets and clone isolation.
