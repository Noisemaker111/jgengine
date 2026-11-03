import type { LutGrade } from "../lutGrades";

export default { id: "sepia", title: "Sepia", look: "Brown monochrome.", recipe: { contrast: 1.04, sepia: 1 } } as const satisfies LutGrade;
