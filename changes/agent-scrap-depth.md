Scrap Signal starts like Borderlands 2: no gun and no cash; B0-LT hands out quests one at a time and takes them back, and the crash chest opens only once he sends you to it, holding one plain pistol

Engine seam: packages/core/src/mission/questGivers.ts

### Added

- Old Tusk, act 1's boss, spawned at the Monglet Den by his quest; Bolt then walks to Breakwater Shelf to meet you
- `giverOffer` (`@jgengine/core/mission/questGivers`): Ask a quest giver what it has for a player, one quest at a time: a finished quest to take back first, then nothing new while one of its quests is under way, then the first quest in catalog order whose giver it is and that the player can accept. Also `GiverOffer`, `GiverOfferOptions`.

### Changed

- Scrap Signal starts like Borderlands 2: no gun and no cash; B0-LT hands out quests one at a time and takes them back, and the crash chest opens only once he sends you to it, holding one plain pistol
- Zones stay closed until the story quest that opens them, and say which quest that is; weapon slots open with the story; the skill tree opens at level 2 and gun rarities open with level
- Engine: giverOffer (@jgengine/core/mission/questGivers) tells what a quest giver has for a player: a quest to take back, the next one to give, or nothing while one is under way

### Fixed

- quests now really complete and pay out when turned in (they used to stay active forever)

### Removed

- `@jgengine/core/onboarding/onboarding` no longer exports `Onboarding`, `OnboardingConfig`, `OnboardingDone`, `OnboardingPoint`, `OnboardingSnapshot`, `OnboardingStep`, `OnboardingStepView`, `OnboardingStyle` and 1 more.
- `@jgengine/core/onboarding/onboarding.view` no longer exports `OnboardingBanner`, `OnboardingHud`, `OnboardingHudProps`, `useOnboarding`.
- `@jgengine/core/onboarding/onboardingCallout.view` no longer exports `OnboardingCallout`, `OnboardingCalloutCard`, `OnboardingCalloutCardProps`, `OnboardingCalloutProps`, `OnboardingCalloutTheme`.
- `@jgengine/core/onboarding/OnboardingPointer.draw` no longer exports `OnboardingPointer`.
- `@jgengine/core/onboarding/onboardingSystem` no longer exports `ONBOARDING_MARK`, `OnboardingRuntime`, `OnboardingSystemOptions`, `createOnboardingSystem`, `onboardingLock`, `onboardingOf`.
