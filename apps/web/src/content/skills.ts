const skillDocs = import.meta.glob<string>("../../../../skills/*/SKILL.md", {
  query: "?raw",
  import: "default",
});

export const SKILL_SLUGS = [
  "jgengine",
  "jgengine-foundation",
  "jgengine-world",
  "jgengine-procedural",
  "jgengine-combat",
  "jgengine-gameplay",
  "jgengine-multiplayer",
  "jgengine-ui",
  "jgengine-assets",
  "jgengine-verify",
] as const;

export type Skill = {
  slug: string;
  name: string;
  description: string;
  markdown: string;
  body: string;
};

const field = (fm: string, key: string) =>
  fm.match(new RegExp(`^${key}:\\s*(.*)$`, "m"))?.[1]?.trim() ?? "";

function parse(slug: string, raw: string): Skill {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const fm = m?.[1] ?? "";
  const body = m ? raw.slice(m[0].length) : raw;
  return {
    slug,
    name: field(fm, "name") || slug,
    description: field(fm, "description"),
    markdown: raw,
    body,
  };
}

export async function loadSkill(slug: string): Promise<Skill | undefined> {
  const docPath = Object.keys(skillDocs).find((path) => path.split("/").at(-2) === slug);
  if (docPath === undefined) return undefined;
  const raw = await skillDocs[docPath]!();
  return parse(slug, raw);
}
