# Games

Every game built with the engine lives here, one directory per game. The rules below are mandatory whenever a game is being worked on anywhere in this repo.

## Gap log

- The moment the engine can't do something the game needs — a missing system, component, or capability — add one line to `Games/TODO.md` as `- [ ] <the raw problem>`, then keep building.
- Raw problem only. Every entry must read as a pure engine statement:
  - Never name the game, its genre, or any gameplay context. "Need X for the shooter" is banned; "No way to X" is the shape.
  - No solutions, designs, or API proposals — state what the engine can't do. Troubleshooting and verification happen later.
  - One problem per line.
- Never check a box (`- [x]`) during a game session. Boxes are checked later, after the gap is fixed and verified.

## Session end

When the game work is done, before ending the session:

1. Commit the new `TODO.md` entries.
2. File one issue on this repo:
   - Title: `[FEATURE] <brief summary of the missing features>`
   - Body: a numbered list, one line per new `TODO.md` entry. Nothing else — no game context, no solutions.

## Wiring a new game

Same shape as the games already in here: a private workspace package (`Games/*` is in root workspaces) named `@games/<name>` with `./src` exports and no build, registered in `apps/dev/src/main.tsx` with a matching alias in `apps/dev/vite.config.ts`. HUD Tailwind classes are covered by the `Games` `@source` entry in `apps/dev/src/index.css`. Build from the skills in `skills/`, not by copying another game.
