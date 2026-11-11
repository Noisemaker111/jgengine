RuneField native text field (controlled value, submit, autoFocus, focused-key capture, touch keyboard proxy) so native games can take chat, names and passwords.

### Added

- RuneField native text field (controlled value, submit, autoFocus, focused-key capture, touch keyboard proxy) so native games can take chat, names and passwords.
- `RuneTextField` (`@jgengine/core/ui/rune/elements.view`): Native Rune-owned text field; edits and submits come back as events.
- `nativeFieldKey` (`@jgengine/core/ui/rune/nativeSurface.view`): ⚠ undocumented
- `RuneField` (`@jgengine/core/ui/rune/primitives.view`): Native text entry: Rune owns caret, selection and IME; the game owns the text. Also `RuneFieldProps`.

### Changed

- Verified: cargo test -p jg-ui 33 pass; rune UI TS tests 44 pass (new tests broken once and restored); core, Deepward and Scrap Signal type-checks.
- Unverified: real typing, IME and the phone keyboard proxy in a browser; the press fix is confirmed by the Harbor Heat tour after this lands.
- Unverified: real typing, IME and the phone keyboard proxy in a browser.

### Fixed

- native Rune presses now wake a frame, so a click on a still HUD reaches the game at once instead of waiting for the next input.
