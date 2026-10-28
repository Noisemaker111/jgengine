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
- Ship resistance and propulsion factors: J. Holtrop and G. G. J. Mennen, "An approximate power prediction method", *International Shipbuilding Progress* 29 (1982) 166–170, and J. Holtrop, "A statistical re-analysis of resistance and propulsion data", *ISP* 31 (1984) 272–276: the regression formulas and the 1982 numerical example the method is tested against. ITTC-1957 friction line and ITTC-1978 propeller scale correction (ITTC Recommended Procedures). Methods and published data only. Used by `physics/reference/shipResistance.ts`.
- Wageningen B-series open-water polynomials: M. W. C. Oosterveld and P. van Oossanen, "Further computer-analyzed data of the Wageningen B-screw series", *ISP* 22 (1975) 251–262, Table 1 coefficients, checked term by term against two independent transcriptions (Fossen's MSS toolbox `WageningData.txt` and insightcae's `WageningenB`, read for reference, no code copied). Used by `physics/reference/marinePropeller.ts`.
- Planing hulls: D. Savitsky, "Hydrodynamic design of planing hulls", *Marine Technology* 1 (1964) 71–95 (lift, centre of pressure, mean bottom velocity and the equilibrium of forces); the porpoising-limit curves of that paper as fitted in OpenPlaning by E. L. Castro-Feliciano (MIT License, github.com/elcf/python-openplaning; the three cubic fits are used as data). Tank data: D. B. Chambliss and G. M. Boyd, *The Planing Characteristics of Two V-Shaped Prismatic Surfaces Having Angles of Dead Rise of 20° and 40°*, NACA TN 2876 (1953), public domain, Table I. Used by `physics/reference/planingHull.ts`.
- Hull hydrostatics: closed-form Wigley hull particulars and the wall-sided righting-arm formula, textbook results (e.g. E. C. Tupper, *Introduction to Naval Architecture*). Surge added mass: H. Lamb, *Hydrodynamics*, 6th ed. (1932), §373, prolate spheroid. Used by `physics/reference/hullHydrostatics.ts` and `boatComparison.ts`.
- Ship manoeuvring: H. Yasukawa and Y. Yoshimura, "Introduction of MMG standard method for ship maneuvering predictions", *J. Mar. Sci. Technol.* 20 (2015) 37–52, open access under CC BY 4.0: the MMG equations and the KVLCC2 L7 coefficients, turning and zig-zag results of its Tables 1 and 3–5 (free-running tests by MARIN for SIMMAN 2008). Used by `physics/reference/shipManoeuvring.ts` and `boatComparison.ts`.
- Seakeeping: N. Salvesen, E. O. Tuck and O. Faltinsen, "Ship motions and sea loads", *Trans. SNAME* 78 (1970) (strip theory, zero-speed form); W. Frank, *Oscillation of cylinders in or below the free surface of deep fluids*, NSRDC Report 2375 (1967), public domain (close-fit source method); F. M. Lewis (1929) sections with the a1/a3 fit of J. M. J. Journée and L. J. M. Adegeest, *Theoretical Manual of Strip Theory Program SEAWAY* (TU Delft); JONSWAP and Pierson–Moskowitz spectra in the form of DNV-RP-C205; T. von Kármán (1929) momentum slamming. Methods only. Used by `physics/reference/oceanWaves.ts`, `sectionHydrodynamics.ts`, `stripTheory.ts` and `seakeepingHull.ts`.

## Human locomotion reference

Used by `packages/core/src/movement/reference/`. Equations and published data only; no code copied.

