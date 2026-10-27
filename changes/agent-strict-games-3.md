### Changed

- scrap-signal now type-checks clean under the strict flags (unchecked index access, exact optional properties, no index-signature dot access): save reads go through named locals, optional fields are passed only when set, and catalog lookups say when a key can be missing.
- The shared legacy-save reader reads the envelope by key.
