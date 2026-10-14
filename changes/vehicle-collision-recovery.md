### Fixed

- Vehicle obstacle recovery no longer launches kinematic or force-model cars or reports recovery displacement as crash speed. Clamp results may include permitted `motion` displacement separately from their recovered endpoint; plain tuple callbacks keep their behavior.