- Body segments: P. de Leva, "Adjustments to Zatsiorsky–Seluyanov's segment inertia parameters", *J. Biomech.* 29 (1996) 1223–1230; D. A. Winter, *Biomechanics and Motor Control of Human Movement*, 4th ed., Wiley (2009). Used by `anthropometry.ts`.
- Joint strength: the joint moment–angle–velocity meta-visualization, bioRxiv 10.1101/2024.06.22.600197 (2024); F. C. Anderson and M. G. Pandy, *Comput. Methods Biomech. Biomed. Eng.* 2 (1999); A. Thorstensson, G. Grimby and J. Karlsson, *J. Appl. Physiol.* 40 (1976); A. V. Hill, *Proc. R. Soc. B* 126 (1938); M. A. King and M. R. Yeadon, *J. Appl. Biomech.* 18 (2002). Used by `jointStrength.ts`.
- Foot contact: K. H. Hunt and F. R. E. Crossley, "Coefficient of restitution interpreted as damping in vibroimpact", *J. Appl. Mech.* 42 (1975). Used by `footContact.ts`.
- Muscles and reflexes: H. Geyer and H. Herr, "A muscle-reflex model that encodes principles of legged mechanics produces human walking dynamics and muscle activities", *IEEE Trans. Neural Syst. Rehabil. Eng.* 18 (2010); H. Geyer, A. Seyfarth and R. Blickhan, "Positive force feedback in bouncing gaits?", *Proc. R. Soc. B* 270 (2003); S. Song and H. Geyer, "A neural circuitry that emphasizes spinal feedback generates diverse behaviours of human locomotion", *J. Physiol.* 593 (2015). Used by `muscleTendon.ts` and `reflexWalker.ts`.
- Muscle energetics: A. E. Minetti and R. McN. Alexander, "A theory of metabolic costs for bipedal gaits", *J. Theor. Biol.* 186 (1997). Used by `muscleTendon.ts`.
- Fitting: N. Hansen, "The CMA Evolution Strategy: A Tutorial", arXiv:1604.00772. Used by `packages/core/src/math/cmaEvolutionStrategy.ts`.
- Running: R. Blickhan, "The spring-mass model for running and hopping", *J. Biomech.* 22 (1989); T. A. McMahon and G. C. Cheng, *J. Biomech.* 23 (1990); C. T. Farley, J. Glasheen and T. A. McMahon, *J. Exp. Biol.* 185 (1993); P. R. Cavanagh and R. Kram, *Med. Sci. Sports Exerc.* 21 (1989); P. R. Cavanagh and M. A. Lafortune, *J. Biomech.* 13 (1980); P. G. Weyand et al., *J. Appl. Physiol.* 89 (2000). Used by `springMassRunning.ts`.
- Sprint, braking and curves: P. Samozino et al., *Scand. J. Med. Sci. Sports* 26 (2016); J.-B. Morin and P. Samozino, *Int. J. Sports Physiol. Perform.* 11 (2016); C. Arsac and E. Locatelli, *J. Appl. Physiol.* 92 (2002); D. J. Harper et al., *Eur. J. Sport Sci.* 22 (2022); E. Draper and M. Lancaster (1985) and S. Nimphius et al., *J. Strength Cond. Res.* 30 (2016) for the 505 test; Y.-H. Chang and R. Kram, *J. Exp. Biol.* 210 (2007); J. R. Usherwood and A. M. Wilson, *Biol. Lett.* 2 (2006); P. R. Greene, *J. Biomech.* 18 (1985). Used by `humanEnvelope.ts` and `curveRunning.ts`.
- Slopes: A. E. Minetti et al., "Energy cost of walking and running at extreme uphill and downhill slopes", *J. Appl. Physiol.* 93 (2002). Used by `humanEnvelope.ts`.
- Jumping: D. Selbie and G. Caldwell, *J. Biomech.* 29 (1996); M. F. Bobbert et al., *Med. Sci. Sports Exerc.* 28 (1996); N. P. Linthorne, *Am. J. Phys.* 69 (2001); C. Bosco, P. Luhtanen and P. V. Komi, *Eur. J. Appl. Physiol.* 50 (1983); G. Markovic et al., *J. Strength Cond. Res.* 18 (2004). Used by `humanJump.ts`.
- Validation data: H. J. Ralston, *Int. Z. Angew. Physiol.* 17 (1958); R. W. Bohannon and A. W. Andrews, *Physiotherapy* 97 (2011); M. P. Murray, A. B. Drought and R. C. Kory, *J. Bone Joint Surg.* 46 (1964); D. A. Winter, *The Biomechanics and Motor Control of Human Gait*, 2nd ed., University of Waterloo Press (1991); A. Hreljac, *J. Biomech.* 26 (1993); A. Thorstensson and H. Roberthson, *Acta Physiol. Scand.* 131 (1987); R. McN. Alexander, *Physiol. Rev.* 69 (1989); R. Margaria et al., *J. Appl. Physiol.* 18 (1963); P. E. di Prampero et al., *Eur. J. Appl. Physiol.* 55 (1986). Used by `humanReferenceValidation.ts`.
- Gait initiation: P. Crenna and C. Frigo, "A motor programme for the initiation of forward-oriented movements in humans", *J. Physiol.* 437 (1991). Used by `compareLocomotion.ts`.
- Quadrupeds: R. McN. Alexander and A. S. Jayes, "A dynamic similarity hypothesis for the gaits of quadrupedal mammals", *J. Zool.* 201 (1983), table 2 as tabulated by A. C. Basu et al., *J. Exp. Biol.* 222 (2019); C. L. Shine et al., *J. Exp. Biol.* 218 (2015); A. A. Biewener, *J. Exp. Biol.* 105 (1983); N. C. Heglund and C. R. Taylor, "Speed, stride frequency and energy cost per stride: how do they change with body size and gait?", *J. Exp. Biol.* 138 (1988); M. R. Hirt et al., "A general scaling law reveals why the largest animals are not the fastest", *Nat. Ecol. Evol.* 1 (2017), and its supplementary data. Used by `quadrupedGait.ts`.
- Falls and landings: S. N. Robinovitch, W. C. Hayes and T. A. McMahon, *J. Biomech. Eng.* 113 (1991); "Leg joint stiffness affects dynamics of backward falling from standing height", *J. Biomech. Eng.* 142 (2020); "Impact forces in backward falls: subject-specific video-based rigid body simulation of backward falls" (PMC10685694, 2023); W. Niu, T. Feng, C. Jiang and M. Zhang, *Biomed Res. Int.* 2014, 126860; A. C. Courtney et al., *J. Bone Joint Surg.* 77-A (1995); K. Gruber, H. Ruder, J. Denoth and K. Schneider, "A comparative study of impact dynamics: wobbling mass model versus rigid body models", *J. Biomech.* 31 (1998); M. T. G. Pain and J. H. Challis, "Wobbling mass influence on impact ground reaction forces: a simulation model sensitivity analysis", *J. Appl. Biomech.* 20 (2004), table 1; M. Santello and M. J. N. McDonagh, *Exp. Physiol.* 83 (1998); US FMVSS 208 (49 CFR 571.208). Used by `humanFall.ts` and `compareRagdollFall.ts`.

