### Fixed

- `lane:audit` classifies a call by what it runs, not by the text inside its arguments: `rg`, `grep`, `Select-String`, `findstr`, `Get-Content`, `cat`, `echo`, `Write-Output` and `git` (any subcommand) never count as a sleep or a CI watch, and quoted arguments are stripped before matching. A lane that greps for `Start-Sleep` or writes a PR body about `gh run watch` no longer records waiting it never did.
- Catches the waits it used to miss: `Start-Sleep` under `powershell -Command`/`pwsh -c`/`bash -lc`, `cmd /c "timeout /t"`, `Thread.sleep`, `Atomics.wait`, `Bun.sleep`, and `gh pr checks` inside a `for`/`while` loop.

Over the last 40 hours (209 lanes): sleep 1066.6 -> 1068.7 minutes, CI watch 421.8 -> 421.3 minutes. 15 calls stopped counting as waits, one real `Start-Sleep -Seconds 150` started counting.

Verification:
- `bun test scripts/lane-audit.test.ts scripts/lane-close.test.ts scripts/land.test.ts` — pass
- `bun run lane:audit --json --hours 40` before and after, compared per command
