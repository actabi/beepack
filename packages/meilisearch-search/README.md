# meilisearch-search

Zero-dependency wrapper for the [Meilisearch](https://github.com/meilisearch/meilisearch-js) search engine API. Provides full-text search, document management, and index operations using native `fetch`.

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `MEILISEARCH_HOST` | Base URL of your Meilisearch instance (e.g. `http://localhost:7700`) | Yes |
| `MEILISEARCH_API_KEY` | API key for authentication | Yes |

## Exported Functions

### `search(indexUid, query, options?)`

Search an index for documents matching a query string.

```js
import { search } from './index.js';
const results = await search('movies', 'batman', { limit: 10 });
// { hits: [...], estimatedTotalHits: 42, query: 'batman' }
```

### `addDocuments(indexUid, documents, primaryKey?)`

Add or update documents in an index. Returns an enqueued task.

```js
import { addDocuments } from './index.js';
await addDocuments('movies', [
  { id: 1, title: 'Batman Begins', year: 2005 },
  { id: 2, title: 'The Dark Knight', year: 2008 },
], 'id');
```

### `deleteDocuments(indexUid, documentIds)`

Delete documents by their IDs.

```js
import { deleteDocuments } from './index.js';
await deleteDocuments('movies', [1, 2]);
```

### `createIndex(uid, primaryKey?)`

Create a new search index.

```js
import { createIndex } from './index.js';
await createIndex('movies', 'id');
```

### `getIndex(uid)`

Retrieve information about an existing index.

```js
import { getIndex } from './index.js';
const info = await getIndex('movies');
// { uid: 'movies', primaryKey: 'id', createdAt: '...', updatedAt: '...' }
```

## Notes

- All functions use `AbortSignal.timeout(15000)` (15 s).
- Returns `null` on network failures; throws on invalid arguments.
- Meilisearch write operations are asynchronous — they return a task object you can poll.
