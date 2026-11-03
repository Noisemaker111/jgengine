import type { LibraryMaterial } from "../../materialLibrary";

// Asphalt and road — wet asphalt is the same scan with a low roughness, not a second download.
export default { name: "asphalt/wet", title: "Wet asphalt", group: "asphalt", source: "ambientcg-asphalt025c", surface: "opaque", tileMetres: 4, response: { metalness: 0, roughness: 0.34, color: "#8f9498" } } satisfies LibraryMaterial;
