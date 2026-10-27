### Changed

- deepward now type-checks clean under the strict flags (unchecked index access, exact optional properties, no index-signature dot access).
- deepward's save reader checks stored fields through named raw shapes and the engine's shared record check, instead of reading an open record by dot.
- deepward's probe now reports its own named readings, so its proof flows are checked against the real probe keys instead of any string.
