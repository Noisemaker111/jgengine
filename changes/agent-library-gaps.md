### Added

- Model library grows to 88 entries: 13 rigged Microsoft Rocketbox humans (MIT; casual, business, police, worker, guard, jogger, nurse, soldier) with Idle/Walk/Run/Talk clips, 10 Rocketbox animals, a Khronos CarConcept sports car (CC-BY 4.0, logos removed), four Poly Haven trees (jacaranda, fir and pine saplings, large quiver tree) and engine-built `scifi/server-rack` and `scifi/robot-arm`.
- `assets pull` converts Rocketbox FBX to GLB in Bun (`pullRocketboxModel`), pulls Khronos samples with logo scrubbing and builds authored models (`buildAuthoredModel`); every file is checked against its source's hash.
- `thinIslands` and the Poly Haven origin's `thin` / `error` options make multi-million-triangle tree scans usable (jacaranda: 118k / 53k triangles, 2.7 MB).
- `imageCodec`: TGA and PNG decode, PNG and JPEG encode, box downscale, Git blob sha.
- `facade/glass-curtain` (ambientCG Facade006): glass curtain wall with aluminium mullions and spandrels, 28 m tile.
