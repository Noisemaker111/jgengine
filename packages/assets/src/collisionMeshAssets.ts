/** Catalog assets that ship a collision mesh in the generated index. Opt-in only: each entry adds ~10-30KB of quantized triangles to the index and a BVH raycast per query, so list only concave models whose fitted box lies (archways, rings, frames). */
export const COLLISION_MESH_ASSET_IDS: ReadonlySet<string> = new Set([
  "kaykit-dungeon/wall_arched",
  "kaykit-dungeon/wall_archedwindow_open",
  "kaykit-dungeon/wall_archedwindow_gated",
]);
