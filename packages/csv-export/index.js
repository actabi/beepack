// CSV / Excel Export & Import
// Zero dependencies — pure JavaScript, Node >= 18.
// Handles RFC 4180 CSV with extensions: quoted multiline fields, TSV, BOM for Excel,
// auto-delimiter detection, schema validation, and sync generator streaming.

const TIMEOUT_MS = 15000; // retained for API consistency

// ---------------------------------------------------------------------------
// Field escaping
// ---------------------------------------------------------------------------

/**
 * Escape a single CSV field value, wrapping in quotes when necessary.
 * Quotes are doubled per RFC 4180. A field is quoted when it contains
 * the delimiter, the quote character, a newline, or a carriage return.
 *
 * @param {*} value - Raw field value (will be coerced to string)
 * @param {string} [delimiter=','] - Column delimiter character
 * @param {string} [quote='"'] - Quote character
 * @returns {string} Properly escaped CSV field (may or may not be quoted)
 */
export function escapeCsvField(value, delimiter = ",", quote = '"') {
  if (value === null || value === undefined) return "";

  let str;
  if (value instanceof Date) {
    str = value.toISOString();
  } else {
    str = String(value);
  }

  // Must quote if the field contains delimiter, quote, CR, or LF
  const needsQuote =
    str.includes(delimiter) ||
    str.includes(quote) ||
    str.includes("\n") ||
    str.includes("\r");

  if (needsQuote) {
    // Double any internal quote characters
    return quote + str.split(quote).join(quote + quote) + quote;
  }
  return str;
}

// ---------------------------------------------------------------------------
// CSV / TSV generation
// ---------------------------------------------------------------------------

/**
 * Convert an array of objects or arrays to a CSV string.
 * Handles Date objects, null/undefined values, and all RFC 4180 edge cases.
 *
 * @param {Array<object|Array>} rows - Data to serialize. Objects use keys as columns;
 *   arrays are written verbatim (one sub-array = one row).
 * @param {object} [options={}]
 * @param {string[]} [options.headers] - Column names. Defaults to Object.keys of the
 *   first row (object mode). Ignored in array mode.
 * @param {string} [options.delimiter=','] - Field separator character
 * @param {string} [options.lineEnding='\r\n'] - Line ending sequence
 * @param {string} [options.quote='"'] - Quote character for escaping
 * @param {boolean} [options.includeHeader=true] - Whether to write a header row
 * @param {string} [options.nullValue=''] - Replacement string for null/undefined
 * @param {string} [options.dateFormat='ISO'] - Date formatting: 'ISO' | 'locale'
 * @returns {string} Complete CSV document as a string
 */
export function toCsv(rows, options = {}) {
  if (!Array.isArray(rows)) {
    console.error("[csv-export] toCsv: rows must be an array");
    return "";
  }
  if (rows.length === 0) return "";

  const {
    delimiter = ",",
    lineEnding = "\r\n",
    quote = '"',
    includeHeader = true,
    nullValue = "",
    dateFormat = "ISO",
  } = options;

  const isArrayMode = Array.isArray(rows[0]);
  const headers = isArrayMode
    ? null
    : options.headers || Object.keys(rows[0]);

  const output = [];

  // Header row
  if (!isArrayMode && includeHeader && headers) {
    output.push(headers.map((h) => escapeCsvField(h, delimiter, quote)).join(delimiter));
  }

  // Data rows
  for (const row of rows) {
    if (isArrayMode) {
      output.push(
        row.map((v) => {
          const val = v === null || v === undefined ? nullValue : v;
          return escapeCsvField(
            val instanceof Date
              ? dateFormat === "ISO"
                ? val.toISOString()
                : val.toLocaleString()
              : val,
            delimiter,
            quote
          );
        }).join(delimiter)
      );
    } else {
      output.push(
        headers.map((key) => {
          let val = row[key];
          if (val === null || val === undefined) return escapeCsvField(nullValue, delimiter, quote);
          if (val instanceof Date) {
            val = dateFormat === "ISO" ? val.toISOString() : val.toLocaleString();
          }
          return escapeCsvField(val, delimiter, quote);
        }).join(delimiter)
      );
    }
  }

  return output.join(lineEnding);
}

/**
 * Convert an array of objects or arrays to a TSV (tab-separated values) string.
 * Equivalent to toCsv with delimiter='\t'. TSV is commonly used for spreadsheet
 * paste targets and some database export formats.
 *
 * @param {Array<object|Array>} rows - Data to serialize
 * @param {object} [options={}] - Same as toCsv options; delimiter is forced to '\t'
 * @returns {string} TSV document as a string
 */
export function toTsv(rows, options = {}) {
  return toCsv(rows, { ...options, delimiter: "\t" });
}

/**
 * Convert rows to an Excel-compatible CSV string.
 * Adds a UTF-8 BOM (byte order mark) so Excel correctly detects the encoding,
 * uses semicolons as the default delimiter (standard in European Excel locales),
 * and enforces CRLF line endings.
 *
 * Note: Fields beginning with = may execute as formulas in Excel. If your data
 * originates from untrusted user input, consider sanitizing = prefixes before export.
 *
 * @param {Array<object|Array>} rows - Data to serialize
 * @param {object} [options={}] - Same as toCsv options; delimiter defaults to ';'
 * @returns {string} BOM-prefixed Excel-compatible CSV string
 */
