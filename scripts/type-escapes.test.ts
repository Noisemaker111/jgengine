import { describe, expect, test } from "bun:test";

import { areaOf, compareToBaseline, countByFile, findEscapes, serializeBaseline } from "./type-escapes";

const kinds = (source: string, file = "a.ts") => findEscapes(file, source).map((escape) => escape.kind);

describe("findEscapes", () => {
  test("finds any, non-null, casts and ignore comments, and skips as const", () => {
    const source = [
      "const a: any = 1;",
      "const b = list[0]!;",
      "const c = value as string;",
      "const d = [1, 2] as const;",
      "// @ts-expect-error broken on purpose",
      "const e = <number>value;",
    ].join("\n");
    expect(kinds(source)).toEqual(["any", "nonNull", "cast", "ignore", "cast"]);
  });

  test("an escape documented with type-escape on its line or the line above is not counted", () => {
    const source = [
      "// type-escape: fromEntries loses key types",
      "const a = Object.fromEntries(rows) as Shape;",
      "const b = raw as Shape; // type-escape: decoded and validated above",
      "const c = raw as Shape;",
    ].join("\n");
    expect(findEscapes("a.ts", source).map((escape) => escape.line)).toEqual([4]);
  });

  test("a type-escape comment with no reason does not excuse the escape", () => {
    expect(kinds("// type-escape:\nconst a = raw as Shape;")).toEqual(["cast"]);
  });

  test("a comment that only mentions a directive is not one", () => {
    expect(kinds("/**\n * never use @ts-ignore here\n */\nconst a = 1;")).toEqual([]);
    expect(kinds("/* @ts-ignore */ const a: number = 'x';")).toEqual(["ignore"]);
  });

  test("parses tsx", () => {
    expect(kinds("const a = <div>{value!}</div>;", "a.tsx")).toEqual(["nonNull"]);
  });
});

describe("baseline", () => {
  const live = countByFile(new Map([["packages/core/src/a.ts", findEscapes("a.ts", "const a = b!;\nconst c = d as E;")]]));

  test("counts per file and kind", () => {
    expect(live).toEqual({ "packages/core/src/a.ts": { nonNull: 1, cast: 1 } });
  });

  test("a new escape, in a known or a new file, grows past the baseline", () => {
    const verdict = compareToBaseline({ ...live, "games/x/src/b.ts": { any: 1 } }, { "packages/core/src/a.ts": { nonNull: 1 } });
    expect(verdict.grown).toEqual([
      { path: "games/x/src/b.ts", kind: "any", live: 1, allowed: 0 },
      { path: "packages/core/src/a.ts", kind: "cast", live: 1, allowed: 0 },
    ]);
  });

  test("a removed escape leaves the baseline to shrink", () => {
    const verdict = compareToBaseline(live, { "packages/core/src/a.ts": { nonNull: 2, cast: 1 } });
    expect(verdict.grown).toEqual([]);
    expect(verdict.shrunk).toEqual([{ path: "packages/core/src/a.ts", kind: "nonNull", live: 1, allowed: 2 }]);
  });

  test("serializes one file per line and round-trips through JSON", () => {
    const text = serializeBaseline(live);
    expect(text.split("\n")[1]).toBe('  "packages/core/src/a.ts": {"nonNull":1,"cast":1}');
    expect(JSON.parse(text)).toEqual(live);
  });

  test("areas", () => {
    expect(areaOf("packages/core/src/a.ts")).toBe("packages/core");
    expect(areaOf("games/fernwild/src/main.ts")).toBe("games/fernwild");
    expect(areaOf("scripts/gen.ts")).toBe("scripts");
  });
});
