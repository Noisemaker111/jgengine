import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { Glob } from "bun";

import {
  CORE_DOMAIN_SKILLS,
  CORE_INTERNAL_DOMAINS,
  INTAKE_ROUTES,
  NORMAL_GAME_INTAKE,
  SKILL_DIRS,
} from "./skillRouting";

const root = process.cwd();
const skillsRoot = join(root, ".claude", "skills");
const problems: string[] = [];

const ROOT_MAX_BYTES = 6_000;
const ROUTER_MAX_LINES = 100;
const ROUTER_MAX_BYTES = 8_000;
const SKILL_MAX_LINES = 120;
const SKILL_MAX_BYTES = 10_000;
const TOTAL_SKILL_MAX_BYTES = 60_000;
const NORMAL_INTAKE_MAX_BYTES = 25_000;
const DUPLICATE_PARAGRAPH_MIN_CHARS = 180;

function bytes(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function lines(text: string): number {
  return text.split(/\r?\n/).length;
}

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function body(raw: string): string {
  return raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
}

if (existsSync(join(root, "skills"))) {
  problems.push("a top-level skills/ directory exists; model-invocable skills live only in .claude/skills/");
}

const claude = readFileSync(join(root, "CLAUDE.md"), "utf8");
const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
if (claude !== agents) problems.push("CLAUDE.md and AGENTS.md must be byte-identical");
if (bytes(claude) > ROOT_MAX_BYTES) {
  problems.push(`root instructions are ${bytes(claude)} bytes; cap is ${ROOT_MAX_BYTES}`);
}

const skillDirs = readdirSync(skillsRoot)
  .filter((name) => existsSync(join(skillsRoot, name, "SKILL.md")))
  .sort();
const requiredSkills = [...SKILL_DIRS, "jgengine-verify", "workflow", "fan-out"];
for (const name of requiredSkills) {
  if (!skillDirs.includes(name)) problems.push(`missing .claude/skills/${name}/SKILL.md`);
}

const skillText = new Map<string, string>();
let totalSkillBytes = 0;
for (const name of skillDirs) {
  const path = join(skillsRoot, name, "SKILL.md");
  const raw = readFileSync(path, "utf8");
  skillText.set(name, raw);
  totalSkillBytes += bytes(raw);
  if (raw.charCodeAt(0) === 0xfeff) problems.push(`${name}/SKILL.md starts with a UTF-8 BOM`);
  const frontmatter = raw.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  const description = (frontmatter.match(/^description:\s*>?-?\s*([\s\S]*?)(?=\n\S|$)/m)?.[1] ?? "")
    .replace(/\n\s+/g, " ")
    .trim();
  const descriptionWords = description.split(/\s+/).filter(Boolean).length;
  if (descriptionWords === 0 || descriptionWords > 15) {
    problems.push(`${name} description is ${descriptionWords} words; require 1-15 trigger-oriented words`);
  }
  if (/disable-model-invocation:\s*true/.test(frontmatter) && requiredSkills.includes(name as never)) {
    problems.push(`${name} must remain model-invocable`);
  }
  if (lines(raw) > SKILL_MAX_LINES) problems.push(`${name}/SKILL.md is ${lines(raw)} lines; cap is ${SKILL_MAX_LINES}`);
  if (bytes(raw) > SKILL_MAX_BYTES) problems.push(`${name}/SKILL.md is ${bytes(raw)} bytes; cap is ${SKILL_MAX_BYTES}`);
}

const router = skillText.get("jgengine") ?? "";
if (lines(router) > ROUTER_MAX_LINES) problems.push(`jgengine router is ${lines(router)} lines; cap is ${ROUTER_MAX_LINES}`);
if (bytes(router) > ROUTER_MAX_BYTES) problems.push(`jgengine router is ${bytes(router)} bytes; cap is ${ROUTER_MAX_BYTES}`);
if (totalSkillBytes > TOTAL_SKILL_MAX_BYTES) {
  problems.push(`SKILL.md total is ${totalSkillBytes} bytes; cap is ${TOTAL_SKILL_MAX_BYTES}`);
}

let normalIntakeBytes = bytes(claude);
for (const name of NORMAL_GAME_INTAKE) {
  const raw = skillText.get(name);
  if (raw === undefined) problems.push(`normal intake references missing skill ${name}`);
  else normalIntakeBytes += bytes(raw);
}
if (normalIntakeBytes > NORMAL_INTAKE_MAX_BYTES) {
  problems.push(`normal game intake is ${normalIntakeBytes} bytes; cap is ${NORMAL_INTAKE_MAX_BYTES}`);
}

const routedSkills = new Set(Object.values(INTAKE_ROUTES).flat());
for (const name of routedSkills) {
  if (!skillDirs.includes(name)) problems.push(`route references missing skill ${name}`);
  if (!router.includes(`\`${name}\``)) problems.push(`jgengine router does not expose routed skill ${name}`);
}
for (const name of SKILL_DIRS) {
  if (name !== "jgengine" && !routedSkills.has(name)) problems.push(`domain skill ${name} has no intake route`);
}

const coreDomains = readdirSync(join(root, "packages", "core", "src")).filter((name) =>
  statSync(join(root, "packages", "core", "src", name)).isDirectory(),
);
for (const domain of coreDomains) {
  if (!CORE_INTERNAL_DOMAINS.has(domain) && CORE_DOMAIN_SKILLS[domain] === undefined) {
    problems.push(`core domain ${domain}/ has no skill owner in skillRouting.ts`);
  }
}

const duplicateOwners = new Map<string, string>();
for (const [name, raw] of [["CLAUDE.md", claude], ...skillText.entries()] as Array<[string, string]>) {
  for (const paragraph of body(raw).split(/\r?\n\s*\r?\n/)) {
    const normalized = paragraph.replace(/\s+/g, " ").trim();
    if (normalized.length < DUPLICATE_PARAGRAPH_MIN_CHARS || normalized.startsWith("|")) continue;
    const owner = duplicateOwners.get(normalized);
    if (owner !== undefined && owner !== name) problems.push(`duplicate long paragraph in ${owner} and ${name}`);
    else duplicateOwners.set(normalized, name);
  }
}

const PKG_DIRS: Record<string, string> = {
  core: "packages/core/src",
  react: "packages/react/src",
  shell: "packages/shell/src",
  ws: "packages/ws/src",
  node: "packages/node/src",
  sql: "packages/sql/src",
  convex: "packages/convex/src",
  assets: "packages/assets/src",
  github: "packages/github/src",
  jgengine: "packages/jgengine/src",
};
const allowDocRefs = new Set(["@jgengine/core/CHANGELOG", "@jgengine/react/dist", "@jgengine/shell/dist"]);
function resolves(pkg: string, sub: string): boolean {
  const base = join(root, PKG_DIRS[pkg] ?? "", sub);
  return (
    existsSync(`${base}.ts`) ||
    existsSync(`${base}.tsx`) ||
    existsSync(join(base, "index.ts")) ||
    (existsSync(base) && statSync(base).isDirectory()) ||
    existsSync(join(root, "packages", pkg, `${sub}.md`))
  );
}

const seenPaths = new Set<string>();
for (const file of new Glob("**/*.md").scanSync({ cwd: skillsRoot, absolute: true })) {
  const name = basename(file);
  if (name === "api.md" || name === "capabilities.md") continue;
  const raw = readFileSync(file, "utf8");
  for (const match of raw.matchAll(/@jgengine\/(core|react|shell|ws|node|sql|convex|assets|github|jgengine)\/[A-Za-z0-9_/]+/g)) {
    const ref = match[0];
    if (seenPaths.has(ref) || allowDocRefs.has(ref)) continue;
    seenPaths.add(ref);
    const [, pkg, ...rest] = ref.split("/");
    if (pkg !== undefined && !resolves(pkg, rest.join("/"))) problems.push(`unresolved documented import ${ref}`);
  }
}

if (process.argv.includes("--report")) {
  console.log(`root ${lines(claude)} lines ${words(claude)} words ${bytes(claude)} bytes`);
  for (const name of skillDirs) {
    const raw = skillText.get(name) ?? "";
    console.log(`${name} ${lines(raw)} lines ${words(raw)} words ${bytes(raw)} bytes`);
  }
  console.log(`SKILL.md total ${totalSkillBytes} bytes; normal-game intake ${normalIntakeBytes} bytes`);
}

if (problems.length > 0) {
  console.error(`\ncheck-skill-sync failed:\n${problems.map((problem) => `  ${problem}`).join("\n")}\n`);
  process.exit(1);
}

console.log(
  `check-skill-sync: ${skillDirs.length} skills, router ${lines(router)} lines/${bytes(router)} bytes, ` +
    `total ${totalSkillBytes} bytes, normal intake ${normalIntakeBytes} bytes, roots mirrored`,
);
