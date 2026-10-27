Fernwild's Survivor's path takes a new survivor from the first tree to the Broodmother in 23 steps, with a star on the map at each target.

Engine seam: packages/core/src/inventory/spoilage.ts, packages/core/src/onboarding/onboarding.ts, packages/core/src/onboarding/onboardingSystem.ts

### Added

- Fernwild's Survivor's path takes a new survivor from the first tree to the Broodmother in 23 steps, with a star on the map at each target.
- Fernwild taming works from a new game with no cheats: punch a dodo out and feed it berries, club a phiomia and keep it under with narcotics. A club hit now lands its full torpor.
- Fernwild has 21 explorer notes, a Dossier tab of species met, tamed and notes read, and an always-on map baked from the island's ground with notes, obelisks, caves and tames marked.
- Fernwild danger rises with distance (wild levels capped at 5 by the beach, the full 30 from 1250 m), and the start beach holds only grazers.
- createSpoilage in @jgengine/core/inventory/spoilage; Fernwild meat spoils into spoiled meat and the timers survive a save.
- an onboarding step can set inArea: false so a teaching-area pointer sends the player past the area.
- Fernwild's PLAN.md design brief compares it with ARK beat by beat, and its from-zero proof plays 19 minutes from a new game; Fernwild is off the depth known-failing list.
- `createSpoilage` (`@jgengine/core/inventory/spoilage`): Perishables in an inventory, as ARK keeps them: each stack runs one timer, and every time it runs out one unit spoils and the timer starts again, so a big stack lasts longer than a small one. Also `SpoilRule`, `Spoilage`, `SpoiledUnits`, `SpoilingStack`.

### Fixed

- Fernwild's Harvest Stones prompt no longer shows when you aim at a tree.
- Fernwild's dehydration test steps whole seconds so it finishes inside CI's test timeout.
