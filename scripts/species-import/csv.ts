/** Rows of a CSV file as records keyed by its header, quoted fields and doubled quotes handled. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = csvRows(text);
  const header = rows.shift() ?? [];
  return rows
    .filter((row) => row.length > 1 || (row[0] ?? "") !== "")
    .map((row) => Object.fromEntries(header.map((name, i) => [name, row[i] ?? ""])));
}

function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** A number from a CSV field, or undefined when empty or not numeric. */
export function csvNumber(field: string | undefined): number | undefined {
  if (field === undefined || field.trim() === "") return undefined;
  const value = Number(field);
  return Number.isFinite(value) ? value : undefined;
}
