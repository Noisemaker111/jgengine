import type { AssetSource } from "../manifest";

/**
 * Quaternius megakits. The quaternius.com pack pages JS-gate the free download
 * (no `.zip` in HTML), so scrape fails in CI. Free **Standard** zips are also
 * mirrored on OpenGameArt with stable direct URLs and include a `glTF/` tree
 * (packed to `.glb` at extract). Prefer pinned OGA URLs when available.
 *
 * A pack only belongs here once its archive has been confirmed to ship `glTF/`.
 * The Street Pack, pinned here as "Downtown City MegaKit", ships Blends/FBX/OBJ
 * only — a pull found no models at all, and the wrong title made it read as a
 * solved lead for modular city facades. See `unpulled` in `manifest.ts`.
 */
interface QuaterniusPack {
  id: string;
  slug: string;
  title: string;
  categories: readonly string[];
  /** OpenGameArt direct zip when known (Standard free pack). */
  ogaZip?: string;
  /** Why this pack contributes nothing to the index yet; see `AssetSource.unpulled`. */
  unpulled?: string;
}

const OGA_FILES = "https://opengameart.org/sites/default/files";

const QUATERNIUS_PACKS: readonly QuaterniusPack[] = [
  {
    id: "quaternius-stylized-nature",
    slug: "stylizednaturemegakit",
    title: "Stylized Nature MegaKit",
    categories: ["nature", "environment", "prop"],
    ogaZip: `${OGA_FILES}/stylized_nature_megakitstandard.zip`,
  },
  {
    id: "quaternius-medieval-village",
    slug: "medievalvillagemegakit",
    title: "Medieval Village MegaKit",
    categories: ["building", "medieval", "environment"],
    ogaZip: `${OGA_FILES}/medieval_village_megakitstandard.zip`,
  },
  {
    id: "quaternius-modular-scifi",
    slug: "modularscifimegakit",
    title: "Modular SciFi MegaKit",
    categories: ["scifi", "environment", "prop"],
    ogaZip: `${OGA_FILES}/modular_scifi_megakitstandard.zip`,
  },
  {
    id: "quaternius-fantasy-props",
    slug: "fantasypropsmegakit",
    title: "Fantasy Props MegaKit",
    categories: ["fantasy", "prop"],
    ogaZip: `${OGA_FILES}/fantasy_props_megakitstandard.zip`,
  },
  {
    id: "quaternius-base-characters",
    slug: "universalbasecharacters",
    title: "Universal Base Characters",
    categories: ["character", "rigged"],
    unpulled: "OGA free dump is FBX/OBJ only — needs a Pro/glTF source; scrape stays until pinned",
  },
  {
    id: "quaternius-animated-animals",
    slug: "ultimateanimatedanimals",
    title: "Ultimate Animated Animal Pack",
    categories: ["animal", "creature", "wildlife", "rigged", "animated"],
    unpulled: "no OGA zip pinned; the quaternius.com page JS-gates the download, so a pull cannot resolve it",
  },
  {
    id: "quaternius-monsters",
    slug: "ultimatemonsters",
    title: "Ultimate Monsters",
    categories: ["monster", "creature", "fantasy", "rigged", "animated"],
    unpulled: "OGA free dump is FBX/OBJ only — needs a Pro/glTF source; scrape stays until pinned",
  },
];

/**
 * Quaternius's older packs on OpenGameArt, each posted by Quaternius under CC0 (checked on its page)
 * before the quaternius.com licence change. They ship FBX and OBJ only; a pull converts them to GLB
 * (`packModelConvert.ts`). Re-uploads by other users and the CC-BY-SA 2016 packs are left out.
 */
interface QuaterniusOgaPack {
  /** OpenGameArt page slug: `opengameart.org/content/<slug>`. */
  slug: string;
  title: string;
  categories: readonly string[];
  /** The page's zip, as `sites/default/files/<zip>`. */
  zip: string;
}

