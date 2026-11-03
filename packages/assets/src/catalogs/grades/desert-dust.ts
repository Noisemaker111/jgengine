import type { LutGrade } from "../lutGrades";

export default { id: "desert-dust", title: "Desert dust", look: "Bleached sand tones and hazy highlights.", recipe: { contrast: 0.98, saturation: 0.84, gain: [1.07, 1.02, 0.88], fade: 0.035, highlightTint: [0.025, 0.015, -0.01] } } as const satisfies LutGrade;