## Granular materials reference physics

All implemented from the papers; no code copied from LIGGGHTS, YADE or other DEM codes. Used by `physics/reference/discreteElements.ts` and `discreteElementExperiments.ts`.

- Soft-sphere DEM: P. A. Cundall and O. D. L. Strack, "A discrete numerical model for granular assemblies", *Géotechnique* 29 (1979) 47–65. Hertz–Mindlin contact with the restitution dashpot of Y. Tsuji, T. Tanaka and T. Ishida, *Powder Technology* 71 (1992) 239–250, in the form of D. Antypov and J. A. Elliott, *EPL* 94 (2011) 50004.
- Rolling resistance: J. Ai, J.-F. Chen, J. M. Rotter and J. Y. Ooi, "Assessment of rolling resistance models in discrete element simulations", *Powder Technology* 206 (2011) 269–282 (EPSD model). C. M. Wensrich and A. Katterfeld, *Powder Technology* 217 (2012) 409–417 (rolling friction as a shape proxy).
- Capillary bridges: C. D. Willett, M. J. Adams, S. A. Johnson and J. P. K. Seville, *Langmuir* 16 (2000) 9396–9405 (force); G. Lian, C. Thornton and M. J. Adams, *J. Colloid Interface Sci.* 161 (1993) 138–147 (rupture distance). Damp-heap excess angle: S. Nowak, A. Samadani and A. Kudrolli, *Nature Physics* 1 (2005) 50–52.
- Angle of repose of dry sands: Y. Al-Hashemi and O. S. B. Al-Amoudi, "A review on the angle of repose of granular materials", *Powder Technology* 330 (2018) 397–417. Glass-bead contact data: S. F. Foerster, M. Y. Louge, H. Chang and K. Allia, *Physics of Fluids* 6 (1994) 1108–1115.
- Silos: H. A. Janssen, *Zeitschrift des Vereines Deutscher Ingenieure* 39 (1895) 1045–1049; L. Vanel and E. Clément, *Eur. Phys. J. B* 11 (1999) 525–533; J. Jaky, *J. Soc. Hungarian Architects and Engineers* (1944) for K₀ = 1 − sin φ.
- Discharge: W. A. Beverloo, H. A. Leniger and J. van de Velde, *Chem. Eng. Sci.* 15 (1961) 260–269; R. M. Nedderman, *Statics and Kinematics of Granular Materials* (1992).
- Brazil-nut segregation: A. Rosato, K. J. Strandburg, F. Prinz and R. H. Swendsen, *Phys. Rev. Lett.* 58 (1987) 1038; J. B. Knight, H. M. Jaeger and S. R. Nagel, *Phys. Rev. Lett.* 70 (1993) 3728.
- Column collapse: G. Lube, H. E. Huppert, R. S. J. Sparks and M. A. Hallworth, "Axisymmetric collapses of granular columns", *J. Fluid Mech.* 508 (2004) 175–199. Used by `collapsedColumn` and `granular/granularExperiments.ts`.

