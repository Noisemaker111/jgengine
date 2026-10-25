### Fixed

- Pointer clicks on worlds with terrain land on the ground under the cursor instead of the sky dome or the y=0 plane under the hills. `PointerProbe` takes an optional `groundHeightAt`, which `Shell3dPresentation` passes for bounded terrains; flat arenas are unchanged.
