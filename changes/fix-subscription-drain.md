### Fixed

- Host subscription refreshes now serialize reads, coalesce burst notifications, discard obsolete lifecycle completions, and advance world cursors only after sending a frame. Slow initial reads no longer block unsubscribe or commands.
