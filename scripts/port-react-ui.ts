// `bun scripts/port-react-ui.ts`: move UI code from React to the engine's own UI runtime
// (`@jgengine/core/ui/jsx`). It rewrites imports, points each tsconfig's JSX at the engine
// runtime, takes the React plugin out of Vite configs, and reports every file it could not
// convert on its own and why. Running it again changes nothing.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import { printHelpIfAsked } from "./script-help";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const RUNTIME = "@jgengine/core/ui/jsx";
const DOM_TYPES = `${RUNTIME}/dom.view`;

/** Module specifiers that move, and where to. */
const SPECIFIERS: Record<string, string> = {
  react: RUNTIME,
  "react/jsx-runtime": `${RUNTIME}/jsx-runtime`,
  "react/jsx-dev-runtime": `${RUNTIME}/jsx-dev-runtime`,
  "react-dom": `${RUNTIME}/client.view`,
  "react-dom/client": `${RUNTIME}/client.view`,
  "react-dom/server": `${RUNTIME}/markup`,
};

/**
 * Folders that stay on React because the framework they run on is React: the two examples that show
 * the engine inside a React host app.
 */
const REACT_HOSTS = ["examples/next-host/", "examples/tanstack-host/"];
const SKIP = ["node_modules/", "native/", "packages/core/src/ui/jsx/", "packages/core/src/meta/changelog.ts", "scripts/port-react-ui.ts", "scripts/port-react-ui.test.ts", "scripts/check-react-free.test.ts", "scripts/creator-app-fixture.ts", "games/llmville/packages/backend/"];

interface FileResult {
  path: string;
  changed: boolean;
  notes: string[];
}

function exportedNames(file: string): Set<string> {
  const source = readFileSync(join(ROOT, file), "utf8");
  const names = new Set<string>();
  for (const match of source.matchAll(/export (?:declare )?(?:type|interface|const|function|class|namespace) ([A-Za-z0-9_]+)/g)) names.add(match[1] as string);
  for (const match of source.matchAll(/export (?:type )?\{([^}]*)\}/g)) {
    for (const part of (match[1] as string).split(",")) {
      const name = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop();
      if (name !== undefined && name !== "") names.add(name);
    }
  }
  return names;
}

const runtimeNames = new Set([...exportedNames("packages/core/src/ui/jsx/index.ts"), ...exportedNames("packages/core/src/ui/jsx/types.ts")]);
const domNames = exportedNames("packages/core/src/ui/jsx/dom.view.ts");
const clientNames = new Set([...exportedNames("packages/core/src/ui/jsx/client.view.ts"), "createPortal", "flushSync"]);
const markupNames = exportedNames("packages/core/src/ui/jsx/markup.ts");

function gitFiles(pattern: string[]): string[] {
  const out = Bun.spawnSync(["git", "ls-files", "--", ...pattern], { cwd: ROOT });
  return out.stdout.toString().split("\n").filter((line) => line !== "");
}

function skipped(path: string): boolean {
  return SKIP.some((prefix) => path.startsWith(prefix) || path.includes(`/${prefix}`));
}

interface Named {
  name: string;
  alias: string | null;
  typeOnly: boolean;
}

