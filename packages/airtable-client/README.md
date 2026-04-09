# airtable-client

Zero-dependency wrapper for the **Airtable API**. Full CRUD operations on records — list, get, create, update, and delete — using native `fetch`.

## Environment Variables

| Variable | Description |
|---|---|
| `AIRTABLE_API_KEY` | Your Airtable personal access token |
| `AIRTABLE_BASE_ID` | The ID of the Airtable base to operate on |

## Installation

```bash
bee add airtable-client
```

## Usage

```js
import { listRecords, getRecord, createRecord, updateRecord, deleteRecord } from 'airtable-client';

// List records from a table
const records = await listRecords('Tasks', { maxRecords: '20', view: 'Grid view' });

// Get a specific record
const task = await getRecord('Tasks', 'rec1234567890');

// Create a new record
const created = await createRecord('Tasks', {
  Name: 'Ship feature',
  Status: 'In Progress',
});

// Update a record
const updated = await updateRecord('Tasks', 'rec1234567890', {
  Status: 'Done',
});

// Delete a record
const deleted = await deleteRecord('Tasks', 'rec1234567890');
```

## API

### `listRecords(tableName, query?, opts?)` — List records with optional filters.
### `getRecord(tableName, recordId, opts?)` — Get a single record by ID.
### `createRecord(tableName, fields, opts?)` — Create a new record.
### `updateRecord(tableName, recordId, fields, opts?)` — Partial update of a record.
### `deleteRecord(tableName, recordId, opts?)` — Delete a record.

All functions return the parsed JSON response or `null` on failure.

## License

MIT
