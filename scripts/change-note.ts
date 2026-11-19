export const NOTE_SECTIONS = ["Migrate", "Added", "Changed", "Fixed", "Removed"] as const;
export type NoteSection = (typeof NOTE_SECTIONS)[number];

const SECTION_PREFIX = new RegExp(`^(${NOTE_SECTIONS.join("|")})\\s*:\\s*(.+)$`, "is");
const PR_ONLY = /^(?:(?:closes|fixes|refs)\s+#\d+|prevention:|root cause:)/i;

export interface ApiExport {
  kind: string;
  description: string;
}

export function parseApiSurface(text: string): Map<string, Map<string, ApiExport>> {
  const modules = new Map<string, Map<string, ApiExport>>();
  let current: Map<string, ApiExport> | null = null;
  for (const line of text.split("\n")) {
    const compact = /^- `(@[^`]+)`:\s*(.+)$/.exec(line);
    if (compact !== null) {
      const mod = modules.get(compact[1]!) ?? new Map<string, ApiExport>();
      modules.set(compact[1]!, mod);
      for (const match of compact[2]!.matchAll(/`([^`]+)`/g)) {
        mod.set(match[1]!, { kind: "", description: "" });
      }
      continue;
    }
    const heading = /^## (@\S+)\s*$/.exec(line);
    if (heading !== null) {
      current = modules.get(heading[1]!) ?? new Map();
      modules.set(heading[1]!, current);
      continue;
    }
    const entry = /^- `([^`]+)` \(([^)]+)\):(.*)$/.exec(line);
    if (entry === null || current === null) continue;
    const rest = entry[3]!;
    const dash = rest.indexOf(" — ");
    current.set(entry[1]!, { kind: entry[2]!, description: dash < 0 ? "" : rest.slice(dash + 3).trim() });
  }
  return modules;
}

const NAME_CAP = 8;

function nameList(names: readonly string[]): string {
  const shown = names.slice(0, NAME_CAP).map((name) => `\`${name}\``);
  const more = names.length - shown.length;
  return more > 0 ? `${shown.join(", ")} and ${more} more` : shown.join(", ");
}

function firstSentence(text: string): string {
  const end = text.search(/\.(\s|$)/);
  return end < 0 ? text : text.slice(0, end + 1);
}

export function apiNoteBullets(before: string, after: string): { added: string[]; removed: string[] } {
  const old = parseApiSurface(before);
  const now = parseApiSurface(after);
  const added: string[] = [];
  const removed: string[] = [];
  for (const [module, names] of [...now].sort(([a], [b]) => a.localeCompare(b))) {
    const fresh = [...names.keys()].filter((name) => !(old.get(module)?.has(name) ?? false));
    if (fresh.length === 0) continue;
    const lead = fresh.find((name) => /function|const|class/.test(names.get(name)!.kind)) ?? fresh[0]!;
    const what = firstSentence(names.get(lead)!.description);
    const others = fresh.filter((name) => name !== lead);
    added.push(
      `- \`${lead}\` (\`${module}\`)${what === "" ? "" : `: ${what}`}${others.length === 0 ? "" : ` Also ${nameList(others)}.`}`,
    );
  }
  for (const [module, names] of [...old].sort(([a], [b]) => a.localeCompare(b))) {
    const gone = [...names.keys()].filter((name) => !(now.get(module)?.has(name) ?? false));
    if (gone.length > 0) removed.push(`- \`${module}\` no longer exports ${nameList(gone)}.`);
  }
  return { added, removed };
}

const SHIPPED_SOURCE = /^packages\/[^/]+\/src\/.+\.(ts|tsx)$/;
const NOT_SHIPPED = /\.(test|spec)\.tsx?$/;
const SEAM_CAP = 8;
const GAME_PATH = /^games\/(?!scripts\/)[^/]+\//;

