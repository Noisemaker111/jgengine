### Added

- `ModelConfig.hiddenNodes` and `useModelInstance` support per-instance named visual subtree selection before placement measurement, retaining imported rigs, clips, textures and cached source visibility. Missing or ambiguous names warn without hiding arbitrary nodes; malformed lists reject before model or texture allocation. Changing the selection replaces only that instance, while equivalent list contents retain its clone.
