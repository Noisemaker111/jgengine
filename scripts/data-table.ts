// `bun run data-table <url> --out <file.ts>`: fetch a web page's data table once (a wiki's species
// stats, an item list) into a typed TypeScript file a game imports.
//
// Fetched once, in two places: the page is kept in the main checkout's `.web-cache/` (shared by every
// worktree, never committed), and the written file names its source, so running the same command again
// reads neither the network nor the cache - it says the file is already there. `--refresh` is the only
// way to go back to the network.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { printHelpIfAsked, type Usage } from "./script-help";

const root = fileURLToPath(new URL("..", import.meta.url));

const USAGE: Usage = {
  summary: "fetch a web page's data table once into a typed TypeScript file a game imports",
  usage: "bun run data-table <url> (--out <file.ts> [--table <n>] [--refresh] | --list)",
  flags: [
    { flag: "--out <file.ts>", detail: "the file to write; its name names the exports (creatureStats.ts -> creatureStats, CreatureStatsRow)" },
    { flag: "--table <n>", detail: "which table on the page, counted from 0 as --list numbers them (default 0)" },
    { flag: "--list", detail: "print the page's tables (number, size, headings) and write nothing" },
    { flag: "--refresh", detail: "fetch the page again even if it was fetched before" },
  ],
  example: "bun run data-table https://ark.wiki.gg/wiki/Base_creature_statistics --out games/my-game/src/data/creatureStats.ts",
  exits: ["0  written, listed, or already there", "1  bad arguments, fetch failed, or no such table"],
};

/** One cell as the page lays it out, before spans are spread over the grid. */
interface RawCell {
  text: string;
  header: boolean;
  rowspan: number;
  colspan: number;
}

/** A table read off a page: rows of cells, spans not yet resolved. */
export interface RawTable {
  caption: string;
  rows: RawCell[][];
}

/** The page's character references, decoded: names a wiki writes, and every numeric one. */
function decodeEntities(text: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", times: "×", minus: "−" };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref[0] === "#") {
      const code = ref[1] === "x" || ref[1] === "X" ? Number.parseInt(ref.slice(2), 16) : Number.parseInt(ref.slice(1), 10);
      return code === 160 ? " " : String.fromCodePoint(code);
    }
    return named[ref.toLowerCase()] ?? whole;
  });
}

const clean = (text: string): string => decodeEntities(text).replace(/\s+/g, " ").trim();

/**
 * Every table on a page, innermost content kept with its own table: a navigation box nested inside a
 * table is its own entry. Footnote markers (`<sup class="reference">`) and hidden sort keys are dropped.
 */
export async function readTables(html: string): Promise<RawTable[]> {
  const tables: RawTable[] = [];
  const open: { table: RawTable; row: RawCell[] | null; cell: RawCell | null }[] = [];
  let skipping = 0;
  const top = () => open[open.length - 1];
  const span = (value: string | null) => Math.max(1, Number.parseInt(value ?? "1", 10) || 1);
  const rewriter = new HTMLRewriter()
    .on("table", {
      element(element) {
        const entry = { table: { caption: "", rows: [] }, row: null, cell: null };
        tables.push(entry.table);
        open.push(entry);
        element.onEndTag(() => {
          open.pop();
        });
      },
    })
    .on("caption", {
      text(chunk) {
        const current = top();
        if (current !== undefined) current.table.caption += chunk.text;
      },
    })
    .on("tr", {
      element(element) {
        const current = top();
        if (current === undefined) return;
        const row: RawCell[] = [];
        current.table.rows.push(row);
        current.row = row;
        element.onEndTag(() => {
          current.row = null;
        });
      },
    })
    .on("td, th", {
      element(element) {
        const current = top();
        if (current?.row === undefined || current.row === null) return;
        const cell: RawCell = { text: "", header: element.tagName === "th", rowspan: span(element.getAttribute("rowspan")), colspan: span(element.getAttribute("colspan")) };
        current.row.push(cell);
        current.cell = cell;
        element.onEndTag(() => {
          cell.text = clean(cell.text);
          current.cell = null;
        });
      },
      text(chunk) {
        const current = top();
        if (skipping === 0 && current?.cell !== null && current?.cell !== undefined) current.cell.text += chunk.text;
      },
    })
    .on("sup.reference, .sortkey, style, script", {
      element(element) {
        skipping += 1;
        element.onEndTag(() => {
          skipping -= 1;
        });
      },
    })
    .on("li", {
      element(element) {
        const current = top();
        element.onEndTag(() => {
          if (current?.cell !== null && current?.cell !== undefined) current.cell.text += " ";
        });
      },
    })
    .on("br", {
      element() {
        const current = top();
        if (current?.cell !== null && current?.cell !== undefined) current.cell.text += " ";
      },
    });
  await rewriter.transform(new Response(html)).text();
  for (const table of tables) table.caption = clean(table.caption);
  return tables.filter((table) => table.rows.some((row) => row.length > 0));
}

