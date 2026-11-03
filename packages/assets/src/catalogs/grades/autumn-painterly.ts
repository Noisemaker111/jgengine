import type { LutGrade } from "../lutGrades";

export default { id: "autumn-painterly", title: "Autumn painterly", look: "Golden late-afternoon midtones, cool blue-grey shadows, cream highlights, richer colour.", recipe: { contrast: 1.08, saturation: 1.15, gain: [1.06, 1.0, 0.86], shadowTint: [-0.012, 0.0, 0.03], highlightTint: [0.04, 0.02, -0.035] } } as const satisfies LutGrade;
