### Fixed

- Input-owned chase cameras preserve their first acquired target's authored heading instead of starting at zero. The existing `camera.initialYaw` can override that one-time seed; later body turns remain independent of walking input.
