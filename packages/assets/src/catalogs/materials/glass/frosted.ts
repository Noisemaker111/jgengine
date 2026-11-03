import type { LibraryMaterial } from "../../materialLibrary";

export default { name: "glass/frosted", title: "Frosted glass", group: "glass", surface: "glass", tileMetres: 2, response: { metalness: 0, roughness: 0.42, transmission: 1, ior: 1.52, thickness: 0.01, alphaMode: "opaque" } } satisfies LibraryMaterial;
