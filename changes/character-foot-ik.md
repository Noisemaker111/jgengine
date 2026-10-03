### Fixed

- Foot IK rejects missing, ambiguous, overlapping or disconnected leg chains with named diagnostics instead of deforming unrelated rig branches. Automatic pelvis correction now uses the common ancestor of resolved legs; explicit pelvis selection is preserved.
- Disabling, replacing or unmounting foot IK restores its previous joint corrections without overwriting newer animation poses, and replacement resets pelvis smoothing.