const QUATERNIUS_OGA_PACKS: readonly QuaterniusOgaPack[] = [
  { slug: "5-low-poly-animals", title: "Low Poly Animals (2016)", categories: ["animal", "creature", "nature"], zip: "Animals%20Pack%20by%20Quaternius.zip" },
  { slug: "animated-animales-low-poly", title: "Animated Animals Low Poly", categories: ["animal", "creature", "rigged", "animated"], zip: "Animal%20Pack%20Vol.2%20by%20%40Quaternius.zip" },
  { slug: "animated-characters-pack", title: "Ultimate Animated Character Pack", categories: ["character", "human", "rigged", "animated"], zip: "ultimate_animated_character_pack_by_quaternius.zip" },
  { slug: "animated-fish", title: "Animated Fish Pack", categories: ["animal", "fish", "creature", "rigged", "animated"], zip: "Animated%20Fish%20Pack%20by%20%40Quaternius.zip" },
  { slug: "animated-human-low-poly", title: "Animated Human Low Poly", categories: ["character", "human", "rigged", "animated"], zip: "Animated%20Human%20by%20%40Quaternius_0.zip" },
  { slug: "animated-lowpoly-robot", title: "Animated LowPoly Robot", categories: ["character", "robot", "scifi", "rigged", "animated"], zip: "Animated%20Robot%20-%20Oct%202018.zip" },
  { slug: "animated-mech-pack", title: "Animated Mech Pack", categories: ["character", "robot", "mech", "scifi", "rigged", "animated"], zip: "animated_mech_pack_-_march_2021.zip" },
  { slug: "fantasy-low-poly-trees-and-bushes", title: "Fantasy Low Poly Trees and Bushes", categories: ["nature", "tree", "fantasy"], zip: "Nature%20model%20pack_1.zip" },
  { slug: "furniture-low-poly", title: "Furniture Low Poly", categories: ["furniture", "interior", "prop"], zip: "Furniture%20Pack%20by%20%40Quaternius.zip" },
  { slug: "low-poly-animated-guns", title: "Low Poly Animated Guns", categories: ["weapon", "gun", "animated"], zip: "FPS%20Pack_0.zip" },
  { slug: "low-poly-cars-0", title: "Low Poly Cars (2016)", categories: ["vehicle", "car"], zip: "CarPack.zip" },
  { slug: "low-poly-desert-assets", title: "Low Poly Desert Assets", categories: ["nature", "desert", "prop"], zip: "DesertPack.zip" },
  { slug: "low-poly-food-pack", title: "Ultimate Food Pack", categories: ["food", "prop"], zip: "ultimate_food_pack_by_quaternius.zip" },
  { slug: "low-poly-furniture-1", title: "Low Poly Furniture Vol.2", categories: ["furniture", "interior", "prop"], zip: "Furniture%20pack%20Vol.2%20by%20Quaternius.zip" },
  { slug: "low-poly-guns-pack", title: "Ultimate Gun Pack", categories: ["weapon", "gun"], zip: "ultimate_gun_pack_by_quaternius.zip" },
  { slug: "low-poly-guns", title: "Low Poly Guns Vol.1", categories: ["weapon", "gun"], zip: "GunPack%20Vol.1.zip" },
  { slug: "low-poly-medieval-weapons", title: "Low Poly Medieval Weapons (2016)", categories: ["weapon", "medieval"], zip: "MedievalPack.zip" },
  { slug: "low-poly-nature-pack-1", title: "Ultimate Nature Pack", categories: ["nature", "tree", "rock", "plant"], zip: "ultimate_nature_pack_by_quaternius_1.zip" },
  { slug: "low-poly-pirate-pack", title: "Low Poly Pirate Pack", categories: ["pirate", "prop", "ship"], zip: "Pirate%20Pack%20by%20Quaternius%20-.zip" },
  { slug: "low-poly-rpg-pack", title: "Ultimate RPG Items Pack", categories: ["rpg", "item", "prop", "fantasy"], zip: "ultimate_rpg_items_pack_by_quaternius_0.zip" },
  { slug: "low-poly-space-assets", title: "Low Poly Space Assets", categories: ["space", "scifi", "prop"], zip: "SpacePack.zip" },
  { slug: "lowpoly-animated-farm-animal-pack", title: "LowPoly Animated Farm Animal Pack", categories: ["animal", "farm", "creature", "rigged", "animated"], zip: "Farm%20Animals%20by%20%40Quaternius.zip" },
  { slug: "lowpoly-animated-knight", title: "LowPoly Animated Knight", categories: ["character", "knight", "medieval", "rigged", "animated"], zip: "Knight%20Character%20by%20%40Quaternius.zip" },
  { slug: "lowpoly-animated-monsters", title: "LowPoly Animated Monsters", categories: ["monster", "creature", "rigged", "animated"], zip: "Animated%20Monster%20Pack%20by%20%40Quaternius.zip" },
  { slug: "lowpoly-buildings-pack", title: "Ultimate Textured Buildings Pack", categories: ["building", "city"], zip: "ultimate_textured_building_pack_by_quaternius.zip" },
  { slug: "lowpoly-buildings", title: "LowPoly Buildings", categories: ["building", "city"], zip: "Buildings%20pack%20by%20%40Quaternius_0.zip" },
  { slug: "lowpoly-cars", title: "LowPoly Cars", categories: ["vehicle", "car"], zip: "Car%20Pack.zip" },
  { slug: "lowpoly-crops-pack", title: "LowPoly Crops Pack", categories: ["nature", "crop", "farm", "plant"], zip: "nature_crops_pack_by_quaternius.zip" },
  { slug: "lowpoly-house-interior-pack", title: "Ultimate House Interior Pack", categories: ["furniture", "interior", "prop"], zip: "ultimate_house_interior_pack_-_june_2020.zip" },
  { slug: "lowpoly-medieval-buildings", title: "LowPoly Modular Medieval Buildings", categories: ["building", "medieval", "modular"], zip: "Modular%20Medieval%20Pack%20by%20%40Quaternius_0.zip" },
  { slug: "lowpoly-medieval-village-pack", title: "LowPoly Medieval Village Pack", categories: ["building", "medieval", "environment"], zip: "medieval_village_pack_-_dec_2020.zip" },
  { slug: "lowpoly-medieval-weapons", title: "LowPoly Medieval Weapons", categories: ["weapon", "medieval"], zip: "Medieval%20Weapons%20Pack%20-%20Sept%202018.zip" },
  { slug: "lowpoly-modular-dungeon-pack", title: "LowPoly Modular Dungeon", categories: ["dungeon", "modular", "environment", "fantasy"], zip: "Updated%20Modular%20Dungeon%20-%20May%202019.zip" },
  { slug: "lowpoly-modular-sci-fi-environments", title: "Ultimate Modular Sci-Fi", categories: ["scifi", "modular", "environment"], zip: "ultimate_modular_sci-fi_-_feb_2021.zip" },
  { slug: "lowpoly-modular-street-pack", title: "LowPoly Modular Street Pack", categories: ["city", "street", "modular", "prop"], zip: "Street%20Pack%20by%20%40Quaternius.zip" },
  { slug: "lowpoly-nature-pack", title: "LowPoly Nature Pack Vol.3", categories: ["nature", "tree", "rock", "plant"], zip: "Nature%20pack%20vol.3.zip" },
  { slug: "lowpoly-posed-humans", title: "LowPoly Posed Humans", categories: ["character", "human", "posed"], zip: "Posed%20Background%20Characters%20by%20%40Quaternius.zip" },
  { slug: "lowpoly-public-transport", title: "LowPoly Public Transport", categories: ["vehicle", "bus", "train"], zip: "Public%20Transport_0.zip" },
  { slug: "lowpoly-rpg-characters", title: "LowPoly RPG Characters", categories: ["character", "rpg", "fantasy", "rigged", "animated"], zip: "rpg_characters_-_nov_2020.zip" },
  { slug: "lowpoly-rpg", title: "LowPoly RPG Pack", categories: ["rpg", "item", "prop", "fantasy"], zip: "RPG%20Pack.zip" },
  { slug: "lowpoly-ship-pack", title: "LowPoly Ship Pack", categories: ["vehicle", "ship", "boat"], zip: "Ships%20by%20%40Quaternius.zip" },
  { slug: "lowpoly-spaceships-pack", title: "Ultimate Spaceships Pack", categories: ["vehicle", "spaceship", "scifi"], zip: "ultimate_spaceships_-_may_2021.zip" },
  { slug: "lowpoly-steampunk-turrets", title: "LowPoly Steampunk Turrets", categories: ["turret", "steampunk", "tower-defense"], zip: "turret_pack_by_quaternius.zip" },
  { slug: "lowpoly-survival-pack", title: "LowPoly Survival Pack", categories: ["survival", "prop", "item"], zip: "survival_pack_-_sept_2020.zip" },
  { slug: "lowpoly-textured-trees", title: "LowPoly Textured Trees", categories: ["nature", "tree"], zip: "textured_stylized_trees_-_may_2020.zip" },
  { slug: "textured-cute-monster-pack", title: "Textured Cute Monster Pack", categories: ["monster", "creature", "rigged", "animated"], zip: "cute_animated_monsters_-_aug_2020.zip" },
];

const quaterniusOgaSources: readonly AssetSource[] = QUATERNIUS_OGA_PACKS.map((pack) => ({
  id: `quaternius-${pack.slug}`,
  provider: "quaternius",
  title: pack.title,
  license: "CC0-1.0",
  author: "Quaternius",
  categories: pack.categories,
  download: { url: `${OGA_FILES}/${pack.zip}` },
  homepage: `https://opengameart.org/content/${pack.slug}`,
  mirror: `${OGA_FILES}/${pack.zip}`,
}));

export const quaterniusSources: readonly AssetSource[] = QUATERNIUS_PACKS.map((pack): AssetSource => ({
  id: pack.id,
  provider: "quaternius",
  title: pack.title,
  license: "CC0-1.0",
  author: "Quaternius",
  categories: pack.categories,
  download:
    pack.ogaZip !== undefined
      ? { url: pack.ogaZip }
      : { scrape: `https://quaternius.com/packs/${pack.slug}.html` },
  homepage: `https://quaternius.com/packs/${pack.slug}.html`,
  ...(pack.ogaZip !== undefined ? { mirror: pack.ogaZip } : {}),
  ...(pack.unpulled !== undefined ? { unpulled: pack.unpulled } : {}),
})).concat(quaterniusOgaSources);