/** A table's cells laid on a grid, each row- or column-spanning cell copied into every slot it covers. */
function grid(table: RawTable): RawCell[][] {
  const out: RawCell[][] = [];
  table.rows.forEach((row, y) => {
    out[y] ??= [];
    let x = 0;
    for (const cell of row) {
      while (out[y]![x] !== undefined) x += 1;
      for (let dy = 0; dy < cell.rowspan; dy += 1) {
        for (let dx = 0; dx < cell.colspan; dx += 1) {
          out[y + dy] ??= [];
          out[y + dy]![x + dx] = cell;
        }
      }
      x += cell.colspan;
    }
  });
  return out.slice(0, table.rows.length);
}

/** One column of a data table: the heading as the page writes it, its key, and the type its cells share. */
export interface DataColumn {
  heading: string;
  key: string;
  type: "number" | "string";
  /** True when some cell in the column is empty, so its type admits `null`. */
  nullable: boolean;
}

/** A table reduced to data: named, typed columns and one value per column per row. */
export interface DataTable {
  caption: string;
  columns: DataColumn[];
  rows: (number | string | null)[][];
}

/** "Melee Damage (Wild)" -> "meleeDamageWild"; a leading digit gets a `col` prefix. */
export function columnKey(heading: string): string {
  const words = heading
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const key = words.map((word, at) => (at === 0 ? word.toLowerCase() : word[0]!.toUpperCase() + word.slice(1).toLowerCase())).join("");
  if (key === "") return "column";
  return /^\d/.test(key) ? `col${key}` : key;
}

/** The exports' name from the file's: "creatureStats" stays, "creature-stats" becomes "creatureStats". */
export function exportName(fileName: string): string {
  if (/^[A-Za-z_$][\w$]*$/.test(fileName)) return fileName[0]!.toLowerCase() + fileName.slice(1);
  return columnKey(fileName);
}

/** A cell read as a number when it is one: "1,200" and "+5" and "12.5%" are; "1-2" and "N/A" are not. */
export function numberIn(text: string): number | null {
  const bare = text.replace(/,/g, "").replace(/%$/, "").replace(/^\+/, "").replace(/^−/, "-").trim();
  if (!/^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(bare)) return null;
  return Number(bare);
}

const EMPTY = new Set(["", "-", "–", "—", "n/a", "N/A", "?"]);

/**
 * The data in one table: the leading rows of headings name the columns (a heading spanning several
 * columns prefixes each: "Health" over "Base" gives "Health Base"), every later row is a record, and a
 * column whose filled cells are all numbers is typed as numbers.
 */
