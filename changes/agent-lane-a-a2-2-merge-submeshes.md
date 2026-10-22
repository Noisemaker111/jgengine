### Changed

- A loaded model whose meshes share a material now merges to one mesh per material at load, baking each source mesh's transform into the merged vertices. Every instance cloned from that model draws once per material instead of once per sub-mesh, and the instanced scatter/static-batch path harvests the same merged meshes. Skinned meshes, instanced meshes, meshes with morph targets or rigged ancestors, meshes with children, hidden meshes, mirrored meshes, and every model carrying an animation clip are left untouched. A material-assignment `selector.mesh` still resolves a sub-mesh name the merge absorbed.

### Added

- `setModelSubMeshMerge` (`@jgengine/shell/render/modelMeshMerge`) turns load-time sub-mesh merging off for a game that must keep one node per source mesh.
