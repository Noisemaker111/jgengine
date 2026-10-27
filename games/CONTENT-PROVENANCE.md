# Game content and provenance

JGengine Games uses familiar genre mechanics with independently named projects and authored settings. Product titles, route IDs, package names, character callings, quest copy, and reference documents use these identities:

| Game | Identity and setting |
| --- | --- |
| Ember Command | A highland commander leads the Vanguard against Marauder fortifications. |
| Brightway Park | Build attractions and shops, price tickets, and manage visitor demand. |
| Odd Orbit | Care for an alien household through needs, schedules, and shared living space. |
| Scrap Signal | Reclaim Ferralon with Gunk, Nyx, or Cipher; recover modules and breach a reactor. |
| Beacon Bastion | Defend a beacon with towers and authored approach routes. |
| Deepward | Oxygen-limited salvage dives through abandoned printing vaults, with banked salvage, competing refits, and reprint recovery. |
| Harbor Heat | Run courier jobs and crew contracts across a coastal city. |
| Drift Foundry | Race modular scrap vehicles through an industrial canyon. |

The removed Lantern Reach game retained source from Levy Street’s MIT project. Its historical acknowledgment was exactly **Port of World of ClaudeCraft · Levy Street (MIT)**, linked to [the upstream source](https://github.com/levy-street/world-of-claudecraft), in its credit export and running game. Its source and attribution remain in Git history.

Third-party asset catalog keys identify the actual files being loaded. KayKit, Quaternius, ambientCG, and game-icons.net assets keep their source names and license notices; renaming a game does not rename or change the license of an upstream pack. Consult [engine credits](https://github.com/Noisemaker111/jgengine/blob/main/CREDITS.md), the individual packs, and game credit exports for their notices. No new source or asset ownership is claimed by this migration.

All eight listed games have runnable packages. Deepward uses original procedural industrial geometry, materials, and an authored extraction setting; it requires no downloaded model pack. Its current implementation includes salvage banking, permanent tank and reserve-ammunition refits, and persistent loss/reprint acknowledgment. The earlier identity migration preserved game mechanics while changing identities and authored vocabulary. The content review removes explicit positioning as reproductions of commercial titles and the identifiable borrowed names found in authored content. It does not establish legal clearance or exclusive rights to a title.

Harbor Heat and Scrap Signal retain historical save namespaces and identifiers only in their compatibility loaders. A current save takes precedence; otherwise the loader copies an existing legacy slot into the new namespace and translates renamed content IDs through the whole-world save controller. It leaves the old record intact. Save and reload behavior is game-specific; Deepward has an offline continuation path.

## Where asset credits live

A borrowed asset's source, author, license and page are recorded once, on its metadata: the catalog source for a pack or scan, the `MODEL_LIBRARY` entry for a library model. Each game's Credits screen is built from that metadata (`creditsForSourceIds`, `creditsForAssetIds` and `libraryModelCredits` in `@jgengine/assets`), so this file does not list assets one by one and cannot drift from what ships. Harbor Heat's street furniture, building faces, people, animals and cars all credit this way (`src/game/credits.ts`, `src/game/world/props.ts`); `bun run games:provision <game>` downloads each file from its publisher.

Harbor Heat's building block, Islander bus and cruiser light bar are original geometry from `harbor-heat/scripts/author-harbor.mjs`.

## Games first generated from ideas

Hold the Line, Fernwild and Apex Nights were first generated from one-sentence ideas by a since-retired generator. Their names, story text and settings are original. The generator copied the pack models each game uses from the engine's `apps/dev/public/models/` into `<game>/public/models/imported/`. Textures over 1 MB are scaled down to 1024 px. Library models (`city/...`, `vehicle/...`) come from `bun run games:provision <game>`, as with Harbor Heat above. Every copied file is CC0 1.0 and keeps its source name. Each game's Credits screen lists them.

| Game | Pack (folder under `public/models/imported/`) | Author | License |
| --- | --- | --- | --- |
| Hold the Line, Apex Nights | KayKit City Builder Bits (`kaykit-city-builder`): buildings, cars, water tower, dumpster | Kay Lousberg | CC0 1.0 |
| Hold the Line, Fernwild | Quaternius Stylized Nature (`quaternius-stylized-nature`): trees, pines, bushes, ferns, rocks, pebbles, grass | Quaternius | CC0 1.0 |
| Fernwild | Quaternius animated animals and dinosaurs (`creatures/velociraptor.glb`, `trex`, `triceratops`, `stegosaurus`, `parasaurolophus`, `apatosaurus`, `wolf`, `stag`, `horse`, `sheep`, `yeti`, `spider`, `frog`, `snake`), from poly.pizza | Quaternius | CC0 1.0 |
| Fernwild | Poly by Google animals (the other `creatures/*.glb`), rigged by the engine's `autoRig` at bake time; fire salamander by madtrollstudio. Every file's title and page: `games/fernwild/src/game/data/creatureModels.ts` | Poly by Google, madtrollstudio | CC-BY 3.0 |

## Bundled fonts

Each game ships one display font and one body font from [Google Fonts](https://github.com/google/fonts). The files are unmodified and licensed under the SIL Open Font License 1.1. Several fonts carry Reserved Font Names, so the files must stay unmodified. Each game's `src/art/fonts/` folder holds:
- the font files
- `OFL.txt`, with each font's copyright line and the license
- `SOURCE.md`, with the exact source URL and version of each file

| Game | Display | Body |
| --- | --- | --- |
| Harbor Heat | Bangers | Barlow |
| Beacon Bastion | Cinzel | Alegreya Sans |
| Ember Command | IM Fell English SC | Alegreya |
| Brightway Park | Lilita One | Nunito |
| Deepward | Share Tech Mono | Rajdhani |
| Drift Foundry | Saira Stencil One | Barlow Condensed |
| Odd Orbit | Comfortaa | Quicksand |
| Scrap Signal | Russo One | Chakra Petch |
