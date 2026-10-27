import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import { answerHas, loadHasSources, type HasAnswer, type HasSources } from "../find/has";
import { engineRoot } from "../find/codeMap";

/**
 * `jgengine plan`: a game's build plan in `PLAN.md` next to its code. The agent writes the brief, the
 * feature list and the milestones; this command writes, for every feature, the engine folder or
 * capability that covers it and the gaps that need new engine work, from the same index `has` reads.
 */

export const PLAN_FILE = "PLAN.md";
const FEATURES = "## Features";
const COVERAGE = "## Engine coverage";
const GAPS = "## Gaps";
const MILESTONES = "## Milestones";
const GENERATED = "<!-- written by `jgengine plan` from the Features list; edit the list, then run it again -->";

/** One feature line: `query` is what is looked up (the words before ` — `), `label` the whole line. */
export interface PlanFeature {
  label: string;
  query: string;
}

/** Milestone checkboxes under `## Milestones`. */
export interface MilestoneTally {
  done: number;
  open: number;
  /** The first open milestone's text, the next PR. */
  next: string | null;
}

/** The lines of one `## ` section, without its heading; null when the section is missing. */
function planSection(markdown: string, heading: string): string[] | null {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^## /.test(lines[i]!)) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end);
}

/** Bullets under `## Features`, each looked up by its words before ` — ` (or `: `). */
export function parseFeatures(markdown: string): PlanFeature[] {
  const features: PlanFeature[] = [];
  for (const line of planSection(markdown, FEATURES) ?? []) {
    const bullet = /^\s*[-*]\s+(?:\[[ xX]\]\s+)?(.+?)\s*$/.exec(line);
    if (bullet === null) continue;
    const label = bullet[1]!;
    const query = label.split(/\s+—\s+|:\s+/)[0]!.replace(/[`*_]/g, "").trim();
    if (query !== "") features.push({ label, query });
  }
  return features;
}

/** Count `- [x]` and `- [ ]` under `## Milestones`. */
export function tallyMilestones(markdown: string): MilestoneTally {
  const tally: MilestoneTally = { done: 0, open: 0, next: null };
  for (const line of planSection(markdown, MILESTONES) ?? []) {
    const box = /^\s*[-*]\s+\[([ xX])\]\s+(.+?)\s*$/.exec(line);
    if (box === null) continue;
    if (box[1] === " ") {
      tally.open += 1;
      tally.next ??= box[2]!;
    } else tally.done += 1;
  }
  return tally;
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|");
}

function engineCell(answer: HasAnswer): string {
  const parts: string[] = [];
  for (const capability of answer.capabilities.slice(0, 2)) {
    parts.push(capability.import === null ? `\`${capability.slug}\`` : `\`${capability.slug}\` · \`${capability.import}\``);
  }
  if (parts.length === 0 && answer.folders.length > 0) parts.push(answer.folders.slice(0, 2).map((folder) => `\`${folder}\``).join(", "));
  return parts.length === 0 ? "—" : parts.join("<br>");
}

/** The generated `## Engine coverage` and `## Gaps` sections for these answers. */
export function renderCoverage(features: readonly PlanFeature[], answers: readonly HasAnswer[]): { coverage: string[]; gaps: string[] } {
  const coverage = [GENERATED, "", "| Feature | Engine | Verdict |", "| --- | --- | --- |"];
  const gaps = [GENERATED, ""];
  features.forEach((feature, i) => {
    const answer = answers[i]!;
    coverage.push(`| ${cell(feature.label)} | ${cell(engineCell(answer))} | ${answer.verdict} |`);
    if (answer.verdict === "gap") {
      gaps.push(`- ${feature.label}: nothing ships; build it in \`packages/core/src/<feature>/\` with this game as the first adopter.`);
    } else if (answer.verdict === "partial") {
      gaps.push(`- ${feature.label}: only part ships (${answer.folders[0] ?? answer.capabilities[0]?.slug ?? "?"}); extend that owner or confirm it covers the feature.`);
    }
  });
  if (features.length === 0) coverage.push("| (no features listed yet) | | |");
  if (gaps.length === 2) gaps.push("- none: every listed feature has a shipped owner.");
  return { coverage, gaps };
}

/** Replace (or append) one `## ` section's body, leaving every other section as written. */
export function replaceSection(markdown: string, heading: string, body: readonly string[], before?: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => line.trim() === heading);
  const block = [heading, "", ...body, ""];
  if (start >= 0) {
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i += 1) {
      if (/^## /.test(lines[i]!)) {
        end = i;
        break;
      }
    }
    lines.splice(start, end - start, ...block);
    return lines.join("\n");
  }
  const at = before === undefined ? -1 : lines.findIndex((line) => line.trim() === before);
  if (at < 0) return `${lines.join("\n").trimEnd()}\n\n${block.join("\n")}`;
  lines.splice(at, 0, ...block);
  return lines.join("\n");
}

/** The first `PLAN.md` for a game: the brief, and empty sections for the agent to fill. */
export function newPlan(title: string, brief: string): string {
  return [
    `# ${title} plan`,
    "",
    `Brief: ${brief}`,
    "",
    FEATURES,
    "",
    "<!-- Every feature the brief implies, one per line, a few words each (the words before ` — ` are looked up). Then run `jgengine plan` again. -->",
    "",
    COVERAGE,
    "",
    GAPS,
    "",
    MILESTONES,
    "",
    "One PR each, in order; the gaps go first that later milestones need. Tick a milestone in the PR that lands it.",
    "",
    "- [ ] 1. ",
    "",
  ].join("\n");
}

/** Fill the generated sections of a plan from the engine's current index. */
export function refreshPlan(markdown: string, sources: HasSources): { text: string; features: PlanFeature[]; answers: HasAnswer[] } {
  const features = parseFeatures(markdown);
  const answers = answerHas(features.map((feature) => feature.query), sources);
  const { coverage, gaps } = renderCoverage(features, answers);
  let text = replaceSection(markdown, COVERAGE, coverage, MILESTONES);
  text = replaceSection(text, GAPS, gaps, MILESTONES);
  return { text: `${text.trimEnd()}\n`, features, answers };
}

/** A game id under `games/` in the engine checkout, or a folder path. */
export function resolveGameDir(target: string, cwd: string = process.cwd()): string | null {
  const direct = resolve(cwd, target);
  if (existsSync(direct) && statSync(direct).isDirectory()) return direct;
  const root = engineRoot(cwd);
  if (root !== null && existsSync(join(root, "games", target))) return join(root, "games", target);
  return null;
}

const HELP = [
  'jgengine plan <game> [--brief "<what to build>"]   write or refresh <game>/PLAN.md',
  "",
  'first:  jgengine plan fernwild --brief "ARK: Survival Evolved 1:1"   writes the skeleton',
  "then:   list every feature under ## Features, run `jgengine plan fernwild` again: it fills",
  "        ## Engine coverage (the engine folder or capability per feature) and ## Gaps",
  "last:   order ## Milestones, one PR each, gaps first; tick each in the PR that lands it",
  "",
  "<game> is a game id under games/ in the engine checkout, or a folder (`.` in a created project).",
].join("\n");

/** `jgengine plan` command entry. */
export function runPlan(argv: readonly string[]): number {
  let brief: string | null = null;
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") {
      console.log(HELP);
      return 0;
    }
    if (arg === "--brief") {
      brief = argv[(i += 1)]?.trim() ?? "";
      if (brief === "") {
        console.error("jgengine plan: --brief needs the text of the brief");
        return 1;
      }
    } else if (arg.startsWith("-")) {
      console.error(`jgengine plan: unknown option ${arg}`);
      return 1;
    } else positional.push(arg);
  }
  if (positional.length !== 1) {
    console.log(HELP);
    return 1;
  }
  const dir = resolveGameDir(positional[0]!);
  if (dir === null) {
    console.error(`jgengine plan: no game folder ${positional[0]} (a folder, or a game id under games/)`);
    return 1;
  }
  const path = join(dir, PLAN_FILE);
  if (!existsSync(path)) {
    if (brief === null) {
      console.error(`jgengine plan: ${path} does not exist yet; start it with --brief "<what to build>"`);
      return 1;
    }
    writeFileSync(path, newPlan(basename(dir), brief));
    console.log(`jgengine plan: wrote ${path}. List every feature under ${FEATURES}, then run jgengine plan ${positional[0]} again.`);
    return 0;
  }
  let markdown = readFileSync(path, "utf8");
  if (brief !== null) markdown = markdown.replace(/^Brief: .*$/m, `Brief: ${brief}`);
  const { text, features, answers } = refreshPlan(markdown, loadHasSources());
  writeFileSync(path, text);
  const count = (verdict: HasAnswer["verdict"]) => answers.filter((answer) => answer.verdict === verdict).length;
  const milestones = tallyMilestones(text);
  console.log(
    `jgengine plan: ${path} — ${features.length} features: ${count("covered")} covered, ${count("partial")} partial, ${count("gap")} gaps; ` +
      `milestones ${milestones.done} done, ${milestones.open} open${milestones.next === null ? "" : `; next: ${milestones.next}`}`,
  );
  if (features.length === 0) console.log(`jgengine plan: no features yet — list them under ${FEATURES}.`);
  return 0;
}
