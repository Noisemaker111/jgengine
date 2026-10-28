# Credits

## ambientCG

The shared material library ([`packages/assets/src/catalogs/materialLibrary.ts`](packages/assets/src/catalogs/materialLibrary.ts))
names 56 PBR surfaces whose maps come from **[ambientCG](https://ambientcg.com)** — one CC0
scan per name, pulled with `assets pull library` rather than committed. Credits are recorded
per entry: `MaterialAsset.provenance` and every texture's `provenance` carry `ambientCG` and
`CC0-1.0` plus the scan's own page. The four shader-only entries (clear glass, frosted glass,
ocean and puddle) and the two painted finishes (`paint/gloss`, `paint/satin`) publish no ambientCG
scan; they are response parameters, and the smudged
glass entry adds ambientCG's `Fingerprints001` normal so glass is not mathematically clean.

## Poly Haven

Environment-map capture examples use free CC0 HDRIs from [Poly Haven](https://polyhaven.com/hdris).

The realistic model library (`@jgengine/assets/catalogs/modelLibrary`) names 58 CC0 models from
[Poly Haven](https://polyhaven.com/models). Each entry records its Poly Haven page and the authors
Poly Haven credits (Josh Dean, James Ray Cock, Rico Cilliers, Rob Tuytel and others); the SDK ships
the names only, and `assets pull` fetches the bytes from Poly Haven's own API and CDN.

## Microsoft Rocketbox

The library's rigged humans and animals are converted from the
[Microsoft Rocketbox Avatar Library](https://github.com/microsoft/Microsoft-Rocketbox), by Microsoft
(Rocketbox Studios GmbH), released under the MIT License, Copyright (c) Microsoft Corporation.
`assets pull` reads them from the repository at a pinned commit; games that ship them carry the
MIT copyright and permission notice in their credits.

## Khronos glTF Sample Assets

`vehicle/sports-car` is **CarConcept** from the
[Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets), by Eric Chadwick
and Darmstadt Graphics Group GmbH, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
The pull removes the licence plate and the Khronos and glTF logos (trademarks the license does not
grant) and simplifies the mesh. A game that ships it must show that credit.

## Shared asset library

`@jgengine/assets/library/*` indexes about 12,700 assets that every game can pick from in the editor's
Asset library: ambientCG materials and HDRIs (CC0), Poly Haven models, textures and HDRIs (CC0),
game-icons.net icons (CC BY 3.0), Sketchfab models marked CC0 or CC BY, Microsoft Rocketbox
characters (MIT) and KayKit and older Quaternius packs (CC0). Only CC0, public domain, MIT and CC BY
are accepted; Kenney, Mixamo, Textures.com, Fab and BlenderKit are refused. The library stores
metadata only (source, author, licence, page, tags, bounds, triangles); `assets pull <source>:<id>`
fetches the bytes into the shared asset store. Each entry keeps its author and licence, so
`libraryCredits` and `assets library credits <key...>` write a game's credit lines from the assets it
ships.

game-icons.net icons are by Lorc, Delapouite, Andy Meneely, Aussiesim, Carl Olsen, Caro Asercion,
Cathelineau, Catsu, DarkZaitzev, Faithtoken, Felbrigg, GeneralAce135, Guard13007, HeavenlyDog,
Irongamer, John Colburn, John Redman, Kier Heyl, Lord Berandas, Lucas, Pepijn Poolman, Pierre
Leducq, PriorBlue, Quoting, Rihlsul, Sbed, SeregaCthtuf, Skoll, Sparker, SpencerDub, Starseeker,
Willdabeast, Zajkonur and others, under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/);
icons by Viscious Speed and Zeromancer are CC0. Saltwick's crop icons (beet, cabbage, sunflower,
raspberry) are by Delapouite.

JGengine stands on the shoulders of open work by others.
This file records that debt and thanks the people whose projects shaped ours.

## achrefelouafi

Huge thanks to **[achrefelouafi](https://github.com/achrefelouafi)** (chiro
achrefelouafi). Four of JGengine's environment renderers — **procedural
buildings, water, rain, and snow** — were shaped from ideas, math, and shader
techniques in his MIT-licensed Three.js reference projects. Every one of them is
worth reading in full; they are clear, self-contained, and beautifully done.

| JGengine feature | Where it lives | Derived from (MIT) |
| --- | --- | --- |
| **Procedural buildings** | [`core/world/buildings.ts`](packages/core/src/buildings/buildings.ts), [`shell/structures/GeneratedBuilding.tsx`](packages/core/src/buildings/GeneratedBuilding.draw.tsx) | [BuildingGeneratorThreeJS](https://github.com/achrefelouafi/BuildingGeneratorThreeJS) — a procedural Hong Kong building generator ported from a Blender geometry-nodes setup. Our seeded facade/roof kit (windows, awnings, AC units, clotheslines, storefronts, shutters, store signs, roof props, guardrails, corners) follows the component vocabulary and placement logic of his generator, as does [`core/world/buildingKit.ts`](packages/core/src/buildings/buildingKit.ts)'s binding of those part slots to instanced models. |
| **Water** | [`core/water/`](packages/core/src/water), [`shell/water/`](packages/shell/src/water) | [OceanThreejs](https://github.com/achrefelouafi/OceanThreejs) — a cinematic, physically based ocean renderer. Our Gerstner wave surface, crest/foam shading, and Fresnel water color draw directly on his ocean techniques. |
| **Rain** | [`shell/weather/RainField.tsx`](packages/core/src/weather/RainField.draw.tsx) | [RainSystemThreeJS](https://github.com/achrefelouafi/RainSystemThreeJS) — GPU-instanced rain. Our camera-following instanced rain volume is shaped from his system. |
| **Snow** | [`shell/weather/SnowField.tsx`](packages/core/src/weather/SnowField.draw.tsx) | [SnowSystemThreeJS](https://github.com/achrefelouafi/SnowSystemThreeJS) — a fully procedural snow studio with GPU-instanced snowfall. Our drifting, swaying snow volume is shaped from his system. |

A related nod: JGengine's grass field
([`shell/terrain/GrassField.tsx`](packages/shell/src/terrain/GrassField.tsx))
took cues from his [GrassSystemThreeJS](https://github.com/achrefelouafi/GrassSystemThreeJS).

The website carries the same debt on its face: the live engine functions on
[jgengine.com/playground](https://jgengine.com/playground#functions) credit him beside
the demos — the grass demo, the engine's own grass, nods to
[GrassSystemThreeJS](https://github.com/achrefelouafi/GrassSystemThreeJS), and
the pole-and-festoon catenary demo to his
[PoleGeneratorThreeJS](https://github.com/achrefelouafi/PoleGeneratorThreeJS).

These are ports and re-implementations, not copies: JGengine's versions are
renderer-agnostic (the wave math and building generator live in dependency-free
`@jgengine/core`), prop-driven, and stripped of the reference projects' GUI,
audio, post-processing, and app-specific scene setup. But the good ideas are
his. Each source project is MIT-licensed; go star them.

## Every Inc (compound-engineering-plugin)

The **`ce-handoff`** agent skill (session continuity: create/resume handoffs so a fresh agent can orient without the original transcript) is adapted from Every Inc's MIT-licensed [compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin) skill [`ce-handoff`](https://github.com/EveryInc/compound-engineering-plugin/blob/main/skills/ce-handoff/SKILL.md). JGengine's copy lives at [`.claude/skills/ce-handoff/SKILL.md`](.claude/skills/ce-handoff/SKILL.md) with monorepo path conventions (Windows + Unix scratch roots, Grok/Claude invocation, pointers into `workflow` / `jgengine-verify`). Go star the upstream project.

## Vladislav Kruteniuk (three-start)

JGengine's behaviour lifecycle stands on
**[three-start](https://github.com/vladkrutenyuk/three-start)** by
**[Vladislav Kruteniuk](https://x.com/vladkrutenyuk)** (MIT License,
Copyright (c) 2026 Vladislav Kruteniuk) — a minimal foundation layer for
Three.js: bootstrap, lifecycle, and a unified component model. Read it; it is
small, exact, and every ordering decision is deliberate.

| JGengine feature | Where it lives | Derived from three-start |
| --- | --- | --- |
| **Behaviour lifecycle** | [`core/behaviour/behaviour.ts`](packages/core/src/behaviour/behaviour.ts) | `Object3DBehaviour`'s hook set and exact activation ordering (`onAwake` once → `onEnable` → `onStart` once → `onUpdate` → `onDisable` → `onDestroy` always), the `activeSelf`/`activeInHierarchy` cascade that prunes at self-inactive descendants so reactivation restores per-child flags, the Unity-style two-pass bootstrap (awake all, then enable/start all) with the bootstrap gate that defers mid-bootstrap attachments so modules always subscribe to update dispatch first, and the lazy frame-subscription trick — a behaviour joins update dispatch only if it actually overrides `onUpdate` (prototype-identity check at activation). |
| **Typed module registry** | same file (`JGEngineRegister`, `RegisterField`, `BehaviourModule`) | The `ThreeStartRegister` declaration-merging pattern and `ContextModule`'s module lifecycle (awake/start before any behaviour, module updates dispatch first). |
| **Three.js binding** | [`shell/behaviour.ts`](packages/core/src/behaviour/behaviour.draw.ts) | `Object3DBehaviour`'s render hooks riding the object's own `onBeforeRender`/`onAfterRender`. |

Ours is a re-implementation, not a copy: JGengine's lifecycle runs headless over
an id-keyed node tree in dependency-free `@jgengine/core` (no three.js, no
scene graph), keyed to entity ids, and it consciously diverges where three-start
documents gaps (reparenting and mid-bootstrap deactivation re-check effective
activity). The lifecycle model, its ordering guarantees, and the lazy-dispatch
idea are his. three-start is MIT-licensed; go star it.

## Majid Manzarpour (threejs-game-skills)

The **[`references/visual-scorecard.md`](.claude/skills/jgengine-ui/references/visual-scorecard.md)** rubric in the `jgengine-ui` skill adapts the structure — a 0–3 scale, ten scored categories, premium/showcase pass thresholds, an automatic-failure list, and a fresh-eyes take-the-lower-score reconciliation — of `visual-scorecard.md` from **[threejs-game-skills](https://github.com/majidmanzarpour/threejs-game-skills)** by **[Majid Manzarpour](https://x.com/majidmanzarpour)** (MIT License). Every category, threshold, and example is reworded for this engine's own terms (`environment()`, `AuthoredScene`, `InstancedScatter`, `summarizeEnvironment`) and none of the source repo's prose or assets were copied — only the rubric shape.

## Kay Lousberg (KayKit)

JGengine's `@jgengine/assets` catalog mirrors **[KayKit](https://kaylousberg.itch.io)**
packs by **[Kay Lousberg](https://kaylousberg.itch.io)** (CC0-1.0) —
GitHub-mirrored (`github.com/KayKit-Game-Assets`) `.glb` characters and props:
adventurers, skeletons, dungeon kits, a medieval hexagon pack, furniture,
city-builder bits, and space-base bits
([`packages/assets/src/sources/kaykit.ts`](packages/assets/src/sources/kaykit.ts)).
CC0 — no attribution required, credited here anyway. Go play his games.

## Quaternius

JGengine's `@jgengine/assets` catalog mirrors **[Quaternius](https://quaternius.com)**
megakits (CC0-1.0) — stylized nature, medieval village, modular sci-fi, fantasy
props, base characters, animated animals, and monsters
([`packages/assets/src/sources/quaternius.ts`](packages/assets/src/sources/quaternius.ts)).
CC0 — no attribution required, credited here anyway. Broadest low-poly CC0
library around; go star it.

## ambientCG

JGengine's `@jgengine/assets` catalog mirrors **[ambientCG](https://ambientcg.com)**
PBR material families (CC0-1.0) — grass, ground, rock, gravel, snow, lava, bark,
wood, planks, bricks, paving, tiles, concrete, asphalt, metal, fabric, leather,
marble, and more, over 400 materials generated per numbered family
([`packages/assets/src/sources/ambientcg.ts`](packages/assets/src/sources/ambientcg.ts));
`Grass001`, `MetalPlates001`, `Asphalt003` and `Concrete006` (among others) ship pre-mirrored under
[`apps/dev/public/materials/`](apps/dev/public/materials). CC0 — no attribution
required, credited here anyway. The gold standard for free PBR; go support it.

## Robbyant (LingBot-Map)

The offline video-to-3D asset-capture recipe in
[`jgengine-assets`' references](.claude/skills/jgengine-assets/references/video-to-3d-capture.md)
is built around **[LingBot-Map](https://github.com/Robbyant/lingbot-map)** by
**Robbyant** (Apache-2.0) — a feed-forward 3D foundation model that
reconstructs scene geometry from streaming video in real time. JGengine does
not vendor or run this model itself; the reference documents how to run it
externally and bring its output in as a catalogued asset. Apache-2.0 permits
commercial use; credited here per its terms.

## game-icons.net (Ironhold HUD)

The **[Ironhold](games/ironhold)** command-console HUD uses vector glyphs from
**[game-icons.net](https://game-icons.net)** (CC BY 3.0) for its resource, unit,
building, research, and ability icons
([`games/ironhold/src/game/ui/iconData.ts`](games/ironhold/src/game/ui/iconData.ts)).
The individual icons are by **Lorc**, **Delapouite**, and **sbed** — coins,
wood-pile, meat, despair, miner, broadsword, high-shot, crossed-swords, barracks,
wheat, watchtower, checkered-flag, palm, pointy-sword, breastplate,
lightning-branches, shield, boots, medal, stopwatch, and visored-helm. Recoloured
to gold via `currentColor`, otherwise unmodified. CC BY 3.0 — attribution given
here as required.

## Vehicle reference physics data

- Magic Formula 6.1 tyre equations: H. B. Pacejka, *Tire and Vehicle Dynamics*, 3rd ed., Butterworth-Heinemann (2012), §4.3, §7.2 and Appendix 3; I. J. M. Besselink, A. J. C. Schmeitz and H. B. Pacejka, "An improved Magic Formula/Swift tyre model that can handle inflation pressure changes", *Vehicle System Dynamics* 48 sup1 (2010). Used by `packages/core/src/physics/reference/magicFormulaTire.ts`.
- TNO 205/60 R15 coefficient set (`TNO_car205_60R15.tir`, Delft-Tyre / TNO Automotive 2013), as printed in Pacejka (2012) Appendix 3. Coefficients only.
- Equation cross-check against MFeval (Marco Furlan, TU Delft) and its Julia port, read for reference; no code copied.
- Multibody reference car (`referenceCar.ts`, `suspensionKinematics.ts`): Kane's method as in T. R. Kane and D. A. Levinson, *Dynamics: Theory and Applications* (1985); suspension closure and Karnopp stick–slip friction (D. Karnopp, ASME J. Dyn. Sys. 107, 1985) from the textbook formulations, no code copied.
- Real-car specifications and published test numbers in `realCars.ts`, each cited per field there: Mazda and Toyota specification listings and Wikipedia's Mazda MX-5 (ND) and Toyota 86 articles (mass, weight split, dimensions, gearing, torque curves, steering ratio, manufacturer 0–100 km/h claims); Car and Driver's 2016 Mazda MX-5 Miata test (skidpad); Edmunds' 2016 MX-5 Miata review and 2013 Scion FR-S track test (braking, FR-S skidpad). Numbers only.
- Standard manoeuvres follow the procedures of ISO 4138 (steady-state circular driving), ISO 7401 (lateral transient response) and ISO 3888-1 (double lane change) as publicly summarized; no standard text copied.
- Whipple bicycle benchmark (`whippleBicycle.ts`): J. P. Meijaard, J. M. Papadopoulos, A. Ruina and A. L. Schwab, "Linearized dynamics equations for the balance and steer of a bicycle: a benchmark and review", *Proc. R. Soc. A* 463 (2007) 1955–1982 (open access, CC BY). Parameters (Table 1), the linear equations (Appendix A) and the published eigenvalues and critical speeds (Table 2) are used as data; the nonlinear bicycle is our own multibody model.
- Rigid-body tree dynamics (`rigidBodyTree.ts`): the composite-rigid-body and recursive Newton–Euler algorithms as in R. Featherstone, *Rigid Body Dynamics Algorithms*, Springer (2008); eigenvalues by the EISPACK `balanc`/`elmhes`/`hqr` scheme of J. H. Wilkinson and C. Reinsch, *Handbook for Automatic Computation* II (1971). From the textbook formulations, no code copied.
- Multibody reference motorcycle (`referenceMotorcycle.ts`, `motorcycleTire.ts`, `realMotorcycles.ts`): R. S. Sharp, S. Evangelou and D. J. N. Limebeer, "Advances in the modelling of motorcycle dynamics", *Multibody System Dynamics* 12 (2004) 251–283 — the model structure, the Suzuki GSX-R1000 parameters (Appendix tables A.I–A.VIII), the motorcycle Magic Formula and its 120/70 ZR17 and 180/55 ZR17 coefficients (section 3), and the straight-running root loci (Figure 18) the model is checked against. Data and equations only; the tyre form follows E. J. H. de Vries and H. B. Pacejka, "Motorcycle tyre measurements and models", *Vehicle System Dynamics* 29 sup1 (1998).
- Suzuki GSX-R1000 K1 published performance: MOTORRAD Top-Test "Suzuki GSX-R 1000" (W. Koch, motorradonline.de, 13 Feb 2001) — 0–100 and 0–200 km/h, 100–0 km/h braking, wet mass and weight split; gear ratios from Suzuki's GSX-R1000 K1 service data as listed on bikeswiki; claimed power and torque peaks from Suzuki's 2001 specification. Numbers only.

- F-16 aerodynamic, engine and mass data: L. T. Nguyen et al., *Simulator Study of Stall/Post-Stall Characteristics of a Fighter Airplane with Relaxed Longitudinal Static Stability*, NASA TP-1538 (1979), public domain, as tabulated in B. L. Stevens and F. L. Lewis, *Aircraft Control and Simulation*, 2nd ed., Wiley (2003), Appendix A, with its trim and check-case values. Used by `packages/core/src/flight/reference/f16Aircraft.ts`. Data only; the trim and mode figures were cross-checked against the Archimedes F-16 tutorial and AeroBench (both read for reference, no code copied).
- *U.S. Standard Atmosphere, 1976*, NOAA/NASA/USAF, public domain. Used by `flight/reference/standardAtmosphere.ts`.
- Cessna 172 data: J. Roskam, *Airplane Flight Dynamics and Automatic Flight Controls*, Part I, Appendix B (Airplane A derivatives); NACA Report 824 (Abbott, von Doenhoff and Stivers, 1945) section data; USAF Stability and Control DATCOM maximum-lift factor; Cessna 172N *Pilot's Operating Handbook* (1978) and FAA Type Certificate Data Sheet 3A12 for geometry, weights, control travel and the published performance it is tested against. Used by `flight/reference/cessna172Aircraft.ts`.
- Jet engine cycle method and component technology levels: J. D. Mattingly, *Elements of Propulsion: Gas Turbines and Rockets*, AIAA (2006), chapters 4, 7 and 8 (off-design component matching, cooling-air model, table 4.4 efficiencies), and its ideal turbofan closed form used as a test. Real-gas properties of air and kerosene products: P. P. Walsh and P. Fletcher, *Gas Turbine Performance*, 2nd ed., Blackwell (2004), chapter 3 polynomials. Inlet recovery: MIL-E-5007D (public domain) and the NACA Report 1135 normal-shock relations (public domain). Methods and published data only, no code copied. Used by `flight/reference/gasTurbine.ts` and `gasTurbineEngine.ts`.
- Engine data: Pratt & Whitney F100-PW-220 published ratings (14 590 lbf military, 23 770 lbf afterburner, 228 lb/s airflow, bypass ratio 0.63, pressure ratio 25, 0.73 lb/(lbf·h)) from the National Museum of the USAF F100 fact sheet (public domain); IAE V2500-A1 take-off, climb and cruise figures from L. R. Jenkinson, P. Simpkin and D. Rhodes, *Civil Jet Aircraft Design* (1999), engine data file; the F100 power lag from Stevens and Lewis (above). Published physical figures only. Used by `flight/reference/referenceEngines.ts` and `jetEngineComparison.ts`.
- Helicopter rotor data: R. L. Peterson, *Full-Scale Hingeless Rotor Performance and Loads*, NASA TM-110356 (1995), public domain: Bo-105 rotor geometry, hover (appendix B) and flight-matched forward-flight (appendix D) performance the rotor is tested against. Bo-105 mass, inertia, flap and tail rotor data: G. D. Padfield, *Helicopter Flight Dynamics*, 2nd ed., Blackwell (2007), chapter 4 and appendix 4B. Used by `flight/reference/bo105Helicopter.ts`. Published physical figures only.
- Rotor method: blade-element momentum theory with Prandtl's tip loss; D. M. Pitt and D. A. Peters, "Theoretical Prediction of Dynamic-Inflow Derivatives", *Vertica* 5 (1981), for the dynamic inflow; I. C. Cheeseman and W. E. Bennett, ARC R&M 3021 (1955), for ground effect; J. G. Leishman, *Principles of Helicopter Aerodynamics*, 2nd ed., Cambridge (2006), chapter 2, for the empirical vortex-ring induced-velocity curve; NACA 23012 section data from NACA Report 824 (public domain) and the drag polar of F. J. Bailey, NACA Report 716 (1941, public domain). Methods and published data only, no code copied. Used by `flight/reference/helicopterRotor.ts`, `helicopter.ts` and `rotorcraftComparison.ts`.
- Saturn V data: Saturn Flight Evaluation Working Group, *Saturn V Launch Vehicle Flight Evaluation Report AS-506 Apollo 11 Mission*, MPR-SAT-FE-69-9, NASA Marshall Space Flight Center (1969), public domain: vehicle mass history (tables 20-1 and 20-9), S-IC stage thrust, flow and specific impulse (figure 5-3) and the trajectory events the reference rocket is tested against (tables 4-1 and 4-2). Earth constants: WGS 84 (NIMA TR8350.2, public domain). J2 nodal regression and the rocket equation are textbook results. Used by `flight/reference/saturnV.ts`, `rocket.ts` and `rocketComparison.ts`. Published physical data only, no code copied.
- Post-stall lift and drag: L. A. Viterna and R. D. Corrigan, "Fixed pitch rotor performance of large horizontal axis wind turbines", NASA CP-2230 (1981). Engine altitude lapse: A. Gagg and E. Farrar, "Altitude performance of aircraft engines equipped with gear-driven superchargers", SAE (1934). Ground effect: B. W. McCormick, *Aerodynamics, Aeronautics and Flight Mechanics*, Wiley (1995). Tyre rolling friction: J. D. Anderson, *Aircraft Performance and Design*, McGraw-Hill (1999).
## Plant growth simulation

The plant simulator (`packages/core/src/plants/`) ports models and data, not code. Every source is
listed in `PLANT_SOURCES` (`plants/species/speciesSources.ts`) and named in each species record's
provenance.

- **USDA Forest Service** (US public domain): the sugar maple height-age curve from Carmean, Hahn &
  Jacobs 1989, *Site index curves for forest tree species in the eastern United States*, GTR NC-128,
  with coefficients read from the Forest Vegetation Simulator Lake States variant (`htcalc.f`);
  Burns & Honkala 1990, *Silvics of North America*, Agriculture Handbook 654; Forest Products
  Laboratory 2010, *Wood Handbook*, FPL-GTR-190; the USDA NRCS PLANTS Database; Forest Inventory
  and Analysis site-tree data for Wisconsin, Michigan and Minnesota (stand-grown DBH by age);
  McPherson, van Doorn & Peper 2016, *Urban tree database*, RDS-2016-0005 (open-grown DBH by age).
- **Forest Vegetation Simulator** (USDA Forest Service, US public domain): crown-width coefficients
  from the Lake States variant (`cwcalc.f`) for open-grown trees, Ek 1974, *Dimensional
  relationships of forest and open grown trees in Wisconsin*, University of Wisconsin, and for
  forest-grown trees, Bechtold 2003, *Crown-diameter prediction models for 87 species of
  stand-grown trees in the eastern United States*, SJAF 27.
- **Tallo** (CC BY 4.0): Jucker et al. 2022, *Tallo: a global tree allometry and crown architecture
  database*, Global Change Biology 28: measured crown widths by DBH for sugar maple and white pine.
- **BAAD** (CC0): Falster et al. 2015, *BAAD: a Biomass And Allometry Database for woody plants*,
  Ecology 96: leaf area per sapwood area of temperate and boreal trees.
- Thornley 1976, *Mathematical models in plant physiology*: the rectangular-hyperbola leaf light
  response.
- Barthélémy & Caraglio 2007, plant architecture and ontogeny, *Annals of Botany* 99: the
  establishment phase of a seedling.
- Brown, McAlpine & Kormanik 1967, apical dominance and form in woody plants, *American Journal of
  Botany* 54; Wilson 2000, apical control of branch growth and angle in woody plants, *American
  Journal of Botany* 87: decurrent and excurrent habit as apical control that changes with age.
- Hart 1928 and Becking 1953, the relative spacing index of even-aged stands; Monsi & Saeki 1953,
  light extinction in plant canopies; Putz, Parker & Archibald 1984, mechanical abrasion and
  intercrown spacing, *American Midland Naturalist* 112: crown shyness between neighbours.
- Palubicki et al. 2009, *Self-organizing tree models for image synthesis*, ACM SIGGRAPH: bud
  self-organisation, shadow voxels and extended Borchert–Honda allocation.
- Perttunen et al. 1996 and 1998, LIGNUM, *Annals of Botany* 77 and 82; Nikinmaa et al. 2003,
  *Tree Physiology* 23: carbon balance, the vigour index and light-dependent shoot length.
- Shinozaki et al. 1964, the pipe model theory, *Japanese Journal of Ecology* 14; Minamino & Tateno
  2014, da Vinci's rule, *PLOS ONE* 9.
- Mäkelä 1997, carbon balance and self-pruning, *Forest Science* 43.
- Jirasek, Prusinkiewicz & Moulia 2000, biomechanics in L-system plant models: gravitational sag.
- Ryan & Yoder 1997, hydraulic limits to tree height, *BioScience* 47.
- Wareing & Nasr 1961, gravimorphism, *Annals of Botany* 25; Digby & Firn 1995, the gravitropic
  set-point angle, *Plant, Cell & Environment* 18.
- Landsberg & Waring 1997, the 3-PG site modifiers, *Forest Ecology and Management* 95.
- Niinemets 2007, shade acclimation of leaves, *Plant, Cell & Environment* 30.
- Cairns et al. 1997, root allocation, *Oecologia* 111.
- Sachs & Novoplansky 1995, correlative inhibition among buds, *Israel Journal of Plant Sciences* 43.
- Koch, Sillett, Jennings & Davis 2004, the limits to tree height, *Nature* 428.
- Fay 2002, veteran tree ecology, *Arboricultural Journal* 26; Lonsdale (ed.) 2013, *Ancient and
  other veteran trees*, The Tree Council: crown retrenchment of old trees.
- Allen et al. 1998, FAO Irrigation and Drainage Paper 56: extraterrestrial radiation and day length.

## Landform simulation

The landform simulator (`packages/core/src/landform/`) implements published models from the papers;
no code is copied (Landlab, Fastscape and TopoToolbox were not used as sources).

- Braun & Willett 2013, *A very efficient O(n), implicit and parallel method to solve the stream
  power equation governing fluvial incision and landscape evolution*, Geomorphology 180–181: the
  flow stack and the implicit stream-power solver.
- Howard & Kerby 1983, channel changes in badlands, *GSA Bulletin* 94; Whipple & Tucker 1999,
  dynamics of the stream-power river incision model, *JGR* 104: the stream-power law.
- Barnes, Lehman & Mulla 2014, *Priority-Flood: an optimal depression-filling and watershed-labeling
  algorithm for digital elevation models*, Computers & Geosciences 62: lake filling and the ε rise.
- O'Callaghan & Mark 1984, the extraction of drainage networks from digital elevation data, *CVGIP*
  28: D8 routing. Tarboton 1997, a new method for the determination of flow directions and upslope
  areas in grid digital elevation models, *Water Resources Research* 33: D∞ routing.
- Davy & Lague 2009, the erosion/transport equation of landscape evolution models revisited, *JGR*
  114; Yuan, Braun, Guerit, Rouby & Cordonnier 2019, a new efficient method to solve the stream
  power law model taking into account sediment deposition, *JGR Earth Surface* 124: deposition.
- Culling 1960, analytical theory of erosion, *Journal of Geology* 68; Fernandes & Dietrich 1997,
  hillslope evolution by diffusive processes, *Water Resources Research* 33; Hanks, Bucknam,
  Lajoie & Wallace 1984, modification of wave-cut and faulting-controlled landforms, *JGR* 89: hillslope
  diffusion and the scarp profile it is tested against.
- Burbank et al. 1996, bedrock incision, rock uplift and threshold hillslopes in the northwestern
  Himalayas, *Nature* 379; Montgomery & Brandon 2002, topographic controls on erosion rates in
  tectonically active mountain ranges, *EPSL* 201: threshold landsliding.
- Flint 1974, stream gradient as a function of order, magnitude and discharge, *Water Resources
  Research* 10; Whipple 2004, bedrock rivers and the geomorphology of active orogens, *Annual Review
  of Earth and Planetary Sciences* 32: the slope–area law and concavity range.
- Hack 1957, studies of longitudinal stream profiles in Virginia and Maryland, USGS Professional
  Paper 294-B (US public domain); Rigon et al. 1996, on Hack's law, *Water Resources Research* 32.
- Forte, Yanites & Whipple 2016, complexities of landscape evolution during incision through layered
  stratigraphy, *Earth Surface Processes and Landforms* 41: rivers steepening in hard layers.

## Game and level design research

The `game-design` and `level-design` skills synthesize and rephrase design
methods from the following researchers and practitioners. No source prose,
diagrams, examples, or assets are copied; the skills adapt the concepts into
JGengine's editor-owned world and reusable-package workflow.

| Source | Concepts adapted |
| --- | --- |
| Hunicke, LeBlanc, and Zubek, [MDA](https://users.cs.northwestern.edu/~hunicke/MDA.pdf); Ryan and collaborators, [PENS](https://selfdeterminationtheory.org/player-experience-of-needs-satisfaction-pens/) | Causal experience framing and autonomy/competence/relatedness as motivation diagnostics |
| Joris Dormans, [Machinations research](https://ojs.aaai.org/index.php/AIIDE/article/view/12477); Daniel Cook, [The Chemistry of Game Design](https://www.gamedeveloper.com/design/the-chemistry-of-game-design) | Resource-flow, feedback-loop, action-feedback-learning, and skill-chain analysis |
| Hunicke and Chapman, [dynamic difficulty](https://users.cs.northwestern.edu/~hunicke/pubs/Hamlet.pdf); Valve, [Left 4 Dead AI systems](https://steamcdn-a.akamaihd.net/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf) | Challenge dimensions, adaptive pressure, intensity waves, and the distinction between pacing frequency and difficulty amplitude |
| Microsoft Games Studios, [RITE](https://jpattonassociates.com/wp-content/uploads/2015/04/rite_method.pdf); Microsoft, [Xbox Accessibility Guidelines](https://learn.microsoft.com/en-us/xbox/accessibility/guidelines) | Rapid verified playtest iteration and player-informed accessibility checks |
| GDC talks by [David Shaver and Robert Yang](https://www.gdcvault.com/play/1025360/Level-), [Jane Ng](https://www.gdcvault.com/play/1022409/Designing-for-Exploration-and-Choice), [Matt Thorson](https://www.gdcvault.com/play/1024307/Level-Design-Workshop-Designing-Celeste), [Jolie Menzel](https://www.gdcvault.com/play/1023139/Level-), [Andrew Yoder](https://gdcvault.com/play/1025183/Level-Design-Workshop-The-Holy), [Clemence Maurer](https://gdcvault.com/play/1024305/Level-Design-Workshop-Rewarding-Exploration), [Dave Feltham](https://gdcvault.com/play/1018166/Emotional-Journey-BioWare-s-Methods), [Matthias Worch](https://gdcvault.com/play/1020570/), and [Brendon Chung](https://www.gdcvault.com/play/1022117/level-design-in-a-day) | Graybox testing, spatial wayfinding, exploration, movement stages, puzzle diagnosis, multiplayer maps, narrative pacing, and informed spatial choice |

## Game concepts

Some of the games in `games/*` are our own take on someone else's idea. We
credit the originators here, in the game's on-screen HUD (which each game
renders itself — for example, Lantern Reach ships a `CreditLine`
in its HUD), and on the game's jgengine.com page. Each game declares its own
attribution via `export const credit` in its `game.config.ts`; the game page
(`apps/web/src/routes/games.$id.tsx`) renders that credit beneath the runner,
sourced from the game's config rather than a hand-maintained web registry.

### Levy Street — *World of ClaudeCraft*

**[Lantern Reach](games/lantern-reach)** began as a port of
**[world-of-claudecraft](https://github.com/levy-street/world-of-claudecraft)**
by **[Levy Street](https://github.com/levy-street)** (MIT) — a from-scratch,
browser-based classic-era MMORPG built almost entirely with AI coding agents:
nine classes, three zones, dungeons, professions, PvP, and a deterministic
20 Hz simulation that doubles as a Gymnasium RL environment. Our version
rebuilds the core of that game on the engine's own primitives — the exact
movement, armor, and XP formulas, the class kits, the three zone bands
(Eastbrook Vale, Mirefen Marsh, Thornpeak Heights), the mob rosters and loot
tables, and the Gravecaller storyline down to Morthen in the Hollow Crypt —
credited here and on the game's HUD.

The port's committed 3D art is not upstream's: the `.glb` models under
[`apps/dev/public/models/lantern-reach/`](apps/dev/public/models/lantern-reach) —
player classes, weapons, creatures, and enemies — are CC0 **KayKit**
(adventurer classes, weapons, skeletons) and **Quaternius** (animals, monsters)
models, renamed to match the roles in upstream's visual manifest. See the
KayKit and Quaternius sections above.

### Classic games (Wave 2)

A handful of genre-anchor classics in `games/*` are our own builds of decades-old
game concepts — original code, art, and levels, but the mechanics trace back to
specific inventors and titles. Credited here and on each game's HUD; all
lineages this wave are corporate or traditional, so each game shows a
genre-homage line rather than crediting a named individual creator.

| Game | id | Lineage |
| --- | --- | --- |
| **[Vice Isle](games/vice-isle)** | `vice-isle` | Rockstar Games's **Grand Theft Auto** series, in the cel-shaded look of Gearbox's **Borderlands** — genre homage. |
| **[Ironhold](games/ironhold)** | `ironhold` | Blizzard Entertainment's **Warcraft III** — the base-and-army real-time-strategy skirmish (select, command, attack-move, focus-fire). Original code, art, and map; only the feel and verb set are harvested. |

## First-party generated assets

The fantasy sprite sheets under `apps/dev/public/game-assets/wow/` and
`apps/desktop/public/game-assets/wow/` (character portraits, ability and item
icons, plus their slicing manifests) were AI-generated for this repository and
sliced into sheets by its own tooling. They are first-party assets — no
third-party artwork, asset pack, or outside artist is involved.

### Material authoring proof assets

The material showcase bundles [SheenChair](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/edc7c9e67c639d230715049ee31f9a96a6babbbe/Models/SheenChair) by Eric Chadwick for Wayfair, LLC (2020), CC0-1.0. Its original embedded material maps and authorship are retained. Sample bytes are not distributed in the SDK. The strand coverage SVG and material parameter starting points are original JGengine contributor work under Apache-2.0. The rough-ground maps use the existing ambientCG Ground025 CC0 source already credited above.
