Every creature that lives on Fernwild's island now exists: 55 species with ARK wiki stats (health, stamina, torpor, weight, melee, speeds, per-level gains, temperament, diet, taming foods, saddle level), each with its own animated body, so all 231 spawn zones fill with their full species mix instead of only dodos, phiomias and raptors. Every rideable species has a saddle item and engram generated from its stats. Bodies come from a new engine module that builds an animated creature model (idle, walk, run, attack, death) from a short body plan: torso, legs, neck, head, tail and features such as horns, frills, plates, sails, shells, wings, tusks, trunks and mandibles, with no art files. A bigger island queues hundreds of refills, so herds now wake, sleep and refill on a half-second beat (or at once when the survivor moves far), and the population director asks each region whether it is awake once per tick and leaves its queue alone when nothing is due. The taming proof now also checks the knocked-out raptor lies a body's length from the survivor, and the hut proof lines up square with the doorway and hops again if a frame hitch leaves the first jump short of the floor.

Engine seam: packages/core/src/creatureBody/ (new: bodyPlan.ts, glbWrite.ts), packages/core/src/ai/populationDirector.ts (isActive asked once per region per tick; no queue copy on idle ticks)

Prevention: creatureBody tests (a plan becomes a GLB with the five clip names; leg counts for quadruped, biped, spider and snake; features add geometry; feet stand on the ground; same plan gives the same bytes, and the data URL is built only when read), population director test (each region asked once per tick however many refills it has queued), headless Fernwild test (every species any spawn zone lists has stats and a body).

### Added

- `bodyModel`, `bodyGlbModel`, `BodyPlan` (`@jgengine/core/creatureBody/bodyPlan`): describe a creature's shape in a few numbers and get an animated `ModelConfig` (Idle, Walk, Run, Attack, Death clips), built lazily as a `data:` GLB the first time its url is read.
- `encodeGlb`, `glbDataUrl` (`@jgengine/core/creatureBody/glbWrite`): write a node-animated binary glTF from meshes, nodes and clips.

### Changed

- `PopulationTickContext.isActive` is asked at most once per region per tick, and a tick with nothing due no longer copies the respawn queue.
