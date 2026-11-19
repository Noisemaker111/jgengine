import type { TemplateFile } from "./types";

export const JSX_SOURCE_LINE = "/** @jsxImportSource @jgengine/core/ui/jsx */";

/**
 * Starts every scaffolded `.tsx` file with {@link JSX_SOURCE_LINE}, so a file `create` or `sync`
 * writes is the same file `scripts/port-react-ui.ts` and the `react-free` check expect, whatever
 * JSX setting the bundler or host that compiles it has.
 */
export function withJsxSource(files: TemplateFile[]): TemplateFile[] {
  return files.map((file) =>
    file.path.endsWith(".tsx") && !file.contents.startsWith(JSX_SOURCE_LINE) ? { ...file, contents: `${JSX_SOURCE_LINE}\n${file.contents}` } : file,
  );
}
