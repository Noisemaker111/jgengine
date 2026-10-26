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

## Harbor Heat realistic assets

Harbor Heat's street furniture comes from the engine's realistic model library and its building faces from ambientCG scans. Every file is downloaded from the publisher's own site by `bun run games:provision harbor-heat` (Poly Haven files are checked against Poly Haven's published md5), compressed, and kept out of Git under `public/`. All are CC0 1.0: no attribution is required, and these credits are given anyway.

| In game | Asset | Author | License | Source |
| --- | --- | --- | --- | --- |
| `obj_streetlight` | Cast-iron street lamp (`city/street-lamp`) | Josh Dean | CC0 1.0 | https://polyhaven.com/a/street_lamp_01 |
| `obj_bench` | Painted wooden bench (`park/bench`) | Kirill Sannikov | CC0 1.0 | https://polyhaven.com/a/painted_wooden_bench |
| `obj_hydrant` | Fire hydrant (`city/fire-hydrant`) | Gonçalo Felício | CC0 1.0 | https://polyhaven.com/a/fire_hydrant |
| `obj_trashcan` | Galvanised trash can (`city/trash-can`) | GurJas Studios | CC0 1.0 | https://polyhaven.com/a/metal_trash_can |
| `obj_dumpster` | Street utility cabinet (`city/utility-cabinet`) | James Ray Cock | CC0 1.0 | https://polyhaven.com/a/utility_box_02 |
| `obj_barrier` | Concrete road barrier (`city/road-barrier`) | Amal Kumar | CC0 1.0 | https://polyhaven.com/a/concrete_road_barrier_02 |
| `obj_crate_dock` | Wooden shipping crate (`industrial/wooden-crate`) | James Ray Cock, Jurita Burger | CC0 1.0 | https://polyhaven.com/a/wooden_crate_02 |
| `obj_barrel` | Steel drum barrel (`industrial/barrel`) | Jorge Camacho | CC0 1.0 | https://polyhaven.com/a/Barrel_01 |
| `obj_planter` | Potted plant (`park/potted-plant`) | Rico Cilliers | CC0 1.0 | https://polyhaven.com/a/potted_plant_02 |
| `obj_hedge` | Wooden planter box (`park/planter-box`) | James Ray Cock | CC0 1.0 | https://polyhaven.com/a/planter_box_01 |
| `obj_cactus` | Quiver tree (`nature/quiver-tree`) | Dario Barresi, Rico Cilliers | CC0 1.0 | https://polyhaven.com/a/quiver_tree_02 |
| building face `facade/brick-red` | Brick facade, red (Facade018A) | ambientCG (Lennart Demes) | CC0 1.0 | https://ambientcg.com/view?id=Facade018A |
| building face `facade/brick-grey` | Brick facade, grey (Facade019A) | ambientCG (Lennart Demes) | CC0 1.0 | https://ambientcg.com/view?id=Facade019A |
| building face `facade/brick-brown` | Brick facade, brown (Facade020A) | ambientCG (Lennart Demes) | CC0 1.0 | https://ambientcg.com/view?id=Facade020A |
| `obj_shade_tree` | Jacaranda tree (`nature/jacaranda`) | Rob Tuytel, Rico Cilliers | CC0 1.0 | https://polyhaven.com/a/jacaranda_tree |
| `obj_patio` | Outdoor table and chairs (`park/patio-set`) | James Ray Cock | CC0 1.0 | https://polyhaven.com/a/outdoor_table_chair_set_01 |
| `obj_picnic` | Wooden picnic table (`park/picnic-table`) | Ulan Cabanilla | CC0 1.0 | https://polyhaven.com/a/wooden_picnic_table |
| building face `facade/glass-curtain` | Glass curtain wall with mullions (Facade006) | ambientCG (Lennart Demes) | CC0 1.0 | https://ambientcg.com/view?id=Facade006 |
| streets | Road asphalt (Asphalt003) | ambientCG (Lennart Demes) | CC0 1.0 | https://ambientcg.com/view?id=Asphalt003 |
| streets | Sidewalk and driveway concrete (Concrete006) | ambientCG (Lennart Demes) | CC0 1.0 | https://ambientcg.com/view?id=Concrete006 |

The building block itself (`harbor-heat/src/art/city-block.glb`) is original geometry with no textures. People, animals and the street cars come from the engine library's non-CC0 entries, which do require attribution (the in-game credits list them):

| In game | Asset | Author | License | Source |
| --- | --- | --- | --- | --- |
| player, residents, contacts, gangs, police, bounty marks (`src/game/world/cast.ts`) | Microsoft Rocketbox avatars (`human/*`: man-casual, man-casual-2, woman-casual, woman-casual-2, jogger, construction-worker, security-guard, businessman, police-officer, soldier) | Microsoft (Rocketbox Studios GmbH) | MIT | https://github.com/microsoft/Microsoft-Rocketbox (commit 0943055d) |
| `obj_dog`, `obj_dog_shepherd`, `obj_duck` | Rocketbox animals (`creature/dog-beagle`, `creature/dog-shepherd`, `creature/duck`) | Microsoft (Rocketbox Studios GmbH) | MIT | https://github.com/microsoft/Microsoft-Rocketbox (commit 0943055d) |
| `car_compact`, `car_muscle`, `car_sport`, `car_suv`, `car_cop` (repainted; the cruiser adds an original light bar) | CarConcept (`vehicle/sports-car`, logos removed) | Eric Chadwick, Darmstadt Graphics Group GmbH | CC-BY 4.0 | https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept (commit 8f492390) |

The Islander bus (`islander-bus.glb`) and the cruiser's light bar (`hhpd-lightbar.glb`) are original geometry from `harbor-heat/scripts/author-harbor.mjs`. Aircraft, signs, neon, signals and cargo are still KayKit (CC0); the engine's `MODEL_LIBRARY_GAPS` lists the route for each.

## Games first generated from ideas

Hold the Line, Fernwild and Apex Nights were first generated from one-sentence ideas by a since-retired generator. Their names, story text and settings are original. The generator copied the pack models each game uses from the engine's `apps/dev/public/models/` into `<game>/public/models/imported/`. Textures over 1 MB are scaled down to 1024 px. Library models (`city/...`, `vehicle/...`) come from `bun run games:provision <game>`, as with Harbor Heat above. Every copied file is CC0 1.0 and keeps its source name. Each game's Credits screen lists them.

| Game | Pack (folder under `public/models/imported/`) | Author | License |
| --- | --- | --- | --- |
| Hold the Line, Apex Nights | KayKit City Builder Bits (`kaykit-city-builder`): buildings, cars, water tower, dumpster | Kay Lousberg | CC0 1.0 |
| Hold the Line, Fernwild | Quaternius Stylized Nature (`quaternius-stylized-nature`): trees, bushes, ferns | Quaternius | CC0 1.0 |
| Fernwild | Quaternius Medieval Village (`quaternius-medieval-village`): wooden fence | Quaternius | CC0 1.0 |
| Fernwild | KayKit Dungeon (`kaykit-dungeon`): lit torch | Kay Lousberg | CC0 1.0 |
| Fernwild | KayKit adventurer and Quaternius animal models renamed for the engine's former Lantern Reach port (`lantern-reach`): ranger, raptor, stag, boar, bull, settlement | Kay Lousberg; Quaternius | CC0 1.0 |

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
