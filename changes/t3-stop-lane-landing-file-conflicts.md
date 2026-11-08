Landings no longer stop on the files every game lane touches: suite reports merge proof by proof, and lines two lanes both added at one place keep both

Root cause: lane:close resolved only generated files, change notes and the README/PLAN score block. A game's `proofs/suite-report.json` is written by its suite test, not by `bun run gen`, so two Fernwild lanes that each added a proof conflicted there (37 of 98 PRs on Nov 6-8 touched it), and two lanes appending a probe field to `game.config.ts`, a tick to PLAN.md or a credit to CREDITS.md conflicted on the same last line. Each stop meant a hand rebase (about 46 min on Nov 7 for #2993 and #3002). Verified with a land test that seeds the real Fernwild files and lands two lanes from one old beta back to back: beta's resolver stops on PLAN.md, suite-report.json and game.config.ts; this one lands both with every row, tick and field kept.

### Changed

- lane:close resolves a rebase conflict in a game's suite report by merging its rows by proof file, then regenerates the README/PLAN score
- lane:close keeps both sides when two lanes only added lines at the same place (the base's first); an edit to a line the other side changed stays a real conflict, and the rebased tree is verified before it merges
- A session that starts on a lane whose AGENTS.md changed on beta since it branched is told to read beta's rules
