import type { LutGrade } from "../lutGrades";

export default { id: "cool-overcast", title: "Cool overcast", look: "Flat blue-grey daylight, calm and muted.", recipe: { contrast: 0.95, saturation: 0.8, gain: [0.96, 1.0, 1.05], fade: 0.02 } } as const satisfies LutGrade;
