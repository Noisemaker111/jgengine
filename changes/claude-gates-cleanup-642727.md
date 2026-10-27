Every check that asked an agent for a sentence a scanner could not judge is gone or narrowed; what remains fails only on a fact about the code.

### Changed

- `bun run lane:close` is the one verification pass: it runs `gen` and `verify:fast` itself, so nothing runs by hand before it, and its PR body carries whole commit messages, not subjects alone.
- The Bends section lists only deleted assertions, skipped tests and disabled checks; a clean diff gets none, and `changes/*.md` folding keeps it out of the changelog.
- `bun run check games-capabilities` checks ids and issue numbers only: debt on an unknown, imported or probe-less capability, a debt entry with no issue number, a probe for a module the game does not adopt, a stale ledger. It no longer judges debt reasons, reads GitHub issues or keeps a debt budget.
- `bun run check games-framework` exempts a game file through a first-line `// framework-ok: <reason>`; the `--allow` flag CI never saw is gone, so local and CI run the same command.
- Root command guards are 600 s each, matching the 10-minute rule.

### Removed

- `check fix-has-test`: it could not tell a bugfix from any other change, and `verify:fast` already exits 2 when a changed runtime file reaches no test.
- `scripts/debt-budget.json` and the `--write` / `--no-issues` flags of `check games-capabilities`; `land --watch`.
- `capabilities.json` `domain`: it only served the deleted reason check.
