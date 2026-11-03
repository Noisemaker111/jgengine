import type { LutGrade } from "../lutGrades";

export default { id: "faded-vintage", title: "Faded vintage", look: "Lifted warm blacks and washed-out colour, like old film.", recipe: { contrast: 0.92, saturation: 0.78, gain: [1.03, 0.98, 0.9], fade: 0.09, shadowTint: [0.015, 0.008, 0.0] } } as const satisfies LutGrade;
