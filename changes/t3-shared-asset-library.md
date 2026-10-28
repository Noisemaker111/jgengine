a shared asset library of 12,678 licensed entries (models, characters, materials, decals, HDRIs, icons) from ambientCG, Poly Haven, game-icons.net, Sketchfab CC0/CC BY, Rocketbox, KayKit and Quaternius, each with source, author, licence, page, tags, triangles and size

Refs #2686

Engine seam: packages/assets/src/cli/pull.ts, packages/assets/src/download.ts, packages/assets/src/library/assetLibrary.ts, packages/assets/src/library/generated/index.ts, packages/assets/src/library/libraryCli.ts, packages/assets/src/library/libraryIcons.ts, packages/assets/src/library/libraryIndex.ts, packages/assets/src/library/libraryIngest.ts and 15 more

### Added

- a shared asset library of 12,678 licensed entries (models, characters, materials, decals, HDRIs, icons) from ambientCG, Poly Haven, game-icons.net, Sketchfab CC0/CC BY, Rocketbox, KayKit and Quaternius, each with source, author, licence, page, tags, triangles and size
- a licence gate in code: only CC0, public domain, MIT and CC BY are accepted; Kenney, Mixamo, Textures.com, Fab and BlenderKit uploads are refused
- `assets library ingest|search|credits|stats` and `assets pull <source>:<id>`; a game that quotes a library key gets it at provision time, bytes stay in the shared asset store
- the editor's Content Browser has an Asset library with search, kind tabs, tags, thumbnails, licence badges and Add to game
- `SpriteIcon` and `libraryIconUrl` draw game-icons.net item icons (4,239, credited per artist); `ActionBar` takes `renderIcon` in both looks
- Saltwick's crop bar shows beet, cabbage, sunflower and raspberry icons, and its credits name the icon artist
- `libraryCreditSections` (`@jgengine/assets/library/assetLibrary`): Credit sections for the library entries a game ships: one section per source, one line per credited author (game-icons.net's "Icons made by …" rule) with the entries listed, and one line per CC0 source. Also `LibraryEntry`, `LibraryHit`, `LibraryIssue`, `LibraryRecord`, `LibraryRecordFile`, `LibrarySearchOptions`, `libraryCredits`, `libraryLicenseLabel` and 3 more.
- `libraryRecordFiles` (`@jgengine/assets/library/generated`): Every committed library ingest file, as untyped JSON; `readLibraryRecordFile` checks each one.
- `GAMEICONS_ARTISTS` (`@jgengine/assets/library/libraryIcons`): game-icons.net's folder names and the credit each artist asks for ("Icons made by {author}"), from the repository's `license.txt`. Also `GAMEICONS_CC0_ARTISTS`, `GAMEICONS_PACK`, `libraryIconCredits`, `libraryIconUrl`.
- `assetLibrary` (`@jgengine/assets/library/libraryIndex`): Every entry in the shared asset library: the committed ingest files plus the measured packs.
- `IngestFetch` (`@jgengine/assets/library/libraryIngest`): The fetch seam ingest uses; tests pass a stub. Also `IngestOptions`, `KayKitTreePack`.
- `EXCLUDED_PROVIDERS` (`@jgengine/assets/library/libraryLicense`): Providers JGengine never ships, whatever licence a re-upload claims: Kenney (house rule), and Mixamo, Textures.com, Fab and BlenderKit (no redistribution). Also `LIBRARY_LICENSES`, `LibraryLicense`, `licenseRequiresCredit`, `normalizeLibraryLicense`.
- `pullLibraryEntry` (`@jgengine/assets/library/libraryPull`): Pulls one library entry into `ctx.outRoot` at {@link libraryServedPath}: pack entries through the pack pull, ambientCG materials through the material path, Poly Haven and Rocketbox models through the model library's converters, Poly Haven textures and HDRIs and ambientCG HDRIs as files, and a Sketchfab model through its download API with the token named by the source (`SKETCHFAB_TOKEN`). Also `LibraryPullContext`.
- `libraryServedPath` (`@jgengine/assets/library/libraryServed`): The served folder and URL for a library entry. Also `LibraryServedPath`.
- `ASSET_LIBRARY_SOURCES` (`@jgengine/assets/library/librarySources`): The upstreams the shared asset library indexes, in ingest order. Also `GAMEICONS_REVISION`, `LIBRARY_KINDS`, `LibraryKind`, `LibrarySource`, `LibrarySourceId`, `ROCKETBOX_REVISION`, `librarySource`.
- `SpriteIcon` (`@jgengine/core/ui/icons/spriteIcon.view`): A one-colour icon from a served SVG or PNG, tinted by `color` (or the text colour): game-icons.net item icons in place of two-letter text tiles. Also `SpriteIconProps`.
- `LibraryLoader` (`@jgengine/editor/shell/AssetLibraryBrowser`): Loads the shared asset library index; lazy so the editor bundle never carries it until opened.

### Fixed

- the dev runner served .svg files as octet-stream, so SVG masks and images from a game's public folder did not draw
- library ingest's public-catalogue fetch is on the scaffold-launch remote list
