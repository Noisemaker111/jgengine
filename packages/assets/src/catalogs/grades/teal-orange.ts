import type { LutGrade } from "../lutGrades";

export default { id: "teal-orange", title: "Teal and orange", look: "Warm skin tones against teal shadows.", recipe: { contrast: 1.08, saturation: 1.08, shadowTint: [-0.025, 0.01, 0.035], highlightTint: [0.045, 0.012, -0.03] } } as const satisfies LutGrade;
