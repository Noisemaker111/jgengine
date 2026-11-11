LLMville now draws its whole UI on the Rune-native primitives; style.css, Tailwind and shadcn are removed.

Engine seam: none - game content only

### Changed

- LLMville now draws its whole UI on the Rune-native primitives; style.css, Tailwind and shadcn are removed.
- Verified: headless play test walks sign-in, lab creation, chat, every tablet app's main action, settings and rebind at 1280x720 and 390x844 (assertion broken once and restored); 399 tests; type-check; react-free; template sync.
- Simplified: /dev workbench routes and an unused create-world screen removed; the map claims cells by tap or drag with no hover price.
- Unverified: real browser input and the phone keyboard; emoji in player chat render as empty boxes (no emoji font in Rune).

### Fixed

- the rule effect registry test no longer fails when Scrap Signal's perks load first in the same worker.
