lane:close -m writes the change note, commit message and PR body

### Changed

- lane:close -m writes the change note, commit message and PR body
- The note lists the exported API the diff added or removed and, for a game change, its engine seam; Closes/Prevention/Root cause lines stay out of the changelog

### Fixed

- a lane no longer hand-writes an Engine seam line, an API list or a changes/ file
- closing again with -m rewrites the open PR's body, not only the note