/** Remove borrowed React peers from browser fixtures and pack the replacement UI package. */
export function portBrowserFixture(text: string): string {
  return text
    .replace(/(installPublicPackages\([^\n]*\[)([^\]]*)(\])/g, (_all, lead: string, packages: string, end: string) =>
      lead + packages.replace(/(["'])react\1/g, '$1ui$1') + end)
    .replace(/^\s*for \(const (?:peer|pkg) of \[["']react["'],\s*["']react-dom["']\]\) await symlink\([^\n]*\n/gm, "\n")
    .replace(/^\s*for \(const peer of \[["']react["'],\s*["']react-dom["']\]\) \{\r?\n\s*await symlink\([^\n]*\r?\n\s*\}\r?\n/gm, "\n")
    .replace(/^\s*\.\.\.\[["']react["'],\s*["']react-dom["']\]\.map\(peer => symlink\([^\n]*\n/gm, "\n");
}

function renderImport(names: Named[], from: string, quote: string, allTypes: boolean): string {
  const parts = names.map((n) => `${!allTypes && n.typeOnly ? "type " : ""}${n.name}${n.alias === null ? "" : ` as ${n.alias}`}`);
  return `import ${allTypes ? "type " : ""}{ ${parts.join(", ")} } from ${quote}${from}${quote};`;
}

/** Rewrites one source file's React imports; returns the new text and what it could not settle. */
export function portSource(path: string, text: string): { text: string; notes: string[] } {
  const notes: string[] = [];
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits: { start: number; end: number; text: string }[] = [];
  let namespace: string | null = null;
  let reactImport: { start: number; end: number; quote: string; names: Named[]; typeOnly: boolean } | null = null;
  let lastImportEnd = 0;

  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) lastImportEnd = statement.getEnd();
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier;
    if (specifier === undefined || !ts.isStringLiteral(specifier)) continue;
    const target = SPECIFIERS[specifier.text];
    if (target === undefined) continue;
    const quote = text[specifier.getStart(source)] ?? '"';
    if (specifier.text !== "react" || ts.isExportDeclaration(statement)) {
      edits.push({ start: specifier.getStart(source), end: specifier.getEnd(), text: `${quote}${target}${quote}` });
      const known = specifier.text === "react-dom/server" ? markupNames : specifier.text.startsWith("react-dom") ? clientNames : null;
      const clause = ts.isImportDeclaration(statement) ? statement.importClause : undefined;
      const bindings = clause?.namedBindings;
      if (known !== null && bindings !== undefined && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          const name = (element.propertyName ?? element.name).text;
          if (!known.has(name)) notes.push(`${specifier.text} has no engine counterpart for \`${name}\``);
        }
      }
      continue;
    }
    const clause = statement.importClause;
    const names: Named[] = [];
    if (clause !== undefined) {
      if (clause.name !== undefined) namespace = clause.name.text;
      const bindings = clause.namedBindings;
      if (bindings !== undefined && ts.isNamespaceImport(bindings)) namespace = bindings.name.text;
      if (bindings !== undefined && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          names.push({
            name: (element.propertyName ?? element.name).text,
            alias: element.propertyName === undefined ? null : element.name.text,
            typeOnly: clause.isTypeOnly || element.isTypeOnly,
          });
        }
      }
    }
    if (reactImport === null) {
      reactImport = { start: statement.getStart(source), end: statement.getEnd(), quote, names, typeOnly: clause?.isTypeOnly === true };
    } else {
      // A second import from react folds into the first.
      reactImport.names.push(...names);
      reactImport.typeOnly = reactImport.typeOnly && clause?.isTypeOnly === true;
      edits.push({ start: statement.getStart(source), end: statement.getEnd(), text: "" });
    }
  }

  // `React.ReactNode` with no import reads the UMD global's types; it gets an import of its own.
  let added = false;
  if (namespace === null && /\bReact\.[A-Za-z]/.test(text) && !/\b(?:const|let|var|function|class|namespace|import)\s+React\b/.test(text)) {
    namespace = "React";
    if (reactImport === null) {
      reactImport = { start: lastImportEnd, end: lastImportEnd, quote: '"', names: [], typeOnly: true };
      added = true;
    }
  }

  // `React.useState`, `React.ReactNode`: each member becomes a named import.
  if (namespace !== null && reactImport !== null) {
    const members = new Map<string, { typeOnly: boolean }>();
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node)) return;
      if (ts.isQualifiedName(node) && ts.isIdentifier(node.left) && node.left.text === namespace) {
        const name = node.right.text;
        if (!members.has(name)) members.set(name, { typeOnly: true });
        edits.push({ start: node.getStart(source), end: node.getEnd(), text: name });
        return;
      }
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === namespace) {
        const name = node.name.text;
        members.set(name, { typeOnly: false });
        edits.push({ start: node.getStart(source), end: node.getEnd(), text: name });
        return;
      }
      if (ts.isIdentifier(node) && node.text === namespace && !ts.isImportClause(node.parent) && !ts.isNamespaceImport(node.parent)) {
        notes.push(`uses the \`${namespace}\` namespace as a value; name what it needs instead`);
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(source, visit);
    for (const [name, info] of members) {
      const existing = reactImport.names.find((n) => n.name === name && n.alias === null);
      if (existing === undefined) reactImport.names.push({ name, alias: null, typeOnly: info.typeOnly });
      else if (!info.typeOnly) existing.typeOnly = false;
    }
    reactImport.typeOnly = reactImport.names.every((n) => n.typeOnly);
  }

  if (reactImport !== null) {
    const seen = new Set<string>();
    const unique = reactImport.names.filter((n) => {
      const key = `${n.name}|${n.alias ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const core = unique.filter((n) => !domNames.has(n.name) || runtimeNames.has(n.name));
    const dom = unique.filter((n) => domNames.has(n.name) && !runtimeNames.has(n.name));
    for (const n of core) if (!runtimeNames.has(n.name)) notes.push(`react has no engine counterpart for \`${n.name}\``);
    const lines: string[] = [];
    if (core.length > 0) lines.push(renderImport(core, RUNTIME, reactImport.quote, core.every((n) => n.typeOnly)));
    if (dom.length > 0) lines.push(renderImport(dom, DOM_TYPES, reactImport.quote, true));
    if (lines.length > 0 || !added) edits.push({ start: reactImport.start, end: reactImport.end, text: `${added && reactImport.start > 0 ? "\n" : ""}${lines.join("\n")}${added && reactImport.start === 0 ? "\n" : ""}` });
  }

  let out = text;
  for (const edit of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  // What is left names React inside a string: a dynamic import, a mock, a generated file's template.
  out = out.replace(/((?:from|import)\s*\(?\s*)(["'`])(react(?:-dom(?:\/client|\/server)?|\/jsx-(?:dev-)?runtime)?)\2/g, (whole, lead: string, quote: string, specifier: string) => {
    const target = SPECIFIERS[specifier];
    return target === undefined ? whole : `${lead}${quote}${target}${quote}`;
  });
  out = out.replace(/((?:mock\.module|vi\.mock|jest\.mock|require)\(\s*)(["'])(react(?:-dom(?:\/client|\/server)?)?)\2/g, (whole, lead: string, quote: string, specifier: string) => {
    const target = SPECIFIERS[specifier];
    return target === undefined ? whole : `${lead}${quote}${target}${quote}`;
  });
  // A test that borrowed another package's React renderer by path imports the engine's instead.
  const borrowed = /(?:\/\/[^\n]*\n)*const \{ renderToStaticMarkup \} = \(await import\(Bun\.resolveSync\("react-dom\/server"[^\n]*\n(?:[^\n]*\n)*?\};\n/;
  if (borrowed.test(out)) {
    out = out.replace(borrowed, `import { renderToStaticMarkup } from "${RUNTIME}/markup";\n`);
    if (!/\bjoin\(/.test(out)) out = out.replace(/import \{ join \} from "node:path";\n/, "");
  }
  return { text: portBrowserFixture(out), notes };
}

/** `"jsx": "react-jsx"` gains the engine runtime as its import source. */
export function portTsconfig(text: string): string {
  if (!/"jsx"\s*:/.test(text)) return text;
  if (/"jsxImportSource"\s*:/.test(text)) return text.replace(/"jsxImportSource"\s*:\s*"[^"]*"/, `"jsxImportSource": "${RUNTIME}"`);
  return text.replace(/^(\s*)"jsx"\s*:\s*"[^"]*"(,?)\s*$/m, (_line, indent: string, comma: string) => `${indent}"jsx": "react-jsx",\n${indent}"jsxImportSource": "${RUNTIME}"${comma}`);
}

/** A Vite config stops loading the React plugin; JSX compiles from the tsconfig's import source. */
export function portViteConfig(text: string): string {
  if (!text.includes("@vitejs/plugin-react")) return text;
  return text
    .replace(/^import\s+\w+\s+from\s+["']@vitejs\/plugin-react["'];?\r?\n/m, "")
    .replace(/\breact\(\)\s*,\s*/g, "")
    .replace(/,\s*react\(\)/g, "")
    .replace(/\breact\(\)/g, "");
}

const JSX_PRAGMA = `/** @jsxImportSource ${RUNTIME} */`;

/**
 * Every `.tsx` file names its JSX source itself, so it compiles against the engine runtime under any
 * bundler or tsconfig: a React, Next or TanStack host that bundles engine source keeps its own
 * `jsxImportSource` for its own files.
 */
export function stampJsxSource(text: string): string {
  if (text.includes("@jsxImportSource")) return text;
  return `${JSX_PRAGMA}
${text}`;
}

function run(argv: readonly string[]): number {
  const write = !argv.includes("--check");
  const resultsByPath = new Map<string, FileResult>();
  const kept: string[] = [];
  const edit = (path: string, port: (text: string) => { text: string; notes: string[] }): void => {
    const full = join(ROOT, path);
    if (!existsSync(full)) return;
    const before = readFileSync(full, "utf8");
    const { text, notes } = port(before);
    const changed = text !== before;
    if (changed && write) writeFileSync(full, text);
    if (changed || notes.length > 0) {
      const previous = resultsByPath.get(path);
      resultsByPath.set(path, { path, changed: changed || previous?.changed === true, notes: [...new Set([...(previous?.notes ?? []), ...notes])] });
    }
  };

  for (const path of gitFiles(["*.ts", "*.tsx", "*.mts"])) {
    if (skipped(path)) continue;
    const host = REACT_HOSTS.some((prefix) => path.startsWith(prefix));
    if (host) {
      if (/from\s+["']react/.test(readFileSync(join(ROOT, path), "utf8"))) kept.push(path);
      continue;
    }
    if (/vite\.config\.m?ts$/.test(path)) edit(path, (text) => ({ text: portViteConfig(text), notes: [] }));
    edit(path, (text) => (/react/i.test(text) ? portSource(path, text) : { text, notes: [] }));
    if (path.endsWith(".tsx")) edit(path, (text) => ({ text: stampJsxSource(text), notes: [] }));
  }
  for (const path of gitFiles(["*tsconfig*.json"])) {
    if (skipped(path) || REACT_HOSTS.some((prefix) => path.startsWith(prefix))) continue;
    edit(path, (text) => ({ text: portTsconfig(text), notes: [] }));
  }

  const results = [...resultsByPath.values()];
  const converted = results.filter((r) => r.changed && r.notes.length === 0);
  const hand = results.filter((r) => r.notes.length > 0);
  const byFolder = new Map<string, number>();
  for (const r of results.filter((x) => x.changed)) {
    const folder = r.path.split("/").slice(0, 2).join("/");
    byFolder.set(folder, (byFolder.get(folder) ?? 0) + 1);
  }
  const lines = [
    `port-react-ui: ${write ? "converted" : "would convert"} ${results.filter((r) => r.changed).length} files (${converted.length} cleanly, ${hand.length} need hand work), ${kept.length} kept on React in framework hosts`,
    "",
    "By folder:",
    ...[...byFolder.entries()].sort((a, b) => b[1] - a[1]).map(([folder, count]) => `  ${String(count).padStart(4)}  ${folder}`),
    "",
    "Need hand work:",
    ...(hand.length === 0 ? ["  none"] : hand.flatMap((r) => r.notes.map((note) => `  ${r.path}: ${note}`))),
    "",
    `Kept on React (${REACT_HOSTS.join(", ")}): ${kept.length} files`,
  ];
  const report = lines.join("\n");
  console.log(report);
  const out = join(ROOT, ".scratch", "port-react-ui", "report.txt");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${report}\n`);
  return !write && results.some((r) => r.changed) ? 1 : 0;
}

if (import.meta.main) {
  const usage = {
    summary: "move UI code from React to the engine's UI runtime (imports, tsconfigs, Vite configs) and report what needs hand work",
    usage: "bun scripts/port-react-ui.ts [--check]",
    flags: [{ flag: "--check", detail: "change nothing; exit 1 if any file would change" }],
    example: "bun scripts/port-react-ui.ts",
  };
  if (printHelpIfAsked("port-react-ui", usage)) process.exit(0);
  process.exit(run(process.argv.slice(2)));
}
