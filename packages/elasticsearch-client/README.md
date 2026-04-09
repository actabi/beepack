# Elasticsearch Client

Zero-dependency Elasticsearch REST client. Index, search, bulk operations, and index management.

## Prerequisites

- Node.js >= 18
- Elasticsearch cluster (self-hosted or Elastic Cloud)

## Environment Variables

| Variable | Description |
|----------|-------------|
| \`ELASTICSEARCH_URL\` | Cluster URL |
| \`ELASTICSEARCH_API_KEY\` | API key |

## Usage

### Setup

\`\`\`js
import { createElasticsearchClient } from './index.js';

const es = createElasticsearchClient({
  url: process.env.ELASTICSEARCH_URL,
  apiKey: process.env.ELASTICSEARCH_API_KEY
});
\`\`\`

### Index & Search

\`\`\`js
await es.index("products", "1", { name: "Widget", price: 9.99, tags: ["sale"] });
const results = await es.textSearch("products", "widget", ["name", "tags"]);
console.log(results.hits.hits);
\`\`\`

### Bulk Index

\`\`\`js
await es.bulk("products", [
  { id: "2", doc: { name: "Gadget", price: 19.99 } },
  { id: "3", doc: { name: "Gizmo", price: 29.99 } },
]);
\`\`\`

### Advanced Query DSL

\`\`\`js
const results = await es.search("products", {
  bool: { must: [{ range: { price: { lte: 20 } } }], should: [{ match: { name: "widget" } }] }
});
\`\`\`

## Source

Based on [elastic/elasticsearch-js](https://github.com/elastic/elasticsearch-js) by **Elastic** — 5,302+ stars on GitHub.