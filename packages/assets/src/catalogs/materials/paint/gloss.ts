import type { LibraryMaterial } from "../../materialLibrary";

// Painted finishes: response only, no scan. A kit car or prop keeps its palette colour and gains
// the lacquer that separates a painted body from matte clay: a sharp clearcoat over a soft base.
export default { name: "paint/gloss", title: "Gloss car paint", group: "metal", surface: "opaque", tileMetres: 1, response: { metalness: 0.15, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.05 } } satisfies LibraryMaterial;
