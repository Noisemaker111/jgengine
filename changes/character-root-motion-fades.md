### Fixed

- Preserve horizontal in-place playback while an outgoing root-motion clip still influences a crossfade, including interrupted fades and restored graph snapshots. Previously a dodge fading into idle could shift the visible rig away from its collision-authoritative entity.

### Changed

- Animation graph root-motion flags include influencing outgoing states. Root deltas still sample current-state travel; blended collision-authoritative root travel remains unsupported by the automatic renderer.
