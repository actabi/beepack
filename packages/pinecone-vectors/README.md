# pinecone-vectors

Zero-dependency wrapper for the **Pinecone** vector database API. Upsert, query, and delete vectors, plus manage indexes — all with native `fetch`.

## Environment Variables

| Variable | Description |
|---|---|
| `PINECONE_API_KEY` | Your Pinecone API key |
| `PINECONE_INDEX_HOST` | Your index host URL (e.g. `https://my-index-abc123.svc.us-east1-gcp.pinecone.io`) |

## Installation

```bash
bee add pinecone-vectors
```

## Usage

```js
import { upsert, query, deleteVectors, describeIndex, listIndexes } from 'pinecone-vectors';

// Upsert vectors
await upsert([
  { id: 'vec-1', values: [0.1, 0.2, 0.3], metadata: { label: 'hello' } },
  { id: 'vec-2', values: [0.4, 0.5, 0.6], metadata: { label: 'world' } },
]);

// Query for similar vectors
const results = await query({
  vector: [0.1, 0.2, 0.3],
  topK: 5,
  includeMetadata: true,
});

// Delete specific vectors
await deleteVectors({ ids: ['vec-1'] });

// Describe an index
const info = await describeIndex('my-index');

// List all indexes
const indexes = await listIndexes();
```

## API

### `upsert(vectors, opts?)` — Upsert vectors into the index.
### `query(params, opts?)` — Query for similar vectors by vector or ID.
### `deleteVectors(params, opts?)` — Delete vectors by IDs, filter, or delete all.
### `describeIndex(indexName, opts?)` — Get index configuration and status.
### `listIndexes(opts?)` — List all indexes in the project.

All functions return parsed JSON or `null` on failure. Pass `namespace` in opts for namespaced operations.

## License

MIT
