// The file behind the Custom thresholds section's Export CSV / Import CSV
// buttons: one row per threshold, with the columns below. Colours aren't
// saved. The checks on what a row holds are in NoiseImpactParamsPanel.tsx,
// next to the ones for the add form.
export const CSV_COLUMNS = ["name", "metric", "threshold_db"] as const;

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// Starts with a byte order mark, so Excel reads accents in names correctly.
export function thresholdsToCsv(
  thresholds: { name: string; metric: string; threshold_db: number }[]
): string {
  const rows = thresholds.map((t) =>
    [t.name, t.metric, String(t.threshold_db)].map(csvCell).join(",")
  );
  return `﻿${[CSV_COLUMNS.join(","), ...rows].join("\r\n")}\r\n`;
}

// Excel's plain "CSV" option doesn't save UTF-8, so bytes that aren't valid
// UTF-8 are read as Windows-1252, which it uses in North America and western
// Europe.
export function decodeCsvBytes(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

// The file's rows as lists of cells; blank rows stay, so a row's position is
// its row number in Excel. Excel set to some languages, such as French, puts
// ";" between columns, so a heading row with ";" and no "," means that.
export function parseCsv(text: string): string[][] {
  const normalised = text.replace(/\r\n?/g, "\n");
  const firstLine = normalised.split("\n", 1)[0];
  const separator = firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < normalised.length; i++) {
    const c = normalised[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (normalised[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (c === '"' && cell === "") {
      quoted = true;
    } else if (c === separator) {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
