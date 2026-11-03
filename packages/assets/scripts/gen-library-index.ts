// Writes each shared library's `index.ts` from its one-file-per-entry folder (see LIBRARY_LISTS).
//
//   bun run gen library-index
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { LIBRARY_LISTS, libraryIndexPath, renderLibraryIndex } from "../src/catalogs/libraryIndex";

const root = join(import.meta.dir, "..", "..", "..");
for (const list of LIBRARY_LISTS) writeFileSync(join(root, libraryIndexPath(list)), await renderLibraryIndex(root, list));
console.log(`library-index: wrote ${LIBRARY_LISTS.length} indexes`);