export function toExcelCsv(rows, options = {}) {
  const csv = toCsv(rows, {
    delimiter: ";",
    lineEnding: "\r\n",
    ...options,
  });
  // Prepend UTF-8 BOM (U+FEFF) — Excel uses this to auto-detect UTF-8 encoding
  return "\uFEFF" + csv;
}

// ---------------------------------------------------------------------------
// Streaming generator
// ---------------------------------------------------------------------------

/**
 * Synchronous generator that yields CSV rows one string at a time.
 * Ideal for large datasets where holding the full CSV in memory is undesirable.
 * Each yielded string is one complete row (header or data) WITHOUT a trailing newline —
 * the caller should join with their preferred line ending or write each chunk separately.
 *
 * @generator
 * @param {Array<object|Array>} rows - Data to stream
 * @param {object} [options={}] - Same as toCsv options
 * @yields {string} One CSV row string per iteration
 *
 * @example
 * const stream = fs.createWriteStream('output.csv');
 * for (const row of streamCsv(largeDataset)) {
 *   stream.write(row + '\r\n');
 * }
 */
export function* streamCsv(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return;

  const {
    delimiter = ",",
    quote = '"',
    includeHeader = true,
    nullValue = "",
    dateFormat = "ISO",
  } = options;

  const isArrayMode = Array.isArray(rows[0]);
  const headers = isArrayMode ? null : (options.headers || Object.keys(rows[0]));

  if (!isArrayMode && includeHeader && headers) {
    yield headers.map((h) => escapeCsvField(h, delimiter, quote)).join(delimiter);
  }

  for (const row of rows) {
    if (isArrayMode) {
      yield row.map((v) => {
        const val = v === null || v === undefined ? nullValue : v;
        return escapeCsvField(
          val instanceof Date
            ? dateFormat === "ISO" ? val.toISOString() : val.toLocaleString()
            : val,
          delimiter,
          quote
        );
      }).join(delimiter);
    } else {
      yield headers.map((key) => {
        let val = row[key];
        if (val === null || val === undefined) return escapeCsvField(nullValue, delimiter, quote);
        if (val instanceof Date) {
          val = dateFormat === "ISO" ? val.toISOString() : val.toLocaleString();
        }
        return escapeCsvField(val, delimiter, quote);
      }).join(delimiter);
    }
  }
}

// ---------------------------------------------------------------------------
// Delimiter detection
// ---------------------------------------------------------------------------

/**
 * Heuristically detect the delimiter character used in a CSV string.
 * Examines the first 1024 characters of the input and counts occurrences
 * of the four most common delimiters: comma, semicolon, tab, and pipe.
 * Returns the one appearing most frequently.
 *
 * @param {string} sample - A sample of the CSV text to analyze
 * @returns {string} The detected delimiter character: ',' | ';' | '\t' | '|'
 */
