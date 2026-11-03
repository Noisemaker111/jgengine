import type { LutGrade } from "../lutGrades";

export default { id: "pastel-dusk", title: "Pastel dusk", look: "Plum-violet shadows, rose midtones, cream highlights, soft saturated colour.", recipe: { contrast: 1.02, saturation: 1.05, gain: [1.02, 0.97, 1.03], shadowTint: [0.014, 0.002, 0.034], highlightTint: [0.03, 0.012, -0.004], fade: 0.02 } } as const satisfies LutGrade;
