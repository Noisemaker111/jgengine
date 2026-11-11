Ember Command moves to Rune-native UI primitives and deletes its CSS UI. Engine: native patches before Rune's first frame now queue behind the spec (runeUi.view.test.ts). Verified by fixture tests; no browser drive (Jon's call). Unverified: phone-width browser view, world health bars under the Rune canvas, GPU.

Engine seam: packages/core/src/ui/runeUi.view.ts

### Changed

- Ember Command moves to Rune-native UI primitives and deletes its CSS UI. Engine: native patches before Rune's first frame now queue behind the spec (runeUi.view.test.ts). Verified by fixture tests; no browser drive (Jon's call). Unverified: phone-width browser view, world health bars under the Rune canvas, GPU.
