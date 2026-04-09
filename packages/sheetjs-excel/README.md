# Excel/CSV Parser

Zero-dependency CSV/TSV parser and generator. Parse to JSON, generate from objects, auto-detect delimiters.

## Prerequisites

- Node.js >= 18

## Usage

### Parse CSV

```js
import { parseCSV } from './index.js';
const data = parseCSV("name,age\nAlice,30\nBob,25");
// [{name: "Alice", age: "30"}, ...]
```

### Generate CSV

```js
import { toCSV } from './index.js';
const csv = toCSV([{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }]);
```

### Auto-detect Delimiter

```js
import { autoParse } from './index.js';
const data = autoParse(fileContent);
```

## Source

Inspired by [SheetJS](https://github.com/SheetJS/sheetjs) (36k+ stars).