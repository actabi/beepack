// CSV Parser & Generator - Zero dependencies

/**
 * Parse CSV text into an array of objects.
 * @param {string} csv
 * @param {object} [opts]
 * @param {string} [opts.delimiter=","]
 * @param {boolean} [opts.headers=true]
 * @returns {Array<object>|Array<string[]>}
 */
export function parseCSV(csv, opts = {}) {
  const { delimiter = ",", headers = true, trim = true } = opts;
  let current = "";
  let inQuotes = false;
  const rows = [];
  let row = [];
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (inQuotes) {
      if (ch === '"' && csv[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === delimiter) { row.push(trim ? current.trim() : current); current = ""; }
      else if (ch === "\n" || (ch === "\r" && csv[i + 1] === "\n")) {
        row.push(trim ? current.trim() : current); current = "";
        if (row.some(c => c !== "")) rows.push(row); row = [];
        if (ch === "\r") i++;
      } else { current += ch; }
    }
  }
  if (current || row.length) { row.push(trim ? current.trim() : current); if (row.some(c => c !== "")) rows.push(row); }
  if (!headers) return rows;
  const headerRow = rows[0] || [];
  return rows.slice(1).map(r => {
    const obj = {};
    headerRow.forEach((h, i) => { obj[h] = r[i] ?? ""; });
    return obj;
  });
}

/**
 * Generate CSV from array of objects.
 * @param {Array<object>} data
 * @param {object} [opts]
 * @param {string[]} [opts.columns]
 * @param {string} [opts.delimiter=","]
 * @returns {string}
 */
export function toCSV(data, opts = {}) {
  const { delimiter = "," } = opts;
  if (!data.length) return "";
  const columns = opts.columns || [...new Set(data.flatMap(Object.keys))];
  function esc(val) {
    const str = val == null ? "" : String(val);
    return (str.includes(delimiter) || str.includes('"') || str.includes("\n"))
      ? '"' + str.replace(/"/g, '""') + '"' : str;
  }
  const lines = [columns.map(esc).join(delimiter)];
  for (const row of data) lines.push(columns.map(c => esc(row[c])).join(delimiter));
  return lines.join("\n");
}

/**
 * Parse TSV.
 * @param {string} tsv
 * @param {boolean} [headers=true]
 */
export function parseTSV(tsv, headers = true) {
  return parseCSV(tsv, { delimiter: "\t", headers });
}

/**
 * Auto-detect delimiter and parse.
 * @param {string} text
 * @returns {Array<object>}
 */
export function autoParse(text) {
  const firstLine = text.split("\n")[0] || "";
  const tabs = (firstLine.match(/\t/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  const semis = (firstLine.match(/;/g) || []).length;
  const delimiter = tabs > commas && tabs > semis ? "\t" : semis > commas ? ";" : ",";
  return parseCSV(text, { delimiter });
}