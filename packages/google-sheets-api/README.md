# Google Sheets API

Zero-dependency Google Sheets API v4 client. Read, write, append, and create spreadsheets.

## Prerequisites

- Node.js >= 18
- Google Cloud service account with Sheets API enabled

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | JSON string of service account key |

## Usage

### Read a Range

```js
import { getAccessToken, readRange } from './index.js';
const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
const token = await getAccessToken(key);
const data = await readRange(token, "spreadsheet-id", "Sheet1!A1:D10");
```

### Write Cells

```js
import { writeRange } from './index.js';
await writeRange(token, "spreadsheet-id", "Sheet1!A1:B2", [["Name", "Age"], ["Alice", "30"]]);
```

### Append Rows

```js
import { appendRows } from './index.js';
await appendRows(token, "spreadsheet-id", "Sheet1!A:B", [["Bob", "25"], ["Charlie", "35"]]);
```

## Source

Based on [googleapis/google-api-nodejs-client](https://github.com/googleapis/google-api-nodejs-client) by **Google APIs** — 12,123+ stars on GitHub.