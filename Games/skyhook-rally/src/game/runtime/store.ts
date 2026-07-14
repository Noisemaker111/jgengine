import { defineStore } from "@jgengine/core/store/defineStore";
import type { RaceState } from "@jgengine/core/game/race";
import type { SpawnPoints } from "@jgengine/core/game/spawnPoints";
import type { MarkerSet } from "@jgengine/core/world/markers";

import type { Vec3 } from "../physics/swing";
import type { SessionState } from "../session/sessionState";
import type { Archipelago } from "../world/archipelago";
import type { CourseDef } from "../world/courses";

export const sessionStore = defineStore<SessionState | undefined>("session", undefined);
export const courseStore = defineStore<CourseDef | undefined>("course", undefined);
export const raceStore = defineStore<RaceState | undefined>("race", undefined);
export const spawnPointsStore = defineStore<SpawnPoints | undefined>("spawnPoints", undefined);
export const flightOriginStore = defineStore<Vec3 | undefined>("flightOrigin", undefined);
export const markersStore = defineStore<MarkerSet | undefined>("markers", undefined);
export const archipelagoStore = defineStore<Archipelago | undefined>("archipelago", undefined);
