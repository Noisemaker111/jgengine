### Added

- `createVisitorPopulation` (`@jgengine/core/sim/population`) counts a crowd by its members: a visitor exists only once the game's `VisitorWorld.admit` has made its body and `VisitorWorld.has` confirms it, so `onSite()` is the member count and `arrivalsToday()` is the sum of the admissions the world accepted. `arrivalRate`, `capacity`, `shouldLeave` and `inside` are caller policy; `adopt` takes over a body a save or a seed made; `rollDay()` closes the day without emptying the park.
