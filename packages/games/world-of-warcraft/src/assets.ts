import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { players } from "./entities/players/catalog";
import { enemies } from "./entities/enemies/catalog";
import { npcs } from "./entities/npcs/catalog";

export const assets = createAssetCatalog();

for (const entry of [...players, ...enemies, ...npcs]) {
  assets.register(entry.model, { url: `/models/wow/${entry.id}.glb` });
}
assets.register("object/campfire", { url: "/models/wow/campfire.glb" });
assets.register("object/supply_crate", { url: "/models/wow/supply_crate.glb" });
