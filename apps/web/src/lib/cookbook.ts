const SOURCE = import.meta.glob<string>("../../../../.claude/skills/jgengine/recipes/cookbook.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

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
      const [, name, sentence, code] = match ?? [];
      return name === undefined || sentence === undefined || code === undefined ? [] : [{ name: name.trim(), sentence: sentence.trim(), code }];
    });
}

export const COOKBOOK: readonly CookbookRecipe[] = parseCookbook(Object.values(SOURCE)[0] ?? "");
