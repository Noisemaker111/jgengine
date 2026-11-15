import { stripComments } from "./source";

/**
 * Read the object literal a `<feature>.engine.ts` file passes to `defineEngineProposal(...)` without
 * running the file: the metadata is plain data (strings, arrays, `as const`), so a literal parser
 * is enough, and a proposal never needs its game's dependencies installed to be listed or checked.
 */

/** The parsed metadata, or why it could not be read. */
export type LiteralResult = { ok: true; value: unknown } | { ok: false; error: string };

class LiteralError extends Error {}

/** The first `defineEngineProposal({...})` argument in `source`, parsed. */
export function readProposalLiteral(source: string): LiteralResult {
  const text = stripComments(source);
  const call = /\bdefineEngineProposal\s*(?:<[^>]*>)?\s*\(/.exec(text);
  if (call === null) return { ok: false, error: "no defineEngineProposal({...}) call: export `proposal = defineEngineProposal({...})` from @jgengine/core/meta/proposal" };
  try {
    const parser = new Parser(text, call.index + call[0].length);
    const value = parser.value();
    parser.skipSpace();
    if (text.startsWith("as const", parser.at)) {
      parser.at += "as const".length;
      parser.skipSpace();
    }
    if (text[parser.at] !== ")" && text[parser.at] !== ",") throw new LiteralError("defineEngineProposal takes one object literal");
    return { ok: true, value };
  } catch (error) {
    if (error instanceof LiteralError) return { ok: false, error: `the proposal metadata must be a plain literal: ${error.message}` };
    throw error;
  }
}

class Parser {
  constructor(readonly text: string, public at: number) {}

  skipSpace(): void {
    while (this.at < this.text.length && /\s/.test(this.text[this.at]!)) this.at += 1;
  }

  private fail(what: string): never {
    const line = this.text.slice(0, this.at).split("\n").length;
    throw new LiteralError(`${what} (line ${line})`);
  }

  value(): unknown {
    this.skipSpace();
    const ch = this.text[this.at];
    if (ch === "{") return this.object();
    if (ch === "[") return this.array();
    if (ch === "\"" || ch === "'" || ch === "`") return this.string();
    const word = /^(?:true|false|null|undefined|-?\d+(?:\.\d+)?)\b/.exec(this.text.slice(this.at, this.at + 32));
    if (word === null) this.fail(`unexpected ${JSON.stringify(this.text.slice(this.at, this.at + 16))}`);
    this.at += word[0].length;
    if (word[0] === "true") return true;
    if (word[0] === "false") return false;
    if (word[0] === "null") return null;
    if (word[0] === "undefined") return undefined;
    return Number(word[0]);
  }

  private string(): string {
    const quote = this.text[this.at]!;
    let out = "";
    this.at += 1;
    while (this.at < this.text.length && this.text[this.at] !== quote) {
      const ch = this.text[this.at]!;
      if (quote === "`" && ch === "$" && this.text[this.at + 1] === "{") this.fail("template strings cannot interpolate");
      if (ch === "\\") {
        const escaped = this.text[this.at + 1] ?? "";
        out += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped;
        this.at += 2;
        continue;
      }
      if (ch === "\n" && quote !== "`") this.fail("unterminated string");
      out += ch;
      this.at += 1;
    }
    if (this.at >= this.text.length) this.fail("unterminated string");
    this.at += 1;
    return out;
  }

  private array(): unknown[] {
    const items: unknown[] = [];
    this.at += 1;
    for (;;) {
      this.skipSpace();
      if (this.text[this.at] === "]") { this.at += 1; return items; }
      items.push(this.value());
      this.skipSpace();
      if (this.text[this.at] === ",") this.at += 1;
      else if (this.text[this.at] !== "]") this.fail("expected , or ]");
    }
  }

  private object(): Record<string, unknown> {
    const record: Record<string, unknown> = {};
    this.at += 1;
    for (;;) {
      this.skipSpace();
      if (this.text[this.at] === "}") { this.at += 1; return record; }
      const ch = this.text[this.at];
      let key: string;
      if (ch === "\"" || ch === "'") key = this.string();
      else {
        const name = /^[A-Za-z_$][\w$]*/.exec(this.text.slice(this.at, this.at + 64));
        if (name === null) this.fail("expected a property name");
        key = name[0];
        this.at += key.length;
      }
      this.skipSpace();
      if (this.text[this.at] !== ":") this.fail(`expected : after ${key} (shorthand and spread are not plain data)`);
      this.at += 1;
      record[key] = this.value();
      this.skipSpace();
      if (this.text[this.at] === ",") this.at += 1;
      else if (this.text[this.at] !== "}") this.fail("expected , or }");
    }
  }
}
