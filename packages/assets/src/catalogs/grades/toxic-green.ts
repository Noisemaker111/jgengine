import type { LutGrade } from "../lutGrades";

export default { id: "toxic-green", title: "Toxic green", look: "Sickly green cast for ruins and labs.", recipe: { contrast: 1.07, saturation: 0.95, gain: [0.88, 1.08, 0.88], shadowTint: [-0.01, 0.025, 0.0], highlightTint: [-0.01, 0.03, -0.01] } } as const satisfies LutGrade;
