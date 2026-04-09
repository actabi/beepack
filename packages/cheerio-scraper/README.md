# Cheerio Web Scraper

Zero-dependency HTML scraper. Fetch pages and extract text, links, meta tags, images, and tables.

## Prerequisites

- Node.js >= 18

## Usage

### Fetch & Extract Text

```js
import { fetchPage, extractText } from './index.js';
const html = await fetchPage("https://example.com");
const headings = extractText(html, "h1");
```

### Extract Links

```js
import { extractLinks } from './index.js';
const links = extractLinks(html, "https://example.com");
```

### Extract Meta & Title

```js
import { extractTitle, extractMeta } from './index.js';
console.log(extractTitle(html));
console.log(extractMeta(html, "og:description"));
```

### Extract Table Data

```js
import { extractTable } from './index.js';
const rows = extractTable(html, 0);
```

## Source

Based on [cheeriojs/cheerio](https://github.com/cheeriojs/cheerio) by **Cheerio** — 30,260+ stars on GitHub.