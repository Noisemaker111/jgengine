import type { LibraryMaterial } from "../../materialLibrary";

export default { name: "foliage/leaf-dense", title: "Dense leaf card", group: "foliage", source: "ambientcg-leaf003", surface: "foliage", tileMetres: 1, response: { metalness: 0, roughness: 0.6, alphaMode: "mask", alphaCutoff: 0.45, doubleSided: true, sheen: 0.55, sheenColor: "#b9cc7d", sheenRoughness: 0.75 } } satisfies LibraryMaterial;
