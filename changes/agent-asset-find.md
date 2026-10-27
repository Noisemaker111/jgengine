One command answers every model a game needs: `jgengine assets find raptor "street lamp" knight --game games/<name>` (or `--list names.json`) prints one JSON document with each name's best matches across catalog packs, the realistic library and models other games already ship, each with licence, the URL the game loads and whether it is on disk, plus free sources to search when nothing fits. `--provision` puts the picks into the game.

Engine seam: packages/assets/src/findAssets.ts, packages/assets/src/cli/find.ts, packages/assets/src/assetStore.ts

Prevention: findAssets tests (a library request ranks the lamp at 100 and a tree sharing one word below the confident line; a pack model carries its licence, URL and on-disk state; another game's file is found and a game's copy of a catalog file is offered as the catalog model; an uncovered request names Poly Pizza and Poly Haven with the search filled in; a library gap comes back), find CLI tests (list parsing, the pick rule, and `--provision` in a scratch checkout linking a stored pack, copying another game's file and skipping a name with no confident match), and a store test for pulling only what no checkout has.

Bends: none

### Added

- `assets find <name>... [--list <file.json>] [--game <dir>] [--provision] [--limit N]` (also `jgengine assets find`): one JSON document per run. `--list` takes a JSON array of names or `{ "query", "pick" }`. `--provision` serves each confident top match, or the named `pick`, to the game: packs and library models through the machine's shared asset store (pulling only what no checkout has), another game's file copied to the same path. Pull output goes to stderr so stdout stays JSON.
- `findAssets(query, { has, gameFiles, game?, limit? })` (`@jgengine/assets/findAssets`) is the search behind it; `scoreAssetText` (`@jgengine/assets/rankAssets`) is the scorer every asset search ranks by.
- `@jgengine/assets/assetStore`: the shared asset store (`assetStoreRoot`, `linkFromStore`, `seedStore`, `provisionJobs`) moved here from the games folder, so the CLI and `games:provision` serve packs one way.

### Changed

- The dev build's missing-model banner names the command that fetches a model no checkout has: `jgengine assets find <name> --game <dir> --provision`.
