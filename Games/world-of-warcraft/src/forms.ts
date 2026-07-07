import type { FormDef } from "@jgengine/core/scene/form";

export const WOLF_FORM_ID = "wolf_form";
export const WOLF_FORM_DURATION_SECONDS = 20;

export const forms: FormDef[] = [
  {
    id: WOLF_FORM_ID,
    movement: { walkSpeed: 7.2 },
    abilities: ["iron_sword"],
    model: "forest_wolf",
  },
];
