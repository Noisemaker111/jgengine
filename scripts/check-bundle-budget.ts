/**
 * Fails when an app-facing entry grows past its gzip budget. Each entry is a few lines an app would
 * write; the check bundles it the way an app's bundler would (minified, tree-shaken, for the
 * browser), gzips it at level 9, and compares. Budgets that sit on three.js are written as
 * "plain three.js + N KB", measured in the same run, so a three.js upgrade moves the bar for both.
 *
 * A failure means the entry now pulls in code it did not before. Find the import that brought it in
 * (`bun scripts/check-bundle-budget.ts --why <entry>` lists the biggest source files) and load it
 * lazily or move it out of that entry's import graph; raise a budget only when the new code is the
 * entry's own job, in the same PR that says why.
 *
 *   bun scripts/check-bundle-budget.ts [--why <entry>]
 */
import { mkdir, rm, symlink } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";

interface Entry {
  readonly name: string;
  readonly code: string;
  /** Allowed gzip KB: absolute, or on top of the plain three.js baseline. */
  readonly budget: { readonly kb: number; readonly overThree?: true };
}

const PLAIN_THREE = `import { WebGLRenderer, Scene, PerspectiveCamera, Mesh, BoxGeometry, MeshStandardMaterial, Line, BufferGeometry, LineBasicMaterial, HemisphereLight, DirectionalLight } from "three";
const renderer = new WebGLRenderer({ canvas: document.querySelector("canvas") });
const scene = new Scene();
scene.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()), new Line(new BufferGeometry(), new LineBasicMaterial()), new HemisphereLight(), new DirectionalLight());
renderer.render(scene, new PerspectiveCamera());`;

const ENTRIES: readonly Entry[] = [
  {
    name: "scene document + undo",
    code: `import { decodeEditorDocument } from "@jgengine/core/editor/document";
import { createEditorSession } from "@jgengine/core/editor/commands";
const decoded = decodeEditorDocument(JSON.parse(localStorage.scene));
if (decoded.ok) createEditorSession(decoded.document).undo();`,
    budget: { kb: 38 },
  },
  {
    name: "scene view",
    code: `import { mountSceneView } from "@jgengine/core/sceneView/mount.draw";
mountSceneView(document.querySelector("canvas"), JSON.parse(localStorage.scene)).dispose();`,
    budget: { kb: 8 },
  },
];

const root = resolve(import.meta.dir, "..");
const scratch = join(root, ".scratch", "bundle-budget");

async function bundle(name: string, code: string, metafile = false): Promise<{ gzip: number; inputs?: Record<string, { bytesInOutput: number }> }> {
  const file = join(scratch, `${name.replace(/\W+/g, "-")}.ts`);
  await Bun.write(file, code);
  const result = await Bun.build({ entrypoints: [file], target: "browser", minify: true, metafile });
  if (!result.success) throw new AggregateError(result.logs, `bundling "${name}" failed`);
  const text = (await Promise.all(result.outputs.map((output) => output.text()))).join("");
  const inputs = metafile ? (result.metafile?.outputs ? Object.values(result.metafile.outputs)[0]?.inputs : undefined) : undefined;
  return { gzip: gzipSync(text, { level: 9 }).length / 1024, ...(inputs === undefined ? {} : { inputs }) };
}

await rm(scratch, { recursive: true, force: true });
await mkdir(join(scratch, "node_modules"), { recursive: true });
await symlink(join(root, "packages/core/node_modules/three"), join(scratch, "node_modules/three"), "junction");

const why = process.argv.includes("--why") ? process.argv[process.argv.indexOf("--why") + 1] : undefined;
if (why !== undefined) {
  const entry = ENTRIES.find((candidate) => candidate.name === why);
  if (entry === undefined) throw new Error(`no entry "${why}"; entries: ${ENTRIES.map((e) => e.name).join(", ")}`);
  const { inputs = {} } = await bundle(entry.name, entry.code, true);
  const rows = Object.entries(inputs).sort((a, b) => b[1].bytesInOutput - a[1].bytesInOutput).slice(0, 25);
  for (const [path, { bytesInOutput }] of rows) console.log(`${(bytesInOutput / 1024).toFixed(1).padStart(7)} KB raw  ${relative(root, resolve(root, path))}`);
  process.exit(0);
}

const three = (await bundle("plain three", PLAIN_THREE)).gzip;
console.log(`plain three.js (renderer, mesh, lines, two lights): ${three.toFixed(1)} KB gzip`);
let failed = 0;
for (const entry of ENTRIES) {
  const { gzip } = await bundle(entry.name, entry.code);
  const limit = entry.budget.overThree === true ? three + entry.budget.kb : entry.budget.kb;
  const rule = entry.budget.overThree === true ? `plain three.js + ${entry.budget.kb} KB` : `${entry.budget.kb} KB`;
  const ok = gzip <= limit;
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${entry.name}: ${gzip.toFixed(1)} KB gzip, budget ${rule} (${limit.toFixed(1)} KB)`);
}
if (failed > 0) {
  console.error(`\n${failed} entr${failed === 1 ? "y grew" : "ies grew"} past budget. Run \`bun scripts/check-bundle-budget.ts --why "<entry>"\` to see what it pulls in, and load the new code lazily or keep it out of that entry (budgets live in scripts/check-bundle-budget.ts).`);
  process.exit(1);
}
