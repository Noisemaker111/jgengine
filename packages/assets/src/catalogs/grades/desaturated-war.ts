import type { LutGrade } from "../lutGrades";

export default { id: "desaturated-war", title: "Desaturated war", look: "Muddy olive-grey, flat blacks, little colour.", recipe: { contrast: 1.06, saturation: 0.5, gain: [1.0, 1.0, 0.92], gamma: [1.0, 1.0, 1.04], shadowTint: [0.008, 0.012, 0.0], fade: 0.03 } } as const satisfies LutGrade;
