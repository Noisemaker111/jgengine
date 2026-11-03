import type { LutGrade } from "../lutGrades";

export default { id: "warm-filmic", title: "Warm filmic", look: "Gentle S-curve, amber highlights, soft cool shadows.", recipe: { contrast: 1.08, saturation: 1.04, gain: [1.04, 1.0, 0.94], shadowTint: [-0.005, 0.0, 0.02], highlightTint: [0.03, 0.012, -0.015], fade: 0.012 } } as const satisfies LutGrade;
