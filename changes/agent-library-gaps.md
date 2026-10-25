### Added

- Model library grows to 88 entries: 13 rigged Microsoft Rocketbox humans (MIT; casual, business, police, worker, guard, jogger, nurse, soldier) with Idle/Walk/Run/Talk clips, 10 Rocketbox animals, a Khronos CarConcept sports car (CC-BY 4.0, logos removed), four Poly Haven trees (jacaranda, fir and pine saplings, large quiver tree) and engine-built `scifi/server-rack` and `scifi/robot-arm`.
- `assets pull` converts Rocketbox FBX to GLB in Bun (`pullRocketboxModel`), pulls Khronos samples with logo scrubbing and builds authored models (`buildAuthoredModel`); every file is checked against its source's hash.
- `thinIslands` and the Poly Haven origin's `thin` / `error` options make multi-million-triangle tree scans usable (jacaranda: 118k / 53k triangles, 2.7 MB).
- `imageCodec`: TGA and PNG decode, PNG and JPEG encode, box downscale, Git blob sha.
- `facade/glass-curtain` (ambientCG Facade006): glass curtain wall with aluminium mullions and spandrels, 28 m tile.

### Fixed

- Quantized glTF meshes (meshopt / `KHR_mesh_quantization`) no longer collapse into boxes when merged or baked into crowds: attributes are converted to float before transforms.
- Crowd bakes no longer render people black: Rocketbox pulls drop the unused vertex colours and the crowd material turns `vertexColors` off.
- Khronos pulls bake transmission glass into plain alpha glass and zero the emissive factor when the emissive map is removed (no more white-glowing tyres).
- Road collision follows live road sources: `resolveEnvironmentField` rebuilds the road drape when the roads change, so ground under re-laid streets stays right.
