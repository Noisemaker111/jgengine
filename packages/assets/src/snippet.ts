import { componentInstallUrl, type RegistryComponent } from "./registry";

function pascalCase(name: string): string {
  return name
    .split(/[^a-zA-Z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export interface ModelSnippetOptions {
  /** URL prefix the app serves pulled GLBs from (matches `buildCatalog({ basePath })`). */
  basePath?: string;
  /** Which `defineGame` model seam to wire the id into. */
  seam?: "objectModels" | "entityModels";
}

/** Copy-paste wiring for a pulled GLB id: resolve through the catalog, drop into a model seam. */
export function modelWiringSnippet(id: string, options: ModelSnippetOptions = {}): string {
  const basePath = options.basePath ?? "/models";
  const seam = options.seam ?? "objectModels";
  const key = seam === "entityModels" ? "hero" : id;
  return [
    `// src/game/assets.ts`,
    `import { buildCatalog } from "@jgengine/assets";`,
    `export const catalog = buildCatalog({ basePath: ${JSON.stringify(basePath)} });`,
    ``,
    `// in defineGame({ ... }):`,
    `${seam}: {`,
    `  ${JSON.stringify(key)}: { url: catalog.resolve(${JSON.stringify(id)})!.url, scale: 1 },`,
    `}`,
  ].join("\n");
}

/** Copy-paste wiring for a pulled PBR material: resolve the map URLs through the material catalog, then apply them onto terrain or a model. */
export function materialWiringSnippet(id: string, basePath = "/materials"): string {
  return [
    `// src/game/assets.ts`,
    `import { buildMaterialCatalog } from "@jgengine/assets";`,
    `export const materials = buildMaterialCatalog({ basePath: ${JSON.stringify(basePath)} });`,
    ``,
    `const material = materials.resolve(${JSON.stringify(id)})!;`,
    `// material.maps => { color, normal, roughness, ao, displacement } URLs under ${basePath}/${id}/`,
    ``,
    `// onto the ground (terrain() in defineGame({ world: environment({ terrain: ... }) })):`,
    `terrain({ detail: { material: { maps: material.maps, repeat: 4 } } })`,
    ``,
    `// onto a model (entityModels / objectModels ModelConfig):`,
    `{ url: ..., material: { maps: material.maps } }`,
  ].join("\n");
}

/** Copy-paste wiring for a HUD component: the `shadcn add` command plus import + usage. */
export function componentWiringSnippet(component: RegistryComponent): string {
  const symbol = pascalCase(component.name);
  return [
    `# install into components/ui/${component.name}.tsx`,
    `npx shadcn@latest add ${componentInstallUrl(component.name)}`,
    ``,
    `// then in your HUD:`,
    `import { ${symbol} } from "@/components/ui/${component.name}";`,
    `// <${symbol} … />  —  ${component.description}`,
  ].join("\n");
}

/** Copy-paste wiring for a pulled sprite/icon-pack file: resolve through the sprite catalog. */
export function spriteWiringSnippet(id: string, basePath = "/sprites"): string {
  return [
    `// src/game/assets.ts`,
    `import { buildSpriteCatalog } from "@jgengine/assets";`,
    `export const sprites = buildSpriteCatalog({ basePath: ${JSON.stringify(basePath)} });`,
    ``,
    `sprites.resolve(${JSON.stringify(id)})!.url;  // e.g. an <img src> or a HUD icon slot`,
  ].join("\n");
}

/** Copy-paste wiring for a HUD glyph from the registry `game-icon` catalog. */
export function iconWiringSnippet(name: string): string {
  return [
    `# once per project, install the icon catalog:`,
    `npx shadcn@latest add ${componentInstallUrl("game-icon")}`,
    ``,
    `// then render the glyph:`,
    `import { GameIcon } from "@/components/ui/game-icon";`,
    `// <GameIcon name=${JSON.stringify(name)} />`,
  ].join("\n");
}
