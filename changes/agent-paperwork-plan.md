Planning a game is one command, and asking whether the engine already has a feature is one call for many features. `jgengine plan <game> --brief "<brief>"` writes the game's `PLAN.md`; once the agent lists the features, running it again fills in each feature's engine owner (capability, import, folder) and the gaps that need engine work, and the agent orders the milestones, one PR each. `jgengine has torpor riding "snap building" weather` answers every feature as one JSON document (covered, partial or gap). AGENTS.md now measures the engine by the time from an idea to a deep playable game and makes the plan the first step of building one.

Prevention: has and plan tests cover the covered, partial and gap verdicts with their folders and imports, the feature words looked up, a refresh that keeps the hand-written milestones, replaces its own sections and is stable, and the milestone tally.

### Added

- `jgengine plan <game> [--brief "<text>"]`: writes or refreshes `<game>/PLAN.md` — features, the engine owner of each, the gaps, milestones.
- `jgengine has <feature> ...`: one JSON answer for many features from the capability index and code map `find` reads.
