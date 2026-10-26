export * from "./manifest";
export {
  sources,
  sourceById,
  modelSources,
  materialSources,
  spriteSources,
  ambientcgSources,
  gameiconsSources,
  quaterniusSources,
  kaykitSources,
} from "./sources";
export {
  buildMaterialCatalog,
  extractMaterialMaps,
  materialAliases,
  MATERIAL_MAP_FILES,
  type BuildMaterialCatalogOptions,
  type ExtractedMaterialMap,
  type MaterialCatalog,
  type MaterialMapRole,
  type MaterialMaps,
  type MaterialRef,
} from "./materials";
export { extractSpriteFiles, type ExtractedSpriteFile } from "./download";
export {
  keyFromSpriteFile,
  entryForSpriteFile,
  indexSpriteSourceDir,
  reindexSprites,
  type ReindexSpritesResult,
} from "./spriteIndexGen";
export { singles } from "./singles";
export { aliases } from "./aliases";
export { generatedIndex, generatedBySource } from "./generated";
export { generatedSpriteIndex, generatedSpriteBySource } from "./generated-sprites";
export { readGlbDims } from "./dims";
export { buildCatalog, entryUrl, type BuildCatalogOptions } from "./catalogs/build";
export {
  MATERIAL_LIBRARY,
  filterLibraryMaterials,
  findLibraryMaterial,
  libraryMaterialAsset,
  libraryMaterialMaps,
  libraryMaterialNames,
  libraryMaterialRoles,
  type LibraryGroup,
  type LibraryMaterial,
  type LibraryMaterialOptions,
  type LibrarySurface,
} from "./catalogs/materialLibrary";
export {
  MODEL_LIBRARY,
  MODEL_LIBRARY_GAPS,
  MODEL_LIBRARY_GENRES,
  findLibraryModel,
  findLibraryModelByName,
  libraryModel,
  libraryModelCredits,
  libraryModelDir,
  libraryModelGap,
  libraryModelNames,
  type FindLibraryModelOptions,
  type GeneratedModelOrigin,
  type LibraryModelOptions,
  type ModelLibraryEntry,
  type ModelLibraryGap,
  type ModelLibraryGenre,
  type ModelLibraryMatch,
  type ModelLibraryOrigin,
  type PolyHavenModelOrigin,
} from "./catalogs/modelLibrary";
export { classifyAssetFile, validateImportSpec, type AssetImportKind, type AssetImportSpec, type ImportSpecValidation } from "./importSpec";
export { buildSpriteCatalog, type BuildSpriteCatalogOptions } from "./catalogs/buildSprites";
export { createStarterCatalog } from "./catalogs/starter";
export {
  STARTER_ASSETS,
  STARTER_PACKS,
  STARTER_SOURCE_PACKS,
  STARTER_THEMES,
  type StarterAsset,
  type StarterTheme,
} from "./packs/starter";
export {
  describeAssetMatch,
  rankAssets,
  type AssetKind,
  type AssetMatch,
  type RankAssetsOptions,
  type RankedMatch,
} from "./rankAssets";
export { registryCatalog, componentInstallUrl, type RegistryCatalog, type RegistryComponent } from "./registry";
export {
  modelWiringSnippet,
  materialWiringSnippet,
  componentWiringSnippet,
  iconWiringSnippet,
  spriteWiringSnippet,
  type ModelSnippetOptions,
} from "./snippet";
export { verifyManifest, type VerifyResult } from "./verify";
export {
  resolveProvenance,
  validateAssetReferences,
  type AssetProvenance,
  type AssetProvenanceKind,
  type AssetReference,
  type ReferenceValidation,
  type ResolveProvenanceOptions,
  type ValidateAssetReferencesOptions,
  type ValidateAssetReferencesResult,
} from "./provisioning";

export { readGlbMetrics, type GlbMetrics, type GlbTextureMetrics } from "./glbMetrics";
