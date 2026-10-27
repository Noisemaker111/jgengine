createCoachMarkSequence, CoachMark and CoachMarkHost. UI tours are onboarding steps now: give a step an anchor (CSS selector) and placement, or finish it on Next, and OnboardingCallout shows it as a card with a spotlight, Next and Skip, saved with the game

### Migrate

- declare the tour's steps in createOnboardingSystem({ steps: [{ id, text, detail, anchor, placement, done: { next: true } }] }) and mount <OnboardingCallout />; a coach-mark condition becomes done: { when } or { event }

### Added

- `OnboardingCallout` (`@jgengine/core/onboarding/onboardingCallout.view`): The onboarding's UI callout, for steps about the interface rather than the world: a step with an `anchor` (a CSS selector) gets a card beside that element with a spotlight around it, and a step that finishes on Next with no anchor gets a centred card. Also `OnboardingCalloutCard`, `OnboardingCalloutCardProps`, `OnboardingCalloutProps`, `OnboardingCalloutTheme`.
- `OnboardingCallout` (`@jgengine/react`): The onboarding's UI callout, for steps about the interface rather than the world: a step with an `anchor` (a CSS selector) gets a card beside that element with a spotlight around it, and a step that finishes on Next with no anchor gets a centred card. Also `OnboardingCalloutCard`, `OnboardingCalloutCardProps`, `OnboardingCalloutProps`, `OnboardingCalloutTheme`.

### Removed

- createCoachMarkSequence, CoachMark and CoachMarkHost. UI tours are onboarding steps now: give a step an anchor (CSS selector) and placement, or finish it on Next, and OnboardingCallout shows it as a card with a spotlight, Next and Skip, saved with the game
- `@jgengine/core/ui` no longer exports `CoachMarkPlacement`, `CoachMarkSequence`, `CoachMarkSequenceOptions`, `CoachMarkSnapshot`, `CoachMarkStep`, `CoachMarkView`, `createCoachMarkSequence`.
- `@jgengine/core/ui/coachMarks` no longer exports `CoachMarkPlacement`, `CoachMarkSequence`, `CoachMarkSequenceOptions`, `CoachMarkSnapshot`, `CoachMarkStep`, `CoachMarkView`, `createCoachMarkSequence`.
- `@jgengine/core/ui/coachMarks.view` no longer exports `CoachMark`, `CoachMarkHost`, `CoachMarkHostProps`, `CoachMarkProps`, `CoachMarkTheme`, `useCoachMarks`.
- `@jgengine/react` no longer exports `CoachMark`, `CoachMarkHost`, `CoachMarkHostProps`, `CoachMarkProps`, `CoachMarkTheme`, `useCoachMarks`.
