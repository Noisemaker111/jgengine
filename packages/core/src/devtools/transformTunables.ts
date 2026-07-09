const TUNABLE_EXPORT_PATTERN =
  /^export const ([A-Za-z_$][\w$]*)\s*=\s*(-?\d+(?:\.\d+)?|true|false|"#(?:[0-9a-fA-F]{3,8})"|'#(?:[0-9a-fA-F]{3,8})')\s*;[ \t]*$/gm;

export interface TunableTransformResult {
  code: string;
  bound: string[];
}

export function transformTunableExports(code: string, table: string): TunableTransformResult {
  const bound: string[] = [];
  const rewritten = code.replace(TUNABLE_EXPORT_PATTERN, (_match, name: string, literal: string) => {
    bound.push(name);
    return `export let ${name} = ${literal};`;
  });
  if (bound.length === 0) return { code, bound };
  const bindings = bound
    .map(
      (name) =>
        `__jg_devtools.discover.bind(${JSON.stringify(table)}, ${JSON.stringify(name)}, { initial: ${name}, get: () => ${name}, set: (__jg_value) => { ${name} = __jg_value as never; } });`,
    )
    .join("\n");
  return {
    code: `${rewritten}\nimport { devtools as __jg_devtools } from "@jgengine/core/devtools/devtools";\n${bindings}\n`,
    bound,
  };
}

const GAME_MODULE_PATTERN = /[/\\]Games[/\\][^/\\]+[/\\]src[/\\](.+)\.(ts|tsx)$/;
const SKIP_MODULE_PATTERN = /(\.test\.|[/\\]main\.tsx$)/;

export function tunableModuleTable(id: string): string | null {
  if (SKIP_MODULE_PATTERN.test(id)) return null;
  const match = GAME_MODULE_PATTERN.exec(id);
  return match === null ? null : match[1]!.replace(/\\/g, "/");
}

export function tunableDiscoveryPlugin(): {
  name: string;
  enforce: "pre";
  transform(code: string, id: string): { code: string; map: null } | null;
} {
  return {
    name: "jgengine-tunable-discovery",
    enforce: "pre",
    transform(code, id) {
      const table = tunableModuleTable(id);
      if (table === null) return null;
      const result = transformTunableExports(code, table);
      return result.bound.length === 0 ? null : { code: result.code, map: null };
    },
  };
}
