/**
 * Inspect-shot: pure post-processing on a PNG already on disk — no browser
 * launch. Decodes the file, runs the coarse-grid pixel metrics, prints
 * `{ colorEntropyBits, dominantColorShare, edgeDensity, luminance, nonblank }`
 * as JSON. A blank/broken capture (nonblank === false) always exits nonzero;
 * the four look-quality thresholds (sparse/primitive/murk) only warn unless
 * `--strict` is passed. See jgengine-verify SKILL for where this sits in
 * the ladder.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng } from "./png-reader";
import { computeShotMetrics, evaluateThresholds } from "./shot-metrics";

const HELP = `bun run scripts/inspect-shot.ts <path-to-png> [options]

  --strict       exit nonzero when a look-quality threshold is crossed
                 (blank/broken screenshots always exit nonzero)
  --out <path>   also write the metrics JSON to this path
  --help         show this text
`;

type Args = { file?: string; strict: boolean; out?: string; help: boolean };

function parseArgs(argv: string[]): Args {
  const args: Args = { strict: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--strict") args.strict = true;
    else if (value === "--out") args.out = argv[++index];
    else if (value === "--help" || value === "-h") args.help = true;
    else if (!value.startsWith("--")) args.file = value;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || args.file === undefined) {
  console.log(HELP);
  process.exit(args.help ? 0 : 1);
}

const bytes = readFileSync(args.file);
const { width, height, data } = decodePng(bytes);
const metrics = computeShotMetrics(width, height, data);
const json = JSON.stringify(metrics, null, 2);

console.log(json);
if (args.out !== undefined) writeFileSync(args.out, json);

if (!metrics.nonblank) {
  console.error("inspect-shot: blank or broken screenshot (alphaPixels/variance/colorBuckets below guard)");
  process.exit(1);
}

const warnings = evaluateThresholds(metrics);
for (const warning of warnings) console.error(`inspect-shot: ${warning.message}`);

process.exit(args.strict && warnings.length > 0 ? 1 : 0);
