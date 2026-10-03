### Fixed

- Incomplete saved locomotion mappings no longer create an animation graph with undefined clip names. A named single clip remains active while idle is unconfigured; otherwise the rig retains its bind pose. Missing walk mappings hold the explicitly named idle until repaired. Diagnostics report incomplete roles and validate the effective playback mode, including explicit graph precedence.
- Explicit empty locomotion mappings survive playback edits and clearing the last role, so incomplete characters do not silently switch to the model's first clip. Choosing Single clip still replaces the mapping.
- Rendered animation variants use independent deterministic streams per model instead of advancing gameplay RNG. Mounting, hiding or culling animated models cannot change gameplay random outcomes. Each remount restarts its visual stream; callers whose clip selection affects gameplay should own a headless animation runtime, injected RNG and saved state.
