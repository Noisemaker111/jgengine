import type { LibraryMaterial } from "../../materialLibrary";

export default { name: "foliage/grass-macro", title: "Grass ground (macro)", group: "foliage", source: "ambientcg-grass001", surface: "opaque", tileMetres: 24, response: { metalness: 0, roughness: 0.9 }, terrain: { strength: 0.6, tint: 0.3 } } satisfies LibraryMaterial;
