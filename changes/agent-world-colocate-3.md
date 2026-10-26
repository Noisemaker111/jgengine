The map lives in one `@jgengine/core/map` folder: minimap, markers, fog, map layers and annotations, waypoints and fast travel, with their React views and three.js beacons beside them.

### Migrate
- `@jgengine/core/world/fastTravel` → `@jgengine/core/map/fastTravel`
- `@jgengine/core/world/fog` → `@jgengine/core/map/fog`
- `@jgengine/core/world/mapAnnotations` → `@jgengine/core/map/mapAnnotations`
- `@jgengine/core/world/mapLayers` → `@jgengine/core/map/mapLayers`
- `@jgengine/core/world/markers` → `@jgengine/core/map/markers`
- `@jgengine/core/world/minimapBake` → `@jgengine/core/map/minimapBake`
- `@jgengine/core/world/minimapTrack` → `@jgengine/core/map/minimapTrack`
- `@jgengine/core/world/minimap` → `@jgengine/core/map/minimap`
- `@jgengine/core/world/sharedAnnotations` → `@jgengine/core/map/sharedAnnotations`
- `@jgengine/core/world/waypoints` → `@jgengine/core/map/waypoints`
- `@jgengine/react/fastTravel` → `@jgengine/core/map/fastTravel.view`
- `@jgengine/react/fogOverlay` → `@jgengine/core/map/fogOverlay.view`
- `@jgengine/react/map` → `@jgengine/core/map/map.view`
- `@jgengine/react/waypointMarkers` → `@jgengine/core/map/waypointMarkers.view`
- `@jgengine/shell/map/MapMarkerBeacons` → `@jgengine/core/map/MapMarkerBeacons.draw`
- `@jgengine/shell/map/terrainMap` → `@jgengine/core/map/terrainMap.draw`
- The `@jgengine/shell/map` barrel is gone: import `bakeTerrainMap` from `@jgengine/core/map/terrainMap.draw` and `MapMarkerBeacons` from `@jgengine/core/map/MapMarkerBeacons.draw`. The `@jgengine/react` root still exports the map components.
