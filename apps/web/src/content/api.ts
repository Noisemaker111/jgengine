export interface ApiExport {
  name: string;
  kind: string;
  signature: string;
  doc?: string;
}

export interface ApiModule {
  path: string;
  exports: ApiExport[];
}

export interface ApiPackage {
  name: string;
  description: string;
  version: string;
  modules: ApiModule[];
}

const apiPackages = import.meta.glob<{ default: ApiPackage }>("../generated/api/*.json");

export const API_PACKAGE_SLUGS = Object.keys(apiPackages)
  .map((path) => path.split("/").at(-1)?.replace(/\.json$/, "") ?? path)
  .sort();

export async function loadApiPackage(slug: string): Promise<ApiPackage | null> {
  const path = Object.keys(apiPackages).find((p) => p.split("/").at(-1) === `${slug}.json`);
  if (path === undefined) return null;
  const mod = await apiPackages[path]!();
  return mod.default;
}
