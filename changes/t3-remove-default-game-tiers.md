the engine's built-in reputation and mood tier lists (one was World of Warcraft's); each game passes its own

Refs #2817

Engine seam: packages/core/src/agents/agent.ts, packages/core/src/agents/mood.ts, packages/core/src/agents/system.ts, packages/core/src/faction/reputation.ts, packages/core/src/progression/standing.ts, packages/core/src/world.ts

### Migrate

- DEFAULT_REPUTATION_TIERS and DEFAULT_MOOD_TIERS are gone; pass your game's tier list to createReputationLedger, StandingTrackDef.tiers, moodTierOf, readMood, createMoodReader, createAgent mood and createAgentSystem mood

### Removed

- the engine's built-in reputation and mood tier lists (one was World of Warcraft's); each game passes its own
- `@jgengine/core/agents/mood` no longer exports `DEFAULT_MOOD_TIERS`.
- `@jgengine/core/faction/reputation` no longer exports `DEFAULT_REPUTATION_TIERS`.
- `@jgengine/core/world` no longer exports `DEFAULT_REPUTATION_TIERS`.
