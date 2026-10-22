### Added

- `createLaneGraph` and `laneGraphFromDocument` (`@jgengine/core/world`) read an authored lane graph out of the scene document: `traffic_lane` paths are one directed span each, `road` paths (the street bake) become a lane per direction split where streets cross, `traffic_intersection` markers carry signal phases and right-of-way in `meta`, and `traffic_parking` markers place kerbside spots.
- `createTraffic` (`@jgengine/core/world`) runs cars on that graph: IDM car following and braking, one car at a time through each intersection box behind a signal phase or first-come right-of-way, lane changes across authored neighbours, parking that reserves a spot, deterministic injected variety, `snapshot`/`restore`, and a devtools probe.
- `Traffic.setDemand(count)` is the fleet target; the time-of-day curve stays the caller's policy.
