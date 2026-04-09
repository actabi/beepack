# typesense-search

Zero-dependency wrapper for the [Typesense](https://github.com/typesense/typesense-js) search engine REST API. Search, index, and manage collections with native `fetch` — no SDK required.

## Installation

```bash
bee install typesense-search
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `TYPESENSE_HOST` | Typesense server host (e.g. `xyz.a1.typesense.net`) | Yes |
| `TYPESENSE_API_KEY` | Typesense API key | Yes |

## Usage

### Search a Collection

```js
import { search } from 'typesense-search';

const results = await search('products', 'wireless headphones', {
  query_by: 'name,description',
  filter_by: 'price:<100',
  sort_by: 'rating:desc',
  per_page: 20,
});

console.log(`Found ${results.found} results`);
results.hits.forEach(hit => console.log(hit.document.name));
```

### Create a Collection

```js
import { createCollection } from 'typesense-search';

await createCollection({
  name: 'products',
  fields: [
    { name: 'name', type: 'string' },
    { name: 'description', type: 'string' },
    { name: 'price', type: 'float' },
    { name: 'rating', type: 'float' },
  ],
  default_sorting_field: 'rating',
});
```

### Index Documents

```js
import { indexDocument, indexDocuments } from 'typesense-search';

// Single document
await indexDocument('products', { id: '1', name: 'Headphones', price: 49.99 });

// Bulk import
await indexDocuments('products', [
  { id: '2', name: 'Keyboard', price: 79.99 },
  { id: '3', name: 'Mouse', price: 29.99 },
], { action: 'upsert' });
```

### Delete and Inspect

```js
import { deleteDocument, getCollection } from 'typesense-search';

await deleteDocument('products', '1');
const info = await getCollection('products');
console.log(`Collection has ${info.num_documents} documents`);
```

## API Reference

### `search(collection, query, params?, opts?)`
Full-text search. Params: `query_by`, `filter_by`, `sort_by`, `page`, `per_page`, `facet_by`.

### `createCollection(schema, opts?)`
Create a collection with a schema defining `name`, `fields`, and optional `default_sorting_field`.

### `indexDocument(collection, document, options?, opts?)`
Index a single document. Options: `action` (`create`, `update`, `upsert`).

### `indexDocuments(collection, documents, options?, opts?)`
Bulk import via JSONL. Options: `action`, `batch_size`.

### `deleteDocument(collection, documentId, opts?)`
Delete a document by ID.

### `getCollection(collection, opts?)`
Get collection metadata and stats.

## Error Handling

All functions return `null` on failure and log errors to `console.error`. Fetch calls use a 15-second timeout via `AbortSignal.timeout(15000)`.
