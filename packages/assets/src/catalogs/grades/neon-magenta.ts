import type { LutGrade } from "../lutGrades";

export default { id: "neon-magenta", title: "Neon magenta", look: "Saturated magenta and cyan split for night cities.", recipe: { contrast: 1.12, saturation: 1.25, shadowTint: [0.0, 0.0, 0.04], highlightTint: [0.04, -0.02, 0.035], gain: [1.04, 0.93, 1.06] } } as const satisfies LutGrade;
