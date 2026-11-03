import type { LutGrade } from "../lutGrades";

export default { id: "neon-sunset", title: "Neon sunset", look: "Peach midtones, cream highlights and teal shadows: a warm coast at golden hour.", recipe: { contrast: 1.1, saturation: 1.15, gain: [1.06, 0.99, 0.9], shadowTint: [-0.03, 0.005, 0.035], highlightTint: [0.04, 0.02, -0.01] } } as const satisfies LutGrade;
