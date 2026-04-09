# algolia-search

Algolia Search client covering index settings management (searchable attributes, facets, ranking), record sync (save/batch/delete), full-text search with filters and facets, facet value search, and query suggestions. Zero dependencies — native fetch only.

## Setup

```bash
ALGOLIA_APP_ID=ABCD1234EF       # Found in Algolia Dashboard → Settings → API Keys
ALGOLIA_API_KEY=your-admin-key  # Use Admin Key for writes, Search-Only Key for reads
```

The REST API base is `https://{appId}-dsn.algolia.net/1/indexes/{indexName}`. Authentication uses `X-Algolia-Application-Id` and `X-Algolia-API-Key` headers.

## Usage

### Index Settings — Get & Update

```js
import { getIndexSettings, updateIndexSettings } from "./index.js";

const { appId, apiKey } = {
  appId: process.env.ALGOLIA_APP_ID,
  apiKey: process.env.ALGOLIA_API_KEY,
};

// Retrieve all current settings
const settings = await getIndexSettings(appId, apiKey, "products");
// { searchableAttributes: [...], attributesForFaceting: [...], ranking: [...], ... }

// Update arbitrary settings in one call
await updateIndexSettings(appId, apiKey, "products", {
  hitsPerPage: 24,
  attributesToRetrieve: ["name", "price", "image"],
  typoTolerance: "min",
});
```

### Configure Searchable Attributes

```js
import { setSearchableAttributes } from "./index.js";

await setSearchableAttributes(appId, apiKey, "products", [
  "name",           // highest priority
  "brand",
  "description",    // lowest priority
]);
```

### Configure Facets

```js
import { setAttributesForFaceting } from "./index.js";

await setAttributesForFaceting(appId, apiKey, "products", [
  "brand",
  "category",
  "filterOnly(inStock)",       // filter without facet counts
  "searchable(color)",         // enable facet value search
]);
```

### Configure Ranking

```js
import { setRanking } from "./index.js";

await setRanking(
  appId,
  apiKey,
  "products",
  ["typo", "geo", "words", "filters", "proximity", "attribute", "exact", "custom"],
  ["desc(popularity)", "asc(price)"] // custom ranking criteria
);
```

### Save a Single Record

```js
import { saveRecord } from "./index.js";

// Upsert by objectID
const result = await saveRecord(appId, apiKey, "products", {
  objectID: "sku-001",
  name: "Wireless Headphones",
  brand: "SoundCo",
  price: 79.99,
  category: "electronics",
  inStock: true,
});
// { objectID: "sku-001", taskID: 123456789, updatedAt: "2026-04-08T..." }
```

### Partial Update a Record

```js
import { partialUpdateRecord } from "./index.js";

// Only update the price and stock status — all other attributes unchanged
await partialUpdateRecord(appId, apiKey, "products", "sku-001", {
  price: 69.99,
  inStock: false,
});
```

### Batch Sync Records

```js
import { batchRecords } from "./index.js";

const results = await batchRecords(appId, apiKey, "products", [
  { action: "updateObject", body: { objectID: "sku-001", price: 69.99 } },
  { action: "addObject",    body: { objectID: "sku-002", name: "Earbuds", price: 29.99 } },
  { action: "deleteObject", body: { objectID: "sku-obsolete" } },
]);
// Arrays > 1 000 records are automatically split into sequential batches
```

### Delete a Record

```js
import { deleteRecord } from "./index.js";

await deleteRecord(appId, apiKey, "products", "sku-001");
// { deletedAt: "2026-04-08T...", taskID: 987654321 }
```

### Delete Records by Filter

```js
import { deleteRecordsByFilter } from "./index.js";

// Remove all out-of-stock items in the clearance category
await deleteRecordsByFilter(appId, apiKey, "products", "category:clearance AND inStock:false");
// Requires those attributes to be in attributesForFaceting
```

### Search with Filters and Facets

```js
import { search } from "./index.js";

const results = await search(appId, apiKey, "products", "wireless headphones", {
  filters: "inStock:true AND price < 100",
  facets: ["brand", "category"],
  facetFilters: [["brand:SoundCo", "brand:AudioMax"]], // OR within array, AND between arrays
  page: 0,
  hitsPerPage: 24,
  attributesToRetrieve: ["objectID", "name", "price", "image"],
  userToken: "user-abc123",
});

// results.hits       → array of matching records
// results.nbHits     → total result count
// results.nbPages    → total pages available
// results.facets     → { brand: { SoundCo: 42, AudioMax: 17 }, category: { ... } }
```

### Federated (Multi-Index) Search

```js
import { multiSearch } from "./index.js";

const [productResults, articleResults] = await multiSearch(appId, apiKey, [
  { indexName: "products", query: "bluetooth speaker" },
  { indexName: "articles", query: "bluetooth speaker", params: { hitsPerPage: 3 } },
]);
```

### Query Suggestions

```js
import { getQuerySuggestions } from "./index.js";

// Requires a Query Suggestions index configured in the Algolia dashboard
const suggestions = await getQuerySuggestions(
  appId,
  apiKey,
  "products_query_suggestions",
  "wire",
  5
);
// [{ query: "wireless headphones", count: 1842 }, { query: "wire cutters", count: 203 }, ...]
```

### Search Within Facet Values

```js
import { searchFacetValues } from "./index.js";

// Find brand names matching "sou" (for autocomplete in facet UI)
const facetValues = await searchFacetValues(
  appId,
  apiKey,
  "products",
  "brand",
  "sou",
  { maxFacetHits: 10, filters: "category:electronics" }
);
// [{ value: "SoundCo", count: 42 }, { value: "SoundBlast", count: 17 }]
```

## Edge Cases Handled

- **Batch splitting** — `batchRecords` automatically splits arrays larger than 1 000 records into sequential API calls (Algolia's recommended limit)
- **Facet value search limit** — `searchFacetValues` caps `maxFacetHits` at 100 (Algolia's maximum)
- **Upsert vs. create** — `saveRecord` uses `PUT` when `objectID` is present, `POST` otherwise
- **Partial updates** — `partialUpdateRecord` merges attributes rather than replacing the full record; set `createIfNotExists: false` to skip creation
- **Query Suggestions** — `getQuerySuggestions` disables analytics tracking for suggestion fetches to avoid polluting search metrics
- **Network failures** — 15s timeout on all requests; all functions return null instead of throwing
- **Error logging** — all errors are logged with `[algolia-search]` prefix and the HTTP status + Algolia error message
