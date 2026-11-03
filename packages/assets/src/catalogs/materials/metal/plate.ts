import type { LibraryMaterial } from "../../materialLibrary";

export default { name: "metal/plate", title: "Steel plate", group: "metal", source: "ambientcg-metalplates001", surface: "opaque", tileMetres: 1.6, response: { metalness: 0.85, roughness: 0.5 } } satisfies LibraryMaterial;
