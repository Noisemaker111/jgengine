import type { LutGrade } from "../lutGrades";

export default { id: "night-blue", title: "Night blue", look: "Moonlit blue, dark mid tones, cold highlights.", recipe: { contrast: 1.04, saturation: 0.85, gain: [0.78, 0.9, 1.14], gamma: [1.12, 1.06, 0.98], shadowTint: [0.0, 0.01, 0.045], highlightTint: [-0.01, 0.01, 0.04] } } as const satisfies LutGrade;
