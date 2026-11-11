Landing gates run in about half the time: game suites play their proofs across up to four worker threads (fernwild's suite 761 s to 176 s; an engine change's gate 432-599 s to 210-242 s), and verify:fast shares its pass cache and test timings across every worktree of a clone, so a unit another lane proved on the same bytes is not run again

Engine seam: none - game content only

### Added

- one machine-wide limit on rendering browsers (JG_RENDER_SLOTS, sized to the machine; fairshare room for a second). Every Chrome launch takes a slot, a running but slow broker is joined instead of passed by, and devBroker status lists every broker and slot holder

### Changed

- Landing gates run in about half the time: game suites play their proofs across up to four worker threads (fernwild's suite 761 s to 176 s; an engine change's gate 432-599 s to 210-242 s), and verify:fast shares its pass cache and test timings across every worktree of a clone, so a unit another lane proved on the same bytes is not run again
- A game's README or PLAN edit runs none of its tests or type-checks (was 64 tests)
- lane:close marks its own draft PR ready and refuses a PR into another base before the gate, not after it; tally's .tally/ reports are ignored, so a rebased landing's re-verify can merge

### Removed

- verify:fast's rerun of timed-out test files; a timeout stays red and names the file. The bg-tasks exit-event test that timed out under load is quarantined with #3118
