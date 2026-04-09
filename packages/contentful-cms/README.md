# contentful-cms

Zero-dependency wrapper for the **Contentful Delivery API**. Fetch entries, assets, content types, and perform full-text search — all with native `fetch` and no external packages.

## Environment Variables

| Variable | Description |
|---|---|
| `CONTENTFUL_SPACE_ID` | Your Contentful space ID |
| `CONTENTFUL_ACCESS_TOKEN` | Delivery API access token |

## Installation

```bash
bee add contentful-cms
```

## Usage

```js
import { getEntry, getEntries, getAsset, getContentType, searchEntries } from 'contentful-cms';

// Fetch a single entry
const entry = await getEntry('6tl8yLSOiMKGEymuI2Oq2S');

// List entries filtered by content type
const posts = await getEntries({ content_type: 'blogPost', limit: '10' });

// Get an asset (image, file, etc.)
const asset = await getAsset('3wkz2ih6xKOEgQ2kYeEwOQ');

// Inspect a content type schema
const schema = await getContentType('blogPost');

// Full-text search
const results = await searchEntries('javascript');
```

## API

### `getEntry(entryId, opts?)` — Fetch a single entry by ID.
### `getEntries(query?, opts?)` — Fetch entries with optional query filters.
### `getAsset(assetId, opts?)` — Fetch a single asset by ID.
### `getContentType(contentTypeId, opts?)` — Fetch a content type definition.
### `searchEntries(queryText, filters?, opts?)` — Full-text search across entries.

All functions return the parsed JSON response or `null` on failure. Every `opts` object accepts optional `spaceId` and `accessToken` overrides.

## License

MIT
