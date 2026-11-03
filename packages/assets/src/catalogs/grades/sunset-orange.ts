import type { LutGrade } from "../lutGrades";

export default { id: "sunset-orange", title: "Sunset orange", look: "Everything lit from a low orange sun.", recipe: { contrast: 1.05, saturation: 1.12, gain: [1.1, 0.97, 0.82], highlightTint: [0.05, 0.015, -0.03], shadowTint: [0.02, 0.0, 0.015] } } as const satisfies LutGrade;
