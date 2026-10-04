### Fixed

- Equivalent freshly created character animation configurations retain mixer playback, pending triggers and per-instance visual variant state across React rerenders. This fixes store-driven custom characters such as Deepward’s imported Fitter restarting their gait on every update. Actual clip, held-frame, mapping or graph edits still reconfigure and clean up the owned mixer; authored one-shot order is preserved.
