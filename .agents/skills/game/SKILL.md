---
name: game
description: Alias â€” build a game to harvest engine gaps. Use harvest-game for a minimal probe or harvest-full-game for a full build. Invoke with a game name ("like <game>"), a genre, or nothing to have one picked.
disable-model-invocation: true
---

# game â€” alias

This skill is a thin redirect. Pick the real one by scope:

- **`harvest-game`** â€” build a minimal playable slice to probe the engine surface for gaps. Use this for a quick harvest.
- **`harvest-full-game`** â€” build the whole game from the compact `jgengine` intake and routed API domains. Use this when you want the deep gaps only a full build reaches.

Both run the same loop (research â†’ build â†’ track gaps â†’ verify per `jgengine-verify` â†’ file `[FEATURE]` issue(s) â†’ push, PR, merge). Invoke the one that matches your scope; do not follow this file directly.


