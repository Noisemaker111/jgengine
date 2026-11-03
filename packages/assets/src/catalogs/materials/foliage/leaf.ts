import type { LibraryMaterial } from "../../materialLibrary";

// Foliage — cut-out cards over a warm, backlit response.
export default { name: "foliage/leaf", title: "Leaf card", group: "foliage", source: "ambientcg-leaf001", surface: "foliage", tileMetres: 0.8, response: { metalness: 0, roughness: 0.55, alphaMode: "mask", alphaCutoff: 0.45, doubleSided: true, sheen: 0.6, sheenColor: "#c8d18a", sheenRoughness: 0.7 } } satisfies LibraryMaterial;
