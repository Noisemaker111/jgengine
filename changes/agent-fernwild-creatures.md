Fernwild gets ARK's creatures: dodo, phiomia and raptor herds with ARK's stats and temperaments, knock-out taming by club and food, follow and stay orders, saddles and riding. The engine gains knock-out taming, a creature driver and riding.

Engine seam: packages/core/src/taming/knockoutTaming.ts, packages/core/src/ai/creatureDriver.ts, packages/core/src/scene/riding.ts, packages/shell/src/render/SkinnedInstances.tsx (crowd bake bounds and static skins)

Prevention: knockout-taming tests (18 club hits on a level-1 raptor, 7 raw meat in about 302 s, preferred food first, starving loses progress, waking resets), creature-driver tests (a hit grazer flees, a hunter closes and bites on its interval, a hunter charges to its body's reach whatever its temperament was tuned with, a hunter veers around a trunk, a tame follows and stays), riding tests, crowd-bake tests (an imported boar is the same height near and far; a clip-less skin bakes upright), a headless Fernwild test (club, tame, saddle, ride and dismount a raptor; carve a dodo); loop proof `bun run drive fernwild --flow fernwild-tame`.

Bends: none.

### Added

- `createKnockoutTaming` (`@jgengine/core/taming/knockoutTaming`): ARK-style torpor knock-out and passive feeding taming. Per species: torpor by level, torpor drain, a food table (count and seconds at level 1 and 30, ineffectiveness). Tracks preferred food first, the meal clock, taming effectiveness, bonus levels, waking and starving; snapshot/restore.
- `createCreatureDriver` (`@jgengine/core/ai/creatureDriver`): moves and fights a creature from a mind (wild temperament, tamed companion intent, or still) and a body (walk, sprint, attack, wander). Wild creatures sense with their own perception and hold a grudge against whoever hurt them; they flee, stalk, bite or graze. The charge stops where the body's bite reaches, so a temperament tuned with a shorter range never stalls just out of reach, and steps veer around trunks and rocks instead of stopping behind them.
- `ridingOf` (`@jgengine/core/scene/riding`): ride a mount by seat offset. It hands controls to the mount through possession, freezes the rider and carries them on the seat, and sets them down beside the mount on dismount; snapshot/restore.

### Fixed

- Distant skinned creatures drew at the wrong size: the character crowd measured a skinned mesh by its node transform instead of its bones, so a boar normalised to 1.9 m stood about 9 m tall past the crowd distance. The bake now measures exactly as the full model path does.
- A skinned model with no clips (a Rocketbox duck) baked into the crowd lying on its side at its raw quantized size; static crowd copies now bake each vertex at its skin-applied bind pose.
