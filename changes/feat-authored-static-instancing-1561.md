### Added

- The 3D shell batches compatible authored catalog props above eight placements per spatial cell into instanced model draws, preserving each chosen model, material group, shadow mode, collider measurement and object id for picking. Interactive, custom, animated, composed, transparent and mirrored models retain individual renderers; culled placements leave the submitted instance set.

### Fixed

- Pointer hits on instanced meshes transform their surface normals through the instance matrix.
