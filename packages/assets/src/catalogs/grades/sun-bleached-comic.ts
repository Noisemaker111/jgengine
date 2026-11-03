import type { LutGrade } from "../lutGrades";

export default { id: "sun-bleached-comic", title: "Sun-bleached comic", look: "Violet-ink shadows, hot sand midtones, cream highlights, loud colour and hard contrast.", recipe: { contrast: 1.15, saturation: 1.2, gain: [1.05, 1.0, 0.9], shadowTint: [0.012, -0.004, 0.03], highlightTint: [0.03, 0.02, 0.0] } } as const satisfies LutGrade;
