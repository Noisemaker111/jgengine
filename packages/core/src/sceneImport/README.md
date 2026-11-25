# sceneImport

`loadImportedScene(url)` loads a folder an outside tool exported: `scene.json`, `meshes/*.obj` and
`textures/*.png`. It resolves to a `root` group to add to a scene, the load's `stats`, and `dispose()`.

```json
{
  "center": [x, z],
  "radius": 100000,
  "handedness": "left",
  "materials": { "<name>": { "texture": "textures/<file>.png" } },
  "instances": [
    { "mesh": "meshes/<file>.obj", "meshName": "<object>", "matrix": [16 numbers, column-major], "materials": ["<name>"] }
  ]
}
```

- `materials[i]` of an instance draws the object's i-th `usemtl` run. A material with no texture, or
  whose texture fails, draws a flat colour picked from its name.
- `handedness` defaults to `"left"`, a Unity-style export: matrices are left-handed and the OBJ
  writer already negated X (as Unity OBJ exporters do), so each matrix becomes `S·M·S` with
  `S = diag(-1, 1, 1)` and the mesh is used as written. `"right"` applies the matrix untouched.
  A matrix that mirrors (negative determinant) draws from a rewound copy of its mesh.
- Matrices are stored relative to `center`, and `root` sits at the centre, so 32-bit instance
  buffers keep their precision in a scene far from the origin. Instances beyond `radius` are skipped.

## How it draws

One batch per distinct mesh (OBJ file and object), material list and winding, placed through the
shared static batches (`instancing/staticDrawPool.draw.ts`): every mesh drawn with one texture in
one cell is one multi-draw, whichever mesh it came from. OBJ files are fetched and parsed on
workers (`run/workerPool.ts`); textures decode off the main thread through the model loader's
manager; the main thread only copies parsed meshes into their batches, a slice per frame.

A draw is one texture in one cell, so `cellSize` trades draws for culling. With many textures
spread over the scene (the 1,500-texture benchmark), cells multiply draws faster than culling saves
anything, so the default is one cell for the whole scene. Pass `cellSize` for a scene whose
textures repeat across a large area, where dropping far cells pays.

`bun scripts/scene-import-bench.ts` generates the 20,000-instance, ~1 GB scene from
`testFixtures/syntheticScene.ts` and reports load time, draws and frame times in Chrome.
