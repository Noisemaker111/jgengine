### Fixed

- `createUnlockPoints` preserves `__proto__` unlock IDs and paid costs across JSON saves and reloads. Restoration discards invalid saved costs instead of granting free unlocks, while retaining valid fractional and zero-cost unlocks.