The game-facing granular layer in `granular/` (`granularMaterial.ts`, `granularLayer.ts`, `granularTerrain.ts`) is implemented from these papers:

- Depth-averaged flow: S. B. Savage and K. Hutter, *J. Fluid Mech.* 199 (1989) 177–215; well-balanced upwinding over bed steps after E. Audusse, F. Bouchut, M.-O. Bristeau, R. Klein and B. Perthame, *SIAM J. Sci. Comput.* 25 (2004) 2050–2065.
- Basal friction law and glass-bead constants: O. Pouliquen, *Phys. Fluids* 11 (1999) 542–548; O. Pouliquen and Y. Forterre, "Friction law for dense granular flows", *J. Fluid Mech.* 453 (2002) 133–151.
- Pressure–sinkage: M. G. Bekker, *Theory of Land Locomotion* (1956) and *Introduction to Terrain-Vehicle Systems* (1969); soil values from J. Y. Wong, *Theory of Ground Vehicles*, 4th ed. (2008), Table 2.3.
- Cohesive banks: K. Culmann, *Die graphische Statik* (1866), the planar-wedge critical height as given in K. Terzaghi, *Theoretical Soil Mechanics* (1943). Capillary tensile strength: H. Rumpf, *Chem. Ing. Tech.* 30 (1958) 144–158.

## Rock fracture

Implemented from the papers; no code copied from PFC, LIGGGHTS or YADE. Used by the parallel bonds in `physics/reference/discreteElements.ts`, by `physics/reference/bondedRock.ts`, and by the game model and `fractureComparison.ts` in `fracture/`.

