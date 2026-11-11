Scrap Signal now draws its whole UI on the Rune-native primitives; its CSS and old UI folder are deleted.

Engine seam: none - game content only

### Changed

- Scrap Signal now draws its whole UI on the Rune-native primitives; its CSS and old UI folder are deleted.
- Verified: 228 tests, type-check, boot probe and bundle check pass with no ceiling raised; 42 headless native screenshots at 1280x720, 844x390 and 390x844 in games/scrap-signal/proofs/rune-primitives.
- Unverified: real mouse, touch and pad drives need the PC (no WebGPU in Chrome on the Linux host); the call sign entry is a game-local key stand-in until RuneField lands.
