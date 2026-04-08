# notion-api

Notion API client covering database CRUD, page creation with blocks, recursive block fetching with full pagination, rich text serialization/deserialization, and file/image block handling. Zero dependencies — native fetch only.

## Setup

```bash
NOTION_API_KEY=secret_...  # From your Notion integration at https://www.notion.so/my-integrations
```

Share each database or page with your integration in the Notion UI (... menu → Connections). The API version used is `2022-06-28`.

## Usage

### Query a Database

```js
import { queryDatabase } from "./index.js";

const pages = await queryDatabase(process.env.NOTION_API_KEY, "database-uuid", {
  filter: {
    property: "Status",
    select: { equals: "Published" },
  },
  sorts: [{ property: "Created", direction: "descending" }],
});
// Array of Notion page objects, all pages fetched automatically via cursor pagination
```

### Create a Database Row

```js
import { createDatabasePage } from "./index.js";

const page = await createDatabasePage(
  process.env.NOTION_API_KEY,
  "database-uuid",
  {
    Name: { title: [{ type: "text", text: { content: "New Entry" } }] },
    Status: { select: { name: "Draft" } },
    Priority: { number: 1 },
  }
);
// { id: "page-uuid", url: "https://notion.so/...", ... }
```

### Update a Database Row

```js
import { updatePage } from "./index.js";

const updated = await updatePage(process.env.NOTION_API_KEY, "page-uuid", {
  Status: { select: { name: "Published" } },
  Tags: { multi_select: [{ name: "featured" }, { name: "newsletter" }] },
});
```

### Archive (Soft-Delete) a Page

```js
await updatePage(process.env.NOTION_API_KEY, "page-uuid", {}, true);
```

### Create a Page with Blocks

```js
import { createPage, headingBlock, paragraphBlock, codeBlock, imageBlock } from "./index.js";

const page = await createPage(
  process.env.NOTION_API_KEY,
  { page_id: "parent-page-uuid" },
  "My New Page",
  [
    headingBlock("Introduction", 1),
    paragraphBlock("This page was created via the Notion API."),
    codeBlock('console.log("hello")', "javascript"),
    imageBlock("https://example.com/banner.png", "Banner image"),
  ]
);
```

### Fetch All Blocks Recursively

```js
import { fetchBlocksRecursive, serializeRichText } from "./index.js";

const blocks = await fetchBlocksRecursive(process.env.NOTION_API_KEY, "page-uuid");
// Blocks with nested children have a `children` array populated in place.

for (const block of blocks) {
  if (block.type === "paragraph") {
    console.log(serializeRichText(block.paragraph.rich_text));
  }
}
```

### Append Blocks to an Existing Page

```js
import { appendBlocks, bulletedListItem } from "./index.js";

await appendBlocks(process.env.NOTION_API_KEY, "page-uuid", [
  bulletedListItem("First point"),
  bulletedListItem("Second point"),
  bulletedListItem("Third point"),
]);
// Batches automatically if more than 100 blocks are provided
```

### Rich Text Serialization

```js
import { serializeRichText, deserializeRichText, richTextSegment } from "./index.js";

// Notion → plain string
const text = serializeRichText(page.properties.Description.rich_text);

// Plain string → Notion rich_text array
const richText = deserializeRichText("Hello, world!");

// Build a styled segment (bold link)
const segment = richTextSegment("Click here", { bold: true }, "https://example.com");
```

### File and Image Block Handling

```js
import { extractFileUrl, fileBlock, imageBlock } from "./index.js";

// Build blocks
const imgBlock = imageBlock("https://cdn.example.com/photo.jpg", "Hero photo");
const attachment = fileBlock("https://cdn.example.com/report.pdf", "Q1 Report.pdf");

// Extract URL from any file/image block returned by the API
const url = extractFileUrl(block);
// Works for Notion-hosted files (time-limited signed URL) and external URLs
```

## Edge Cases Handled

- **Cursor pagination** — `queryDatabase` and `fetchBlocksRecursive` automatically follow `next_cursor` until all results are collected
- **Batch append** — `appendBlocks` splits arrays larger than 100 into sequential batches (Notion's per-call limit)
- **Recursive depth cap** — `fetchBlocksRecursive` accepts a `maxDepth` parameter (default 10) to prevent runaway recursion on deeply nested pages
- **File URL types** — `extractFileUrl` handles both `external` and Notion-hosted `file` types across image, file, pdf, and video blocks
- **Network failures** — 15s timeout on all requests; returns null instead of throwing
- **Error logging** — all errors are logged with `[notion-api]` prefix and the HTTP status + Notion error message
