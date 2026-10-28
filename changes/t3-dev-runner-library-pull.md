the editor's Asset library 'Add to game' and drag work in the shared dev runner (bun run drive): the runner serves library pulls for the game it hosts, and the pulled files join that game's asset list

Root cause: the runner serves many games from one origin and had no library-pull route, and a game's asset list was fixed when the game opened

Engine seam: packages/core/src/assets/assetBase.ts, packages/editor/src/EditorChrome.tsx, packages/editor/src/assetImport.ts

### Added

- addGameAssetFiles adds files to the running game's asset list after it was set

### Fixed

- the editor's Asset library 'Add to game' and drag work in the shared dev runner (bun run drive): the runner serves library pulls for the game it hosts, and the pulled files join that game's asset list
- a game quoting a makehuman: key gets it at provision time
