import type { LutGrade } from "../lutGrades";

export default { id: "pastel", title: "Pastel", look: "Airy, lifted blacks, soft saturated colour.", recipe: { contrast: 0.86, saturation: 0.9, gamma: [0.88, 0.88, 0.88], fade: 0.07, highlightTint: [0.012, 0.0, 0.012] } } as const satisfies LutGrade;
