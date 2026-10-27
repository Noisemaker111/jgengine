### Changed

- harbor-heat now type-checks clean under the strict flags (unchecked index access, exact optional properties, no index-signature dot access).
- harbor-heat reads scene meta through the engine's typed meta readers, so a wrong value in the scene file fails naming the marker instead of silently falling back to a default.
- harbor-heat's save reader uses the engine's shared record check instead of its own copy, and drops casts it no longer needs.
