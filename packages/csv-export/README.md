# csv-export

Parse, generate, and validate CSV/TSV/Excel files in pure JavaScript. Zero dependencies — RFC 4180 compliant with auto-delimiter detection, streaming support, and schema validation.

## Setup

No environment variables required. Works in Node >= 18 with no additional dependencies.

## Usage

### `toCsv(rows, options?)`

Convert an array of objects or arrays to a CSV string.

```js
import { toCsv } from "./index.js";

// Object mode — keys become headers automatically
const csv = toCsv([
  { name: "Alice", age: 30, joined: new Date("2024-01-15") },
  { name: "Bob", age: 25, joined: new Date("2024-03-22") },
]);
// name,age,joined
// Alice,30,2024-01-15T00:00:00.000Z
// Bob,25,2024-03-22T00:00:00.000Z

// Array mode — rows are written verbatim, no header emitted
const csv2 = toCsv([
  ["name", "age"],
  ["Alice", 30],
]);

// Custom options
const csv3 = toCsv(rows, {
  headers: ["name", "age", "joined"], // explicit column order
  delimiter: ";",                      // change field separator
  lineEnding: "\n",                    // Unix line endings
  includeHeader: false,                // omit header row
  nullValue: "N/A",                    // replacement for null/undefined
  dateFormat: "locale",               // use toLocaleString() instead of ISO
});
```

### `toTsv(rows, options?)`

Convert rows to a tab-separated values string. Equivalent to `toCsv` with `delimiter: '\t'` — useful for spreadsheet paste targets and database exports.

```js
import { toTsv } from "./index.js";

const tsv = toTsv([
  { product: "Widget", price: 9.99 },
  { product: "Gadget", price: 24.99 },
]);
// product\tprice
// Widget\t9.99
// Gadget\t24.99
```

### `toExcelCsv(rows, options?)`

Convert rows to an Excel-compatible CSV string. Prepends a UTF-8 BOM so Excel auto-detects the encoding, and defaults to semicolons as the delimiter (standard in European Excel locales).

```js
import { toExcelCsv } from "./index.js";
import { writeFileSync } from "fs";

const excelCsv = toExcelCsv([
  { name: "Alice", department: "Engineering" },
  { name: "Bob", department: "Design" },
]);

writeFileSync("report.csv", excelCsv);
// Opens correctly in Excel with UTF-8 characters intact
```

> **Security note:** Fields beginning with `=` may execute as formulas in Excel. Sanitize `=`-prefixed values from untrusted user input before calling this function.

### `streamCsv(rows, options?)`

Synchronous generator that yields one CSV row string at a time. Use this for large datasets where holding the full CSV in memory is undesirable. Each yielded string has no trailing newline — write your preferred line ending per chunk.

```js
import { streamCsv } from "./index.js";
import { createWriteStream } from "fs";

const stream = createWriteStream("output.csv");

for (const row of streamCsv(largeDataset)) {
  stream.write(row + "\r\n");
}

stream.end();
```

### `detectDelimiter(sample)`

Heuristically detect the delimiter character used in a CSV string by examining the first 1024 characters. Returns the most frequent of `,`, `;`, `\t`, or `|`.

```js
import { detectDelimiter } from "./index.js";

detectDelimiter("name;age;city\nAlice;30;Paris"); // ";"
detectDelimiter("a,b,c\n1,2,3");                 // ","
detectDelimiter("col1\tcol2\tcol3\n");            // "\t"
```

### `fromCsv(csvString, options?)`

Parse a CSV string into an array of row objects (when a header row is present) or string arrays (when `hasHeader: false`). Auto-detects the delimiter if not specified. Returns `{ headers, rows }`.

```js
import { fromCsv } from "./index.js";

const input = `name,age,email
Alice,30,alice@example.com
Bob,25,bob@example.com`;

const { headers, rows } = fromCsv(input);
// headers: ["name", "age", "email"]
// rows: [
//   { name: "Alice", age: "30", email: "alice@example.com" },
//   { name: "Bob",   age: "25", email: "bob@example.com"  },
// ]

// Array mode (no header)
const { rows: arrays } = fromCsv(input, { hasHeader: false });
// rows: [["name","age","email"], ["Alice","30","alice@example.com"], ...]

// Custom options
const { headers: h, rows: r } = fromCsv(tsvString, {
  delimiter: "\t",        // override auto-detection
  skipEmptyLines: false,  // preserve blank lines
  trim: true,             // strip whitespace from unquoted fields
});
```

### `escapeCsvField(value, delimiter?, quote?)`

Escape a single CSV field value, quoting and doubling internal quote characters per RFC 4180. Useful when building CSV output manually row by row.

```js
import { escapeCsvField } from "./index.js";

escapeCsvField('hello, world');   // '"hello, world"'
escapeCsvField('say "hi"');       // '"say ""hi"""'
escapeCsvField("line1\nline2");   // '"line1\nline2"'
escapeCsvField(null);             // ""
escapeCsvField(new Date("2024-01-01")); // "2024-01-01T00:00:00.000Z"
```

### `validateRows(rows, schema)`

Validate an array of row objects against a column schema. Returns `{ valid, errors }` where `errors` is an array of `{ row, column, message }` objects. Supports `required`, `type` (`'string'`, `'number'`, `'date'`, `'email'`), and `maxLength` rules.

```js
import { fromCsv, validateRows } from "./index.js";

const { rows } = fromCsv(csvString);

const { valid, errors } = validateRows(rows, {
  name:  { required: true, type: "string", maxLength: 100 },
  age:   { required: true, type: "number" },
  email: { required: true, type: "email" },
  notes: { maxLength: 500 },
});

if (!valid) {
  for (const err of errors) {
    console.error(`Row ${err.row}, column "${err.column}": ${err.message}`);
  }
}
```

## Edge Cases Handled

- **RFC 4180 quoting** — fields containing the delimiter, quote character, CR, or LF are automatically quoted; internal quotes are doubled
- **Multiline fields** — quoted fields spanning multiple lines parse and round-trip correctly
- **CRLF and LF** — both Windows (`\r\n`) and Unix (`\n`) line endings are accepted on parse
- **BOM stripping** — UTF-8 BOM prepended by Excel is silently removed before parsing
- **Auto-delimiter detection** — `fromCsv` infers `,`, `;`, `\t`, or `|` from the first 1024 characters when no delimiter is specified
- **Date serialization** — `Date` objects are formatted as ISO 8601 strings by default; pass `dateFormat: 'locale'` for locale-aware formatting
- **null/undefined fields** — coerced to an empty string (or a custom `nullValue`) rather than the literal text `"null"`
- **Missing trailing newline** — files without a final newline are parsed correctly; the last field and row are always captured
- **Short rows on parse** — when a data row has fewer columns than the header, missing fields default to `""` rather than `undefined`
- **Empty input** — `toCsv`, `streamCsv`, and `fromCsv` return safe empty values (`""`, no yields, `{ headers: [], rows: [] }`) rather than throwing