export function detectDelimiter(sample) {
  if (typeof sample !== "string" || sample.length === 0) return ",";

  const slice = sample.slice(0, 1024);
  const candidates = [",", ";", "\t", "|"];

  let best = ",";
  let bestCount = -1;

  for (const delim of candidates) {
    // Split on the delimiter to count occurrences (occurrences = parts - 1)
    const count = slice.split(delim).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = delim;
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

/**
 * Parse a CSV string into an array of objects or arrays.
 * Handles RFC 4180 edge cases: quoted fields spanning multiple lines,
 * doubled quote characters, Windows CRLF and Unix LF line endings,
 * empty last fields, and auto-delimiter detection.
 *
 * @param {string} csvString - Complete CSV document as a string
 * @param {object} [options={}]
 * @param {boolean} [options.hasHeader=true] - If true, first row is treated as column headers
 *   and rows are returned as objects; otherwise rows are returned as string arrays
 * @param {string} [options.delimiter] - Column delimiter; auto-detected if omitted
 * @param {string} [options.quote='"'] - Quote character
 * @param {boolean} [options.skipEmptyLines=true] - Skip blank lines in the input
 * @param {boolean} [options.trim=false] - Trim whitespace from unquoted field values
 * @returns {{headers: string[], rows: Array<object|string[]>}}
 *   headers: column names (empty array when hasHeader=false)
 *   rows: parsed data rows
 */
export function fromCsv(csvString, options = {}) {
  if (typeof csvString !== "string") {
    console.error("[csv-export] fromCsv: input must be a string");
    return { headers: [], rows: [] };
  }

  const {
    hasHeader = true,
    quote = '"',
    skipEmptyLines = true,
    trim = false,
  } = options;

  // Strip BOM if present
  const input = csvString.startsWith("\uFEFF") ? csvString.slice(1) : csvString;
  const delimiter = options.delimiter || detectDelimiter(input);

  // Tokenize the CSV respecting quoted multiline fields
  const rawRows = parseRawRows(input, delimiter, quote);

  // Filter empty lines (a row whose every field is empty)
  const filteredRows = skipEmptyLines
    ? rawRows.filter((r) => r.some((f) => f.length > 0))
    : rawRows;

  if (filteredRows.length === 0) return { headers: [], rows: [] };

  // Optionally trim unquoted values — trim was already applied during parse for unquoted fields
  const applyTrim = (row) => (trim ? row.map((f) => f.trim()) : row);

  if (!hasHeader) {
    return { headers: [], rows: filteredRows.map(applyTrim) };
  }

  const headers = applyTrim(filteredRows[0]);
  const rows = filteredRows.slice(1).map((rawRow) => {
    const trimmed = applyTrim(rawRow);
    const obj = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = trimmed[i] !== undefined ? trimmed[i] : "";
    }
    return obj;
  });

  return { headers, rows };
}

/**
 * Internal RFC 4180 tokenizer. Parses a full CSV string into a 2D array of
 * raw string fields, correctly handling quoted multiline fields and doubled quotes.
 *
 * @param {string} input - Raw CSV text (BOM already stripped)
 * @param {string} delimiter - Delimiter character
 * @param {string} quote - Quote character
 * @returns {string[][]} 2D array: outer = rows, inner = fields
 */
function parseRawRows(input, delimiter, quote) {
  const rows = [];
  let currentRow = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === quote) {
        // Peek ahead — doubled quote = literal quote char
        if (input[i + 1] === quote) {
          field += quote;
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === quote) {
        inQuotes = true;
        i++;
      } else if (ch === delimiter) {
        currentRow.push(field);
        field = "";
        i++;
      } else if (ch === "\r" && input[i + 1] === "\n") {
        // Windows CRLF
        currentRow.push(field);
        field = "";
        rows.push(currentRow);
        currentRow = [];
        i += 2;
      } else if (ch === "\n") {
        // Unix LF
        currentRow.push(field);
        field = "";
        rows.push(currentRow);
        currentRow = [];
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  // Push final field and row (no trailing newline required)
  currentRow.push(field);
  if (currentRow.some((f) => f.length > 0) || currentRow.length > 1) {
    rows.push(currentRow);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate an array of row objects against a schema definition.
 * Returns a validity flag and a detailed list of per-cell errors.
 *
 * Supported type checks:
 * - 'string': any non-empty string (after coercion)
 * - 'number': parseable as a finite number
 * - 'date': parseable by Date constructor (non-NaN)
 * - 'email': contains @ and a dot after it (basic RFC 5322 subset)
 *
 * @param {Array<object>} rows - Array of row objects (typically from fromCsv)
 * @param {Record<string, {required?: boolean, type?: 'string'|'number'|'date'|'email', maxLength?: number}>} schema
 *   Column-keyed validation rules
 * @returns {{valid: boolean, errors: Array<{row: number, column: string, message: string}>}}
 *   valid: true only when errors array is empty
 */
export function validateRows(rows, schema) {
  if (!Array.isArray(rows)) {
    console.error("[csv-export] validateRows: rows must be an array");
    return { valid: false, errors: [{ row: -1, column: "*", message: "rows must be an array" }] };
  }
  if (!schema || typeof schema !== "object") {
    console.error("[csv-export] validateRows: schema must be an object");
    return { valid: false, errors: [{ row: -1, column: "*", message: "schema must be an object" }] };
  }

  const errors = [];

  rows.forEach((row, rowIdx) => {
    for (const [col, rules] of Object.entries(schema)) {
      const rawValue = row[col];
      const isEmpty = rawValue === null || rawValue === undefined || String(rawValue).trim() === "";

      // Required check
      if (rules.required && isEmpty) {
        errors.push({ row: rowIdx, column: col, message: `Required field '${col}' is empty` });
        continue; // no further checks if empty and required
      }

      // Skip remaining checks for empty optional fields
      if (isEmpty) continue;

      const strVal = String(rawValue).trim();

      // Type check
      if (rules.type) {
        switch (rules.type) {
          case "number":
            if (!isFinite(Number(strVal))) {
              errors.push({ row: rowIdx, column: col, message: `'${col}' must be a number (got "${strVal}")` });
            }
            break;
          case "date":
            if (isNaN(new Date(strVal).getTime())) {
              errors.push({ row: rowIdx, column: col, message: `'${col}' must be a valid date (got "${strVal}")` });
            }
            break;
          case "email": {
            const atIdx = strVal.indexOf("@");
            const dotAfterAt = atIdx > 0 && strVal.slice(atIdx).includes(".");
            if (atIdx < 1 || !dotAfterAt) {
              errors.push({ row: rowIdx, column: col, message: `'${col}' must be a valid email address (got "${strVal}")` });
            }
            break;
          }
          case "string":
            // Any non-empty string passes
            break;
          default:
            // Unknown type — skip
            break;
        }
      }

      // Max length check
      if (rules.maxLength != null && strVal.length > rules.maxLength) {
        errors.push({
          row: rowIdx,
          column: col,
          message: `'${col}' exceeds max length ${rules.maxLength} (got ${strVal.length} chars)`,
        });
      }
    }
  });

  return { valid: errors.length === 0, errors };
}
