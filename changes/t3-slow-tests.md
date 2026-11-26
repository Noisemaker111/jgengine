Checks follow tests into the scripts they start

### Changed

- Checks follow tests into the scripts they start
- verify:fast records loads in every Bun process a test starts, so a test that only starts scripts is left out unless they load the change (an engine change: 351 tests to 244, 276 s to 215 s)
- the no-adapter Rune browser test draws on software GL like the no-WebGPU one (30 s to 6 s)
