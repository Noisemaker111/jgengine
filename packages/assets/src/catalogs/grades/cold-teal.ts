import type { LutGrade } from "../lutGrades";

export default { id: "cold-teal", title: "Cold teal", look: "Blue-green cast, held highlights, crisp shadows.", recipe: { contrast: 1.06, saturation: 0.92, gain: [0.93, 1.0, 1.06], shadowTint: [-0.015, 0.012, 0.025], highlightTint: [-0.01, 0.01, 0.025] } } as const satisfies LutGrade;
