import type { LibraryMaterial } from "../../materialLibrary";

export default { name: "glass/smudged", title: "Smudged glass", group: "glass", source: "ambientcg-fingerprints001", surface: "glass", tileMetres: 0.7, response: { metalness: 0, roughness: 0.12, transmission: 1, ior: 1.52, thickness: 0.01, alphaMode: "opaque" } } satisfies LibraryMaterial;
