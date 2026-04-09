# Puppeteer Browser Automation

Zero-dependency Chrome DevTools Protocol client. Manage tabs, navigate pages, and inspect browser state.

## Prerequisites

- Node.js >= 18
- Chrome/Chromium with `--remote-debugging-port=9222`

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CHROME_WS_URL` | Chrome DevTools URL |

## Usage

### List Pages

```js
import { listPages } from './index.js';
const pages = await listPages("http://localhost:9222");
```

### Open & Close Tabs

```js
import { openPage, closePage } from './index.js';
const page = await openPage("http://localhost:9222", "https://example.com");
await closePage("http://localhost:9222", page.id);
```

### Browser Info

```js
import { getBrowserVersion } from './index.js';
const info = await getBrowserVersion("http://localhost:9222");
```

## Source

Based on [puppeteer/puppeteer](https://github.com/puppeteer/puppeteer) by **Google Chrome** — 94,051+ stars on GitHub.