- Bonded-particle model: D. O. Potyondy and P. A. Cundall, "A bonded-particle model for rock", *Int. J. Rock Mech. Min. Sci.* 41 (2004) 1329–1364 (parallel bonds, their strengths and spread, k̄n/k̄s = 2.5).
- Rock properties: R. E. Goodman, *Introduction to Rock Mechanics*, 2nd ed. (1989); W. F. Brace, "Brittle fracture of rocks" (1964), for Westerly granite; B. K. Atkinson and P. G. Meredith, "Experimental fracture mechanics data for rocks and minerals", in *Fracture Mechanics of Rock* (1987), for K_IC. Brazilian test: ISRM, "Suggested methods for determining tensile strength of rock materials", *Int. J. Rock Mech. Min. Sci.* 15 (1978) 99–103.
- Breakage laws: P. Rosin and E. Rammler, *J. Inst. Fuel* 7 (1933) 29–36; A. M. Gaudin, *Trans. AIME* 73 (1926) 253–316; R. Schuhmann, *Trans. AIME* 141 (1940); T. J. Napier-Munn, S. Morrell, R. D. Morrison and T. Kojovic, *Mineral Comminution Circuits*, JKMRC (1996), for the t10 law; L. Vogel and W. Peukert, "Breakage behaviour of different materials", *Powder Technology* 129 (2003) 101–110, for breakage probability.
- Published drop-weight A and b ranges: the DWi and A×b table collected by [911 Metallurgist](https://www.911metallurgist.com/blog/calculating-dwi-drop-weight-index-axb-test-result/).
- Fragment energy and speed: A. Fujiwara and A. Tsukamoto, *Icarus* 44 (1980) 142–153; A. Nakamura and A. Fujiwara, *Icarus* 92 (1991) 132–146.

## Plant growth simulation

The plant simulator (`packages/core/src/plants/`) ports models and data, not code. Every source is
listed in `PLANT_SOURCES` (`plants/species/speciesSources.ts`) and named in each species record's
provenance.

- **USDA Forest Service** (US public domain): height-age curves of every species from Carmean, Hahn &
  Jacobs 1989, *Site index curves for forest tree species in the eastern United States*, GTR NC-128,
  with coefficients read from the Forest Vegetation Simulator Lake States variant (`htcalc.f`);
  Burns & Honkala 1990, *Silvics of North America*, Agriculture Handbook 654; Forest Products
  Laboratory 2010, *Wood Handbook*, FPL-GTR-190; the USDA NRCS PLANTS Database; Forest Inventory
  and Analysis site-tree data (`<state>_SITETREE.csv` and `REF_SPECIES.csv` for the states each
  species lists in `scripts/species-import/speciesTraits.ts`: stand-grown height and DBH by age);
  McPherson, van Doorn & Peper 2016, *Urban tree database*, RDS-2016-0005 (open-grown DBH by age).
- **Forest Vegetation Simulator** (USDA Forest Service, US public domain): crown-width coefficients
  from the Lake States variant (`cwcalc.f`) for open-grown trees, Ek 1974, *Dimensional
  relationships of forest and open grown trees in Wisconsin*, University of Wisconsin, and for
  forest-grown trees, Bechtold 2003, *Crown-diameter prediction models for 87 species of
  stand-grown trees in the eastern United States*, SJAF 27.
- **Tallo** (CC BY 4.0): Jucker et al. 2022, *Tallo: a global tree allometry and crown architecture
  database*, Global Change Biology 28: measured crown widths and heights by DBH of every species.
- **BAAD** (CC0): Falster et al. 2015, *BAAD: a Biomass And Allometry Database for woody plants*,
  Ecology 96: leaf area per sapwood area of temperate and boreal trees.
- Stava et al. 2014, *Inverse procedural modelling of trees*, Computer Graphics Forum 33: fitting
  growth parameters by search until grown trees match measured ones (`bun run jgengine plants`).
- Thornley 1976, *Mathematical models in plant physiology*: the rectangular-hyperbola leaf light
  response.
- Barthélémy & Caraglio 2007, plant architecture and ontogeny, *Annals of Botany* 99: the
  establishment phase of a seedling.
- Brown, McAlpine & Kormanik 1967, apical dominance and form in woody plants, *American Journal of
  Botany* 54; Wilson 2000, apical control of branch growth and angle in woody plants, *American
  Journal of Botany* 87: decurrent and excurrent habit as apical control that changes with age.
- Hart 1928 and Becking 1953, the relative spacing index of even-aged stands; Oliver & Larson
  1996, *Forest stand dynamics*: dominant trees hold more growing space than a stand's mean tree;
  Monsi & Saeki 1953, light extinction in plant canopies; Putz, Parker & Archibald 1984, mechanical abrasion and
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
- Heimsath, Dietrich, Nishiizumi & Finkel 1997, the soil production function and landscape
  equilibrium, *Nature* 388: soil production P = P₀ e^(−h/h₀) and its measured rate.
- Ferguson & Church 2004, a simple universal equation for grain settling velocity, *Journal of
  Sedimentary Research* 74: the settling speeds that sort gravel, sand and silt.
- Sternberg 1875, untersuchungen über Längen- und Querprofil geschiebeführender Flüsse, *Zeitschrift
  für Bauwesen* 25 (public domain): exponential downstream fining.
- Forte, Yanites & Whipple 2016, complexities of landscape evolution during incision through layered
  stratigraphy, *Earth Surface Processes and Landforms* 41: rivers steepening in hard layers.
- Werner 1995, eolian dunes: computer simulations and attractor interpretation, *Geology* 23: the
  slab model of dunes (lift, hop, shadow zone, avalanching) and its barchan, transverse, linear and
  star dune regimes.
- Bagnold 1941, *The Physics of Blown Sand and Desert Dunes*: dune speed falls as one over height.
- Rubin & Hunter 1987, bedform alignment in directionally varying flows, *Science* 237: linear dunes
  trending along the resultant of two winds.
- Glen 1955, the creep of polycrystalline ice, *Proceedings of the Royal Society A* 228; Cuffey &
  Paterson 2010, *The Physics of Glaciers* (4th ed.): Glen's flow law and the temperate rate factor.
- Vialov 1958, regularities of glacial shields movement and the theory of plastic viscous flow, *IAHS
  Publication* 47: the ice-sheet profile the ice solver is tested against.
- Mahaffy 1976, a three-dimensional numerical model of ice sheets, *JGR* 81: the staggered-grid
  shallow-ice flux.
- Harbor 1992, numerical modeling of the development of U-shaped valleys by glacial erosion, *GSA
  Bulletin* 104: wall drag slowing ice at a valley's corners, and the cross-section exponent.
- Humphrey & Raymond 1994, hydrology, erosion and sediment production in a surging glacier, *Journal
  of Glaciology* 40; Braun, Zwartz & Tomkin 1999, a new surface-processes model combining glacial
  and fluvial erosion, *Annals of Glaciology* 28: erosion proportional to sliding speed.
- Blatter 1995, velocity and stress fields in grounded glaciers: a simple algorithm for including
  deviatoric stress gradients, *Journal of Glaciology* 41; Pattyn 2003, a new three-dimensional
  higher-order thermomechanical ice sheet model, *JGR* 108: the first-order Stokes equations of the
  higher-order ice solver.
- Dukowicz, Price & Lipscomb 2010, consistent approximations and boundary conditions for ice-sheet
  dynamics from a principle of least action, *Journal of Glaciology* 56: the first-order equations as
  a convex functional, which the solver's Newton steps descend.
- Lipscomb et al. 2019, description and evaluation of the Community Ice Sheet Model (CISM) v2.1,
  *Geoscientific Model Development* 12 (CC BY 4.0): the hybrid surface gradient at glacier margins.
- Eisenstat & Walker 1996, choosing the forcing terms in an inexact Newton method, *SIAM Journal on
  Scientific Computing* 17: loose linear solves far from the answer.
- Pattyn et al. 2008, benchmark experiments for higher-order and full-Stokes ice sheet models
  (ISMIP-HOM), *The Cryosphere* 2 (CC BY 3.0): experiments A–D and the published ensemble speeds
  (Tables 4 and 5) the solver is tested against.
- Nye 1965, the flow of a glacier in a channel of rectangular, elliptic or parabolic cross-section,
  *Journal of Glaciology* 5; Seddik, Greve, Sugiyama & Naruse 2009, numerical simulation of the
  evolution of glacial valley cross sections (arXiv:0901.1177): Harbor's cross-section experiment,
  its parameters and the exponents and form ratios it is tested against.
- Hallet 1979, a theoretical model of glacial abrasion, *Journal of Glaciology* 23: erosion growing
  with the square of sliding speed.
- Sunamura 1992, *Geomorphology of Rocky Coasts*; Anderson, Densmore & Ellis 1999, the generation and
  degradation of marine terraces, *Basin Research* 11: cliff retreat damped by the platform it leaves,
  and platform lowering by depth.

## Fire simulation

The fire simulator (`packages/core/src/fire/`) implements published fire science from the papers; no
code is copied. Its tests check it against the expected outputs of the BehavePlus engine's test suite.

- **USDA Forest Service** (US public domain): Rothermel 1972, *A mathematical model for predicting fire
  spread in wildland fuels*, INT-115; Albini 1976, *Estimating wildfire behavior and effects*, INT-30;
  Anderson 1982, *Aids to determining fuel models for estimating fire behavior*, INT-122; Scott &
  Burgan 2005, *Standard fire behavior fuel models*, RMRS-GTR-153 (the 40 fuel models and moisture
  scenarios); Andrews 2012, *Modeling wind adjustment factor and midflame wind speed*, RMRS-GTR-266;
  Andrews, Cruz & Rothermel 2013, the revised wind limit, *International Journal of Wildland Fire* 22;
  Andrews 2018, *The Rothermel surface fire spread model and associated developments*, RMRS-GTR-371.
- Van Wagner 1977, *Conditions for the start and spread of crown fire*, Canadian Journal of Forest
  Research 7; Van Wagner 1993, crown fraction burned, CJFR 23; Rothermel 1991, *Predicting behavior and
  size of crown fires in the northern Rocky Mountains*, INT-438 (USFS); Thomas 1963, crown flame length.
- Finney 2002, *Fire growth using minimum travel time methods*, CJFR 32 (the travel-time solver is
  implemented from the paper; no FARSITE or FlamMap code); Sethian & Vladimirsky 2003, ordered upwind
  methods, the idea behind the triangle update.
- Albini 1979, *Spot fire distance from burning trees*, INT-56, and Albini 1983, *Potential spotting
  distance from wind-driven surface fires*, INT-309 (USFS); Chase 1981, spotting over ridge-valley
  terrain, INT-310; Schroeder 1969, probability of ignition, in the NFDRS form of Cohen & Deeming
  1985, PSW-82 (USFS).
- **BehavePlus / firelab `behave`** (USFS Missoula Fire Sciences Laboratory, US public domain): the
  reference outputs in `fire/surfaceFire.test.ts` and `fire/crownFire.test.ts`.
- Anderson 1969, flame residence time, INT-69; Byram 1959, fireline intensity and flame length, in
  *Forest Fire: Control and Use*; Albini & Baughman 1979, wind adjustment, INT-221; Albini & Chase
  1980, vector addition of wind and slope; Anderson 1983, *Predicting wind-driven wild land fire
  size and shape*, INT-305; Catchpole, de Mestre & Gill 1982, spread rate along an elliptical
  perimeter, *Combustion Science and Technology* 27; Turner & Lawson 1978, the 10-m to 20-ft wind ratio, Canadian Forestry Service BC-X-177; Van Wagner 1973, crown scorch height, *Canadian
  Journal of Forest Research* 3.
- **Fuel moisture** (`fire/fuelMoisture.ts`, implemented from the papers): Simard 1968, equilibrium
  moisture content of wood, USDA FPL; Cohen & Deeming 1985, *The National Fire-Danger Rating System:
  basic equations*, PSW-82 (USFS), for fuel-level sun corrections, time lags and rain boundaries;
  Byram 1963, the time-lag concept; Rothermel 1983, *How to predict the spread and intensity of
  forest and range fires*, INT-143, reference fine fuel moisture table (the test reference); Jolly,
  Nemani & Running 2005, growing season index, *Global Change Biology* 11; Jolly et al. 2016 / NFDRS
  2016, live fuel moisture ranges; Tetens 1930, saturation vapour pressure.
- **Fuel from plants and ground** (`fire/fuelSources.ts`): Scott & Reinhardt 2001, *Assessing crown
  fire potential*, RMRS-RP-29 (USFS), available canopy fuel as foliage plus half the fine branchwood;
  Jenkins, Chojnacky, Heath & Birdsey 2003, national-scale biomass estimators, *Forest Science* 49
  and NE-GTR-319 (USFS), the test reference for foliage mass.

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
