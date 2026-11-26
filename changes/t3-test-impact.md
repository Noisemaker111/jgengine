Checks run only the tests that load what you changed

### Changed

- Checks run only the tests that load what you changed
- verify:fast records which files each test loads and leaves out a reached test whose current record loads none of the changed files (an engine change: 1,202 tests to 351)

### Fixed

- the import graph no longer counts an entity spawn() as starting a process
