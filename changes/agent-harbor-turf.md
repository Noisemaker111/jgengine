### Added

- `defineTurfWar` (`@jgengine/core/worldModel/turfWar`) turns a turf war between any number of sides into world-model triggers, ripples and schedules: a block changes hands to whichever side wore its grip to zero, each side's front pushes into neighbouring blocks on its own clock (gated by `when` and `chance`, with a note, a hook and world changes per push), and `view`, `held` and `handover` read the live war for maps, phones and news.
