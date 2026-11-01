/**
 * Writes the 17 shipped colour grades as 32³ `.cube` files.
 *
 *   bun packages/assets/scripts/gen-lut-grades.ts <outDir>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { LUT_GRADES, lutGradeFile, lutGradeFileName } from "../src/catalogs/lutGrades";

const out = process.argv[2];
if (out === undefined) {
  console.error("usage: gen-lut-grades.ts <outDir>");
  process.exit(1);
}
for (const grade of LUT_GRADES) {
  const file = join(out, lutGradeFileName(grade.id));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, lutGradeFile(grade.id));
}
console.log(`wrote ${LUT_GRADES.length} grades to ${out}`);
