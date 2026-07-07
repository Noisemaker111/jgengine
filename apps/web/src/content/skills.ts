import apiMd from "../../../../skills/jgengine-api/SKILL.md?raw";
import assetsMd from "../../../../skills/jgengine-assets/SKILL.md?raw";
import newgameMd from "../../../../skills/jgengine-newgame/SKILL.md?raw";
import uiMd from "../../../../skills/jgengine-ui/SKILL.md?raw";
import verifyMd from "../../../../skills/jgengine-verify/SKILL.md?raw";

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
  parse("jgengine-api", apiMd),
  parse("jgengine-ui", uiMd),
  parse("jgengine-assets", assetsMd),
  parse("jgengine-verify", verifyMd),
];

export const skillBySlug = (slug: string): Skill | undefined =>
  SKILLS.find((s) => s.slug === slug);