export function toDataTable(table: RawTable): DataTable {
  const cells = grid(table);
  let headerRows = 0;
  while (headerRows < cells.length && cells[headerRows]!.length > 0 && cells[headerRows]!.every((cell) => cell?.header === true)) headerRows += 1;
  if (headerRows === 0) headerRows = 1;
  const width = Math.max(...cells.map((row) => row.length));
  const headings: string[] = [];
  for (let x = 0; x < width; x += 1) {
    const parts: string[] = [];
    for (let y = 0; y < headerRows; y += 1) {
      const text = cells[y]?.[x]?.text ?? "";
      if (text !== "" && parts[parts.length - 1] !== text) parts.push(text);
    }
    headings.push(parts.join(" ") || `Column ${x + 1}`);
  }
  const body = cells.slice(headerRows).filter((row) => row.some((cell) => cell !== undefined && cell.text !== "" && !cell.header) || row.some((cell) => cell?.header === true && cell.text !== "" && row.length === width));
  const texts = body.map((row) => headings.map((_, x) => row[x]?.text ?? ""));
  const used = new Map<string, number>();
  const columns = headings.map((heading, x): DataColumn => {
    const values = texts.map((row) => row[x]!);
    const filled = values.filter((value) => !EMPTY.has(value));
    const numeric = filled.length > 0 && filled.every((value) => numberIn(value) !== null);
    let key = columnKey(heading);
    const seen = used.get(key) ?? 0;
    used.set(key, seen + 1);
    if (seen > 0) key = `${key}${seen + 1}`;
    return { heading, key, type: numeric ? "number" : "string", nullable: filled.length < values.length };
  });
  const rows = texts.map((row) =>
    row.map((value, x) => (EMPTY.has(value) ? null : columns[x]!.type === "number" ? numberIn(value) : value)),
  );
  return { caption: table.caption, columns, rows };
}

/** The first line of every file this command writes; it names the source so a re-run knows the file. */
export function generatedHeader(url: string, index: number): string {
  return `// GENERATED by \`bun run data-table\` from ${url} (table ${index}). Re-run it with --refresh to update; do not edit.`;
}

/** The TypeScript file: a row interface, the headings as the page wrote them, and the rows. */
export function renderDataFile(options: { url: string; index: number; name: string; table: DataTable; fetched: string }): string {
  const { url, index, name, table, fetched } = options;
  const type = `${name[0]!.toUpperCase()}${name.slice(1)}Row`;
  const what = table.caption === "" ? `table ${index} of ${url}` : `"${table.caption}" (${url})`;
  const lines = [
    generatedHeader(url, index),
    `// Fetched ${fetched}. ${table.rows.length} rows.`,
    "",
    `/** One row of ${what}. */`,
    `export interface ${type} {`,
    ...table.columns.map((column) => `  /** ${column.heading} */\n  readonly ${column.key}: ${column.type}${column.nullable ? " | null" : ""};`),
    "}",
    "",
    `/** Each column's heading as the page writes it. */`,
    `export const ${name}Headings: Readonly<Record<keyof ${type}, string>> = {`,
    ...table.columns.map((column) => `  ${column.key}: ${JSON.stringify(column.heading)},`),
    "};",
    "",
    `/** Every row of ${what}, in page order. */`,
    `export const ${name}: readonly ${type}[] = [`,
    ...table.rows.map((row) => `  { ${table.columns.map((column, x) => `${column.key}: ${JSON.stringify(row[x])}`).join(", ")} },`),
    "];",
    "",
  ];
  return lines.join("\n");
}

/** The main checkout's page cache, shared by every worktree: `<main checkout>/.web-cache/`. */
function cacheDir(): string {
  const common = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: root, encoding: "utf8" });
  const main = common.status === 0 ? dirname(common.stdout.trim()) : root;
  return join(main, ".web-cache");
}

