import catalog from "./registry-catalog.json" with { type: "json" };

export interface RegistryComponent {
  name: string;
  title: string;
  description: string;
}

export interface RegistryCatalog {
  /** Base site the shadcn registry is published under, e.g. `https://jgengine.com`. */
  homepage: string;
  components: readonly RegistryComponent[];
  icons: readonly string[];
}

export const registryCatalog: RegistryCatalog = catalog as RegistryCatalog;

/** The `shadcn add` URL for a HUD component, e.g. `https://jgengine.com/r/vital-bar.json`. */
export function componentInstallUrl(name: string): string {
  return `${registryCatalog.homepage.replace(/\/+$/, "")}/r/${name}.json`;
}
