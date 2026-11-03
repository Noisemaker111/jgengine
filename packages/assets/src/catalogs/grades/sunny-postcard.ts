import type { LutGrade } from "../lutGrades";

export default { id: "sunny-postcard", title: "Sunny postcard", look: "Teal-blue shadows, cream midtones, paper-white highlights, a little more colour.", recipe: { contrast: 1.04, saturation: 1.12, gain: [1.02, 1.0, 0.96], shadowTint: [-0.04, 0.0, 0.03], highlightTint: [0.012, 0.01, 0.0] } } as const satisfies LutGrade;
