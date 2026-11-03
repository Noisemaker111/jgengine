import type { LibraryMaterial } from "../../materialLibrary";

export default { name: "ground/dirt-macro", title: "Forest floor (macro)", group: "ground", source: "ambientcg-ground037", surface: "opaque", tileMetres: 20, response: { metalness: 0, roughness: 0.9 }, terrain: { strength: 0.6, tint: 0.3 } } satisfies LibraryMaterial;
