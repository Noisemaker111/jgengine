### Fixed

- Generated locomotion graphs give death priority and retain its held pose when later hit or attack events arrive. One-shot clip arrays survive graph conversion and JSON parsing; seeded runtime choices are recorded in snapshots.
- Animation layers keep independent mixer actions when they use the same imported clip. Crossfades keep the outgoing animation advancing at its own rate and loop policy. Full-cycle clip events are retained, multiple missed cycles coalesce, and muted contributions do not emit events.
- Model animation diagnostics identify missing clips, empty layer masks and unsupported root-track assumptions. Invalid explicit single clips retain the bind pose instead of looping the rig's first clip.

### Changed

- Root-motion graph states now extract travel and render horizontally in place. The renderer no longer writes entity poses outside the movement/collision authority. Hosts that relied on that behavior must advance the headless graph, transform its `rootDelta` with `takeRootMotion`, and resolve requested movement through their controller. Graph previews can pass `output.rootMotion` to `createGraphPose.apply` for the same policy. This does not provide automatic collision-aware root-motion locomotion or retargeting.
