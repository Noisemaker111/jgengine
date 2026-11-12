/** A heavy built-in system a scene loads only when it uses one of its kinds or generators. */
export type OnDemandSceneKindId = "city" | "plants" | "landform";

/** One on-demand system: the kinds and generator ids that need it, and the import that registers them. @internal */
export interface OnDemandSceneKind {
  readonly id: OnDemandSceneKindId;
  readonly kinds: readonly string[];
  readonly generators: readonly string[];
  readonly load: () => Promise<void>;
}

/**
 * The built-in scene systems too large to ship in every game: procedural cities, the grown-plant
 * simulation and the landform (terrain) generator. A scene that uses one loads it before drawing (`useOnDemandSceneKinds`); the editor
 * registers them all up front (`registerAllSceneKinds`). @internal
 */
export const ON_DEMAND_SCENE_KINDS: readonly OnDemandSceneKind[] = [
  {
    id: "city",
    kinds: ["city"],
    generators: ["city", "streets", "race-circuit"],
    load: async () => {
      const { registerCityKind } = await import("../city/cityKind");
      registerCityKind();
    },
  },
  {
    id: "plants",
    kinds: ["forest_stand"],
    generators: ["plant.grown"],
    load: async () => {
      const [{ registerForestStandKind }, { registerPlantGenerators }] = await Promise.all([
        import("../plants/stand/forestStand"),
        import("../plants/grown/plantGrown"),
      ]);
      registerForestStandKind();
      registerPlantGenerators();
    },
  },
  {
    id: "landform",
    kinds: [],
    generators: ["landform"],
    load: async () => {
      const { registerLandformGenerator } = await import("../landform/generator/landformGenerator");
      registerLandformGenerator();
    },
  },
];

/** What a scene asks of the registries: the kinds its objects use and the generator ids they name. */
export interface SceneKindNeeds {
  kinds: ReadonlySet<string>;
  generators: ReadonlySet<string>;
}

interface NeedsDocument {
  markers: readonly { kind: string; meta?: Readonly<Record<string, unknown>> | undefined }[];
  volumes: readonly { kind: string }[];
  paths: readonly { kind: string }[];
}

/** The kinds a document's objects use, and the generator ids its markers and the given extras name. @internal */
export function sceneKindNeeds(document: NeedsDocument, generatorIds: Iterable<string> = []): SceneKindNeeds {
  const kinds = new Set<string>();
  const generators = new Set<string>(generatorIds);
  for (const marker of document.markers) {
    kinds.add(marker.kind);
    const assetId = marker.meta?.["assetId"];
    if (typeof assetId === "string") generators.add(assetId);
  }
  for (const volume of document.volumes) kinds.add(volume.kind);
  for (const path of document.paths) kinds.add(path.kind);
  return { kinds, generators };
}

/** The on-demand systems a scene needs. @internal */
export function onDemandSceneKindsFor(needs: SceneKindNeeds): OnDemandSceneKind[] {
  return ON_DEMAND_SCENE_KINDS.filter(
    (entry) => entry.kinds.some((kind) => needs.kinds.has(kind)) || entry.generators.some((id) => needs.generators.has(id)),
  );
}
