import apiMd from "../../../../skills/jgengine-api/SKILL.md?raw";
import newgameMd from "../../../../skills/jgengine-newgame/SKILL.md?raw";
import verifyMd from "../../../../skills/jgengine-verify/SKILL.md?raw";
const skillDocs = import.meta.glob<string>("../../../../skills/*/SKILL.md", {
  query: "?raw",
  import: "default",
});

const apiReferenceDocs = import.meta.glob<string>(
  "../../../../skills/jgengine-api/reference/*.md",
  { query: "?raw", import: "default" },
);

export const SKILL_SLUGS = [
  "jgengine-newgame",
  "jgengine-api",
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

export const SKILLS: Skill[] = [
  parse("jgengine-newgame", newgameMd),
  parse("jgengine-api", apiFullMd),
  parse("jgengine-verify", verifyMd),
];

export const skillBySlug = (slug: string): Skill | undefined =>
  SKILLS.find((s) => s.slug === slug);
export async function loadSkill(slug: string): Promise<Skill | undefined> {
  const docPath = Object.keys(skillDocs).find((path) => path.split("/").at(-2) === slug);
  if (docPath === undefined) return undefined;
  let raw = await skillDocs[docPath]!();
  if (slug === "jgengine-api") {
    const references = await Promise.all(
      Object.keys(apiReferenceDocs)
        .sort()
        .map((path) => apiReferenceDocs[path]!()),
    );
    raw = [raw, ...references].join("\n\n");
  }
  return parse(slug, raw);
}
