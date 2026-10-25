# Deepward credits

Deepward's setting, terminology, characters, item fiction, procedural industrial
meshes and interface are original content in this repository. No downloaded
model pack or commissioned bitmap artwork is used in the current slice.

The terrain, room volumes and stable markers in `src/editor.scene.json` were
authored through the published JGengine editor host using its decoded RPC
operations and `export_document`. The game derives navigation from that document;
it does not claim an editor-baked navigation mesh.

The application consumes published JGengine core, React, shell and editor
packages, React, React Three Fiber and Three.js. Their distributed package
licenses and notices remain with those dependencies. Build tooling includes
Vite, Tailwind CSS and TypeScript under their respective distributed licenses.

The 2026 station pass adds original canopies, receiving hoist, pressure vessels,
print press ribs, service cabinets, conduits and waysigns. Its reproducible
`scripts/author-station.ts` uses the published editor host's session commands
and marker RPC, then exports the document. Runtime batches those authored
volumes and room-derived surfaces; it does not embed their world placements.

Original detailed rotary press, salvage printer, duplex ink recovery pump,
stash cabinet, dispatch desk, receiving portal and rail transfer trolley are
CC0-1.0 assets under `public/models/imported/deepward`. The supplied license and
asset manifest record their reproducible Blender tooling, metre bounds and
embedded original enamel/metal grain, wear, roughness and normal maps.
`place-original-machinery.ts` attaches them to stable editor catalog markers.

The original seventeen-joint Fitter, skinned tools, service sidearm and rifle
are CC0-1.0 models under `public/models/imported/deepward/fitter`; the manifest
records bounds, embedded maps, skins and the idle/walk/windup clips. The models
are reproducible through `build-original-fitter.py`. Original tileable station
enamel and mineral floor grain/grease maps are under `surfaces`, with their own
hash manifest and `build-original-surfaces.py` source.

## Interior pass (2026-10)

The floor interiors (`src/game/interiorLook.ts`, `interiorPlan.ts`) use CC0-1.0
PBR scans from ambientCG (https://ambientcg.com) and CC0-1.0 prop models from
Poly Haven (https://polyhaven.com), pulled through the JGengine asset library by
`bun run games:provision deepward`. Trims, pipes, cables, stains and wall lamps are
derived from the authored rooms by the engine interior dressing kit.

Materials:

- Painted metal (ambientcg-paintedmetal006) by ambientCG (CC0-1.0)
- Chipped paint (ambientcg-paintedmetal002) by ambientCG (CC0-1.0)
- Bare steel (ambientcg-metal007) by ambientCG (CC0-1.0)
- Corrugated steel (ambientcg-corrugatedsteel009) by ambientCG (CC0-1.0)
- Diamond plate (ambientcg-diamondplate005a) by ambientCG (CC0-1.0)
- Rusted metal (ambientcg-rust007) by ambientCG (CC0-1.0)
- Steel plate (ambientcg-metalplates001) by ambientCG (CC0-1.0)
- Smooth concrete (ambientcg-concrete006) by ambientCG (CC0-1.0)
- Poured concrete (ambientcg-concrete013) by ambientCG (CC0-1.0)
- Rough concrete (ambientcg-concrete025) by ambientCG (CC0-1.0)
- Ceramic tile (ambientcg-tiles007) by ambientCG (CC0-1.0)
- Rock face (ambientcg-rock022) by ambientCG (CC0-1.0)
- Terrazzo (ambientcg-terrazzo005) by ambientCG (CC0-1.0)
- Canvas (ambientcg-fabric007) by ambientCG (CC0-1.0), on the diving suits

Models:

- Worn metal rack by Luca B (CC0-1.0) https://polyhaven.com/a/worn_metal_rack
- Plastic stacking crate by Pacific Penguin (CC0-1.0) https://polyhaven.com/a/plastic_crate_03
- Wooden shipping crate by James Ray Cock, Jurita Burger (CC0-1.0) https://polyhaven.com/a/wooden_crate_02
- Hand truck by Mutanzom3D (CC0-1.0) https://polyhaven.com/a/hand_truck
- Rolling tool chest by Yann Kervran, John Hutcheson (CC0-1.0) https://polyhaven.com/a/metal_tool_chest
- Fire extinguisher by UM JOORIN (CC0-1.0) https://polyhaven.com/a/korean_fire_extinguisher_01
- Wall power box by Rico Cilliers, Yann Kervran (CC0-1.0) https://polyhaven.com/a/power_box_01
- Military air compressor by Brian Speight (CC0-1.0) https://polyhaven.com/a/old_military_compressor
- Propane tank by Slinc (CC0-1.0) https://polyhaven.com/a/propane_tank
- Military supply crate by Jack Mava (CC0-1.0) https://polyhaven.com/a/old_military_crate
- Steel drum barrel by Jorge Camacho (CC0-1.0) https://polyhaven.com/a/Barrel_01
- Metal jerrycan by Sean Buckley (CC0-1.0) https://polyhaven.com/a/metal_jerrycan
- Portable generator by James Ray Cock (CC0-1.0) https://polyhaven.com/a/portable_generator
- Ammo box by DanKit (CC0-1.0) https://polyhaven.com/a/ammo_box
- Cardboard box by Rahul Chaudhary (CC0-1.0) https://polyhaven.com/a/cardboard_box_01
- Tool cart by Savva Zakharov (CC0-1.0) https://polyhaven.com/a/tool_cart
- Industrial storage cart by Jule Bielitz (CC0-1.0) https://polyhaven.com/a/industrial_storage_cart
- Portable welding cart by Georgii Gorbunov (CC0-1.0) https://polyhaven.com/a/portable_welding_cart
- Trash bag by Benny Weimer (CC0-1.0) https://polyhaven.com/a/trashbag
- Cement bag by PierreB3D (CC0-1.0) https://polyhaven.com/a/cement_bag
- Rusted can by Rahul Chaudhary (CC0-1.0) https://polyhaven.com/a/can_rusted
- Oil tin by Niklas (CC0-1.0) https://polyhaven.com/a/oil_tin
- Metal toolbox by Mateusz Sadek (CC0-1.0) https://polyhaven.com/a/metal_toolbox
- Rusted wheel rim by John Hutcheson (CC0-1.0) https://polyhaven.com/a/rusted_wheel_rim_01
- Crowbar by Alexander Otterbeck (CC0-1.0) https://polyhaven.com/a/crowbar_01
- Sledgehammer by Dylan Guzman (CC0-1.0) https://polyhaven.com/a/sledgehammer_01
- Pipe wrench by Will Evarts (CC0-1.0) https://polyhaven.com/a/pipe_wrench
- Small LPG tank by Ulan Cabanilla (CC0-1.0) https://polyhaven.com/a/small_lpg_tank
- Wooden ladder by Miroslav Turura (CC0-1.0) https://polyhaven.com/a/wooden_ladder
- Metal office desk by Ulan Cabanilla (CC0-1.0) https://polyhaven.com/a/metal_office_desk
- Drawer cabinet by Ulan Cabanilla (CC0-1.0) https://polyhaven.com/a/drawer_cabinet
- Clipboard by ProgrammerOnCoffee (CC0-1.0) https://polyhaven.com/a/clipboard
