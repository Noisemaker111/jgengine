### Changed

- A game with no `look` now renders `"cinematic"`: ACES tone mapping, restrained bloom (strength 0.22, threshold 0.95), AO, contact shadows and antialiasing, lit by its `mood`. Write `look: "neutral"` for the old unstyled output.
- Post chains antialias with TAA on high and ultra and SMAA on low and medium when `aa` is unset. The graphics setting "Anti-aliasing (SMAA)" is now "Anti-aliasing" and gates both.
- The default sky dome shrinks to fit inside a short camera far plane instead of clipping to black.
- The prototype-look check no longer flags a game for leaving `look` unset.

### Added

- `postProcessing.contactShadows` (`ContactShadowConfig`, `DEFAULT_CONTACT_SHADOWS`): screen-space shadows toward the sun so feet, wheels and props sit on the ground. On by default on medium and up; `false` turns it off.
- `aa: "taa"`: jittered temporal antialiasing with neighbourhood clipping and a light sharpen.
