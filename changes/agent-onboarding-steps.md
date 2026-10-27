onboarding as data (createOnboardingSystem). A game declares its steps; each has text, can point at an entity, the nearest thing of a kind or a spot (on-screen pin or edge arrow, minimap marker, waypoint), completes from a game event, a condition, a measured amount or a Next press, can lock commands until done, and grants items, xp, currency or unlocks. Three styles: a separate tutorial level, a teaching start area, or hints blended into stage one. Skippable, saved per player, shown in the quest tracker and objective banner (OnboardingHud, OnboardingBanner, OnboardingPointer, onboardingLock)

Engine seam: packages/core/src/hud/floatingTextWorld.draw.tsx, packages/core/src/map/waypointMarkers.view.tsx, packages/core/src/onboarding/OnboardingPointer.draw.tsx, packages/core/src/onboarding/onboarding.ts, packages/core/src/onboarding/onboarding.view.tsx, packages/core/src/onboarding/onboardingSystem.ts, packages/core/src/runtime/gameContext.ts, packages/core/src/runtime/gameContextTypes.ts

### Added

- onboarding as data (createOnboardingSystem). A game declares its steps; each has text, can point at an entity, the nearest thing of a kind or a spot (on-screen pin or edge arrow, minimap marker, waypoint), completes from a game event, a condition, a measured amount or a Next press, can lock commands until done, and grants items, xp, currency or unlocks. Three styles: a separate tutorial level, a teaching start area, or hints blended into stage one. Skippable, saved per player, shown in the quest tracker and objective banner (OnboardingHud, OnboardingBanner, OnboardingPointer, onboardingLock)
- ctx.game.commands.gate, one place to refuse commands before they run
- Fernwild's first day: punch a tree for thatch, gather stone, craft a Stone Pick, tame a dodo, each pointing at the nearest tree, stones or dodo with an arrow and a minimap star; engram learning waits for the pick
- `Onboarding` (`@jgengine/core/onboarding/onboarding`): One player's run through an {@link OnboardingConfig}. Also `OnboardingConfig`, `OnboardingDone`, `OnboardingPoint`, `OnboardingSnapshot`, `OnboardingStep`, `OnboardingStepView`, `OnboardingStyle`, `OnboardingTarget`.
- `OnboardingBanner` (`@jgengine/core/onboarding/onboarding.view`): The step-done banner ("Gather stone" / "Next: Craft a Stone Pick") through `ObjectiveBannerHost`, near the top of the screen. Also `OnboardingHud`, `OnboardingHudProps`, `useOnboarding`.
- `OnboardingPointer` (`@jgengine/core/onboarding/OnboardingPointer.draw`): The onboarding's on-screen pointer, mounted in a game's `WorldOverlay`: a pin over the current step's target while it is in view, an edge arrow pointing the way with the distance while it is not (`WaypointMarkers` over the onboarding's waypoint).
- `ONBOARDING_MARK` (`@jgengine/core/onboarding/onboardingSystem`): The id of the waypoint and minimap marker the onboarding owns. Also `OnboardingRuntime`, `OnboardingSystemOptions`, `createOnboardingSystem`, `onboardingLock`, `onboardingOf`.

### Fixed

- waypoint pins and edge arrows near a screen edge keep their label on screen
- world-anchored floating text no longer re-renders every frame while nothing floats
