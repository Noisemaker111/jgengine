import { defineStore } from "@jgengine/core/store/defineStore";

import { WORLD_SEED } from "../../world";
import { createHousehold, type HouseholdState } from "./types";

export const householdStore = defineStore<HouseholdState>("household", () => createHousehold(WORLD_SEED));