export function engineSeamLine(paths: readonly string[]): string | null {
  if (!paths.some((path) => GAME_PATH.test(path))) return null;
  const engine = [...new Set(paths.filter((path) => SHIPPED_SOURCE.test(path) && !NOT_SHIPPED.test(path)))].sort();
  if (engine.length === 0) return "Engine seam: none - game content only";
  const shown = engine.slice(0, SEAM_CAP);
  const more = engine.length - shown.length;
  return `Engine seam: ${shown.join(", ")}${more > 0 ? ` and ${more} more` : ""}`;
}

export function noteEntries(messages: readonly string[]): { sections: Map<NoteSection, string[]>; prOnly: string[] } {
  const sections = new Map<NoteSection, string[]>();
  const prOnly: string[] = [];
  for (const raw of messages) {
    const message = raw.trim().replace(/\s+/g, " ");
    if (message === "") continue;
    if (PR_ONLY.test(message)) {
      if (!prOnly.includes(message)) prOnly.push(message);
      continue;
    }
    const match = SECTION_PREFIX.exec(message);
    const section = (match === null
      ? "Changed"
      : NOTE_SECTIONS.find((name) => name.toLowerCase() === match[1]!.toLowerCase())!) as NoteSection;
    const text = match === null ? message : match[2]!.trim();
    // A line said twice (a re-close repeating one) is one bullet.
    const listed = sections.get(section) ?? [];
    if (!listed.includes(`- ${text}`)) sections.set(section, [...listed, `- ${text}`]);
  }
  return { sections, prOnly };
}

const API_BULLET = /^`[^`]+` (?:\(`[^`]+`\)|no longer exports )/;

/**
 * The messages a written note came from, lead first, so a lane closed again with more `-m` lines adds
 * them to its note instead of replacing it (a re-close once wiped #2626's note). The API bullets and
 * the seam line are left out: the next render writes them again from the diff.
 */
export function noteMessages(text: string): string[] {
  const prose: string[] = [];
  const bullets: string[] = [];
  let section: NoteSection | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "") continue;
    const heading = /^###\s+(.+)$/.exec(line);
    if (heading !== null) {
      section = NOTE_SECTIONS.find((name) => name === heading[1]?.trim()) ?? null;
      continue;
    }
    if (section === null) {
      if (!line.startsWith("Engine seam:")) prose.push(line);
      continue;
    }
    const bullet = /^- (.+)$/.exec(line)?.[1];
    if (bullet === undefined || API_BULLET.test(bullet)) continue;
    bullets.push(section === "Changed" ? bullet : `${section}: ${bullet}`);
  }
  const lead = prose[0];
  const ordered = lead === undefined ? bullets : [...bullets.filter((bullet) => bullet.replace(SECTION_PREFIX, "$2") === lead), ...bullets.filter((bullet) => bullet.replace(SECTION_PREFIX, "$2") !== lead)];
  return [...ordered, ...prose.filter((line) => PR_ONLY.test(line))];
}

export function renderChangeNote(input: {
  messages: readonly string[];
  api: { added: readonly string[]; removed: readonly string[] };
  seam: string | null;
}): string {
  const { sections, prOnly } = noteEntries(input.messages);
  if (input.api.added.length > 0) sections.set("Added", [...(sections.get("Added") ?? []), ...input.api.added]);
  if (input.api.removed.length > 0) sections.set("Removed", [...(sections.get("Removed") ?? []), ...input.api.removed]);
  const lead = input.messages
    .map((message) => message.trim().replace(/\s+/g, " "))
    .find((message) => message !== "" && !PR_ONLY.test(message));
  const prose = [lead?.replace(SECTION_PREFIX, "$2"), ...prOnly, input.seam].filter(
    (line): line is string => line != null && line !== "",
  );
  const blocks = [prose.join("\n\n")];
  for (const name of NOTE_SECTIONS) {
    const bullets = sections.get(name);
    if (bullets !== undefined && bullets.length > 0) blocks.push(`### ${name}\n\n${bullets.join("\n")}`);
  }
  return `${blocks.filter((block) => block !== "").join("\n\n")}\n`;
}
