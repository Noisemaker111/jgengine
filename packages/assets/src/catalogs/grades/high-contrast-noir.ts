import type { LutGrade } from "../lutGrades";

export default { id: "high-contrast-noir", title: "High-contrast noir", look: "Near black and white with hard contrast.", recipe: { contrast: 1.4, saturation: 0.08, gamma: [1.08, 1.08, 1.08] } } as const satisfies LutGrade;
