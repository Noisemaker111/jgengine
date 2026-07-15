import type { StatCatalog } from "@jgengine/core/scene/entityStats";

export const ALIEN_KIND = "alien";

export const ALIEN_STATS: StatCatalog = { health: { max: 100 } };

export const JOBS = ["Botanist", "Signal-keeper", "Forager", "Tinkerer", "Archivist", "Warden"] as const;
