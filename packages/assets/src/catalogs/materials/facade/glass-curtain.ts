import type { LibraryMaterial } from "../../materialLibrary";

// Curtain wall with aluminium mullions and spandrel bands: eight 3.5 m floors and fourteen 2 m panes per tile.
export default { name: "facade/glass-curtain", title: "Glass curtain wall with mullions", group: "facade", source: "ambientcg-facade006", surface: "opaque", tileMetres: 28, response: { metalness: 0.7, roughness: 0.16 } } satisfies LibraryMaterial;
