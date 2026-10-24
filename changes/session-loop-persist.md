### Fixed

- `createSessionLoop` and `createRunLoop` take a `persist` seam: the loop writes its own live state on each carry (or every N), on open, on choose and on close, and reads it back at construction. A process killed mid-session now comes back carrying what it had instead of zero. A failing write is ignored so a full disk cannot end a session.
