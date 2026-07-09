---
name: game
description: Alias — build a game to harvest engine gaps. Use harvest-game for a minimal probe or harvest-full-game for a full build. Invoke with a game name ("like <game>"), a genre, or nothing to have one picked.
disable-model-invocation: true
---

# game — alias

This skill is a thin redirect. Pick the real one by scope:

- **`harvest-game`** — build a minimal playable slice to probe the engine surface for gaps. Use this for a quick harvest.
- **`harvest-full-game`** — build the whole game via the `jgengine-newgame` blueprint-and-phases workflow. Use this when you want the deep gaps only a full build reaches.

Both run the same loop (research → build → track gaps → verify per `jgengine-verify` → file `[FEATURE]` issue(s) → push, PR, queue auto-merge). Invoke the one that matches your scope; do not follow this file directly.
