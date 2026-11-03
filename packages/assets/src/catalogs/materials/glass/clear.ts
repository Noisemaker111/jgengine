import type { LibraryMaterial } from "../../materialLibrary";

// Glass: transmission and roughness carry the look. The smudged variant adds a scanned
// fingerprint normal so glass is not a mathematically clean sheet.
export default { name: "glass/clear", title: "Clear glass", group: "glass", surface: "glass", tileMetres: 2, response: { metalness: 0, roughness: 0.03, transmission: 1, ior: 1.52, thickness: 0.01, alphaMode: "opaque" } } satisfies LibraryMaterial;