/** The page, from the cache when it was fetched before, else from the network (and then cached). */
export async function pageHtml(url: string, options: { refresh: boolean; cache?: string; fetchPage?: (url: string) => Promise<string>; log?: (line: string) => void }): Promise<string> {
  const log = options.log ?? (() => {});
  const cache = options.cache ?? cacheDir();
  const path = join(cache, `${createHash("sha256").update(url).digest("hex").slice(0, 24)}.html`);
  if (!options.refresh && existsSync(path)) {
    log(`read ${url} from the page cache`);
    return readFileSync(path, "utf8");
  }
  const fetchPage =
    options.fetchPage ??
    (async (target: string) => {
      const response = await fetch(target, { headers: { "user-agent": "jgengine-data-table (one fetch per page; cached)" } });
      if (!response.ok) throw new Error(`${target} answered ${response.status} ${response.statusText}`);
      return response.text();
    });
  const html = await fetchPage(url);
  mkdirSync(cache, { recursive: true });
  writeFileSync(path, html);
  log(`fetched ${url} (${Math.round(html.length / 1024)} KB) and cached it`);
  return html;
}

interface Args {
  url: string;
  out: string | null;
  table: number;
  list: boolean;
  refresh: boolean;
}

function parseArgs(argv: readonly string[]): Args | string {
  const args: Args = { url: "", out: null, table: 0, list: false, refresh: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--out") args.out = argv[(i += 1)] ?? null;
    else if (arg === "--table") args.table = Number(argv[(i += 1)]);
    else if (arg === "--list") args.list = true;
    else if (arg === "--refresh") args.refresh = true;
    else if (arg.startsWith("-")) return `unknown flag ${arg}`;
    else if (args.url === "") args.url = arg;
    else return `one url only; got a second: ${arg}`;
  }
  if (!/^https?:\/\//.test(args.url)) return "give the page's http(s) url";
  if (!Number.isInteger(args.table) || args.table < 0) return "--table takes a table number from --list";
  if (!args.list && (args.out === null || !args.out.endsWith(".ts"))) return "--out <file.ts> is required (or --list)";
  return args;
}

/** One line per table: its number, its size, and its first headings. */
export function listTables(tables: readonly RawTable[]): string[] {
  return tables.map((raw, index) => {
    const table = toDataTable(raw);
    const headings = table.columns.slice(0, 6).map((column) => column.heading).join(" | ");
    const more = table.columns.length > 6 ? ` | +${table.columns.length - 6} more` : "";
    return `${index}: ${table.rows.length} rows x ${table.columns.length} cols${table.caption === "" ? "" : ` "${table.caption}"`} - ${headings}${more}`;
  });
}

export async function main(argv: readonly string[]): Promise<number> {
  if (printHelpIfAsked("data-table", USAGE, argv)) return 0;
  const args = parseArgs(argv);
  if (typeof args === "string") {
    console.error(`data-table: ${args}`);
    return 1;
  }
  const out = args.out === null ? null : resolve(process.cwd(), args.out);
  if (out !== null && !args.refresh && existsSync(out) && readFileSync(out, "utf8").split("\n")[0] === generatedHeader(args.url, args.table)) {
    console.log(`data-table: ${relative(process.cwd(), out)} already holds table ${args.table} of ${args.url}; nothing fetched (--refresh to fetch again)`);
    return 0;
  }
  let html: string;
  try {
    html = await pageHtml(args.url, { refresh: args.refresh, log: (line) => console.log(`data-table: ${line}`) });
  } catch (error) {
    console.error(`data-table: ${String(error instanceof Error ? error.message : error)}`);
    return 1;
  }
  const tables = await readTables(html);
  if (args.list || out === null) {
    for (const line of listTables(tables)) console.log(line);
    return 0;
  }
  const raw = tables[args.table];
  if (raw === undefined) {
    console.error(`data-table: the page has ${tables.length} table(s); there is no table ${args.table}. These are:`);
    for (const line of listTables(tables)) console.error(line);
    return 1;
  }
  const table = toDataTable(raw);
  const name = exportName(basename(out, ".ts"));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, renderDataFile({ url: args.url, index: args.table, name, table, fetched: new Date().toISOString().slice(0, 10) }));
  console.log(`data-table: wrote ${relative(process.cwd(), out)}: ${table.rows.length} rows, ${table.columns.length} columns (${name}, ${name[0]!.toUpperCase()}${name.slice(1)}Row)`);
  return 0;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
