import type { LutGrade } from "../lutGrades";

export default { id: "bleach-bypass", title: "Bleach bypass", look: "Silvery, low saturation, high contrast.", recipe: { contrast: 1.18, saturation: 0.72, bleach: 0.55 } } as const satisfies LutGrade;
