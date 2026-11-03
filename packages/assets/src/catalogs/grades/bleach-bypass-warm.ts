import type { LutGrade } from "../lutGrades";

export default { id: "bleach-bypass-warm", title: "Bleach bypass, warm", look: "Bleached amber midtones, teal-black shadows, cream highlights.", recipe: { contrast: 1.22, saturation: 0.88, bleach: 0.4, gain: [1.08, 1.0, 0.88], shadowTint: [-0.02, 0.006, 0.012], highlightTint: [0.04, 0.012, -0.04] } } as const satisfies LutGrade;
