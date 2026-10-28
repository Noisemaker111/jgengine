barrel checks reuse the parsed package instead of rebuilding it five times

Root cause: every domain check parsed the same package again despite an existing shared surface

### Fixed

- barrel checks reuse the parsed package instead of rebuilding it five times
