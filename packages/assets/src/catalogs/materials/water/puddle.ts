import type { LibraryMaterial } from "../../materialLibrary";

export default { name: "water/puddle", title: "Puddle", group: "water", surface: "water", tileMetres: 3, response: { metalness: 0, roughness: 0.06, alphaMode: "opaque" } } satisfies LibraryMaterial;
