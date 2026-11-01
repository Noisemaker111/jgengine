const SOURCE = import.meta.glob("../../../../.claude/skills/jgengine/recipes/cookbook.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export interface CookbookRecipe {
  name: string;
  sentence: string;
  code: string;
}

/** Splits the generated cookbook (`## name`, a sentence, one ts block) into recipes. */
export function parseCookbook(markdown: string): CookbookRecipe[] {
  return markdown
    .split(/^## /m)
    .slice(1)
    .flatMap((section) => {
      const match = /^(.+)\n\n([\s\S]*?)\n\n```ts\n([\s\S]*?)\n```/.exec(section);
      return match === null ? [] : [{ name: match[1]!.trim(), sentence: match[2]!.trim(), code: match[3]! }];
    });
}

export const COOKBOOK: readonly CookbookRecipe[] = parseCookbook(Object.values(SOURCE)[0] ?? "");
