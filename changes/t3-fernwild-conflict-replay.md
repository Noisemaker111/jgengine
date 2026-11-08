Landings no longer stop when two lanes each add a game-flow command or a Fernwild import, prompt or system, and a keep-both merge no longer drops a line both added blocks share

Root cause: the Fernwild landings that still stopped after #3064 were two lanes editing one shared line. In gameFlow.ts, every new command extended one doc paragraph and the test's one-line command list. In game.config.ts, every new feature added a name to a short one-line import (`{ BROOD_PHASES }` → `{ BROOD_PHASES, BROOD_TIERS }`), and prompt sources sat in one list expression. Separately, #3064's keep-both merge read `git merge-file --zdiff3`, which lifts lines two insertions share at their start or end out of the conflict, so two added `import { ... } from` blocks landed with one `import {` and did not parse.

### Changed

- The game-flow system defines its commands from a list with one entry each, with its own comment; a new command adds an entry, and the test lists one command name per line
- Fernwild's game.config.ts lists every import one name per line, and its prompt sources, systems and movement settings one per line

### Fixed

- lane:close keeps both of two blocks lanes added at one place whole when they open or close with the same lines
- lane:close keeps one copy of lines a lane carries from another unlanded lane it branched from, instead of a duplicate import name that does not compile
