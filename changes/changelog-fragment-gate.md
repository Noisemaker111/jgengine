### Fixed

- Changelog checks validate every existing release fragment before missing-base, skip-marker, or source-free exemptions. Malformed notes now fail CI even when they predate the checked diff; pure refactors still need no new note.
