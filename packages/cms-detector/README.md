# cms-detector

Detect CMS platforms, JavaScript frameworks, analytics tools, and server technology from any website URL.

Uses a single HTTP fetch combined with [cheerio](https://github.com/cheeriojs/cheerio) HTML parsing and pattern matching - no headless browser required.

## Detected platforms

**CMS / Website Builders:** WordPress, Wix, Squarespace, Shopify, Jimdo, Simplebo, Joomla, Drupal, PrestaShop, Webflow, Weebly, Strikingly, 1&1 IONOS, La Boite Immo, Apimo, Immofacile (Orisha)

**Frameworks:** React, Vue, Angular, jQuery, Bootstrap, Tailwind

**Analytics:** Google Analytics, Google Tag Manager, Matomo, Facebook Pixel, Hotjar

## Requirements

- Node.js >= 18 (uses native `fetch`)
- [cheerio](https://www.npmjs.com/package/cheerio) - install it alongside this package

```bash
npm install cheerio
```

## Usage

```js
import { detectCms } from "./index.js";

const result = await detectCms("example.com");
console.log(result);
```

### Result shape

```js
{
  cms: "WordPress",       // detected CMS name or null
  cmsVersion: "6.4.2",   // version if extractable, or null
  frameworks: ["jQuery", "Bootstrap"],
  analytics: ["Google Analytics", "Google Tag Manager"],
  server: "nginx",        // Server header or null
  poweredBy: "PHP/8.2",   // X-Powered-By header or null
  fetchFailed: false       // true if the URL could not be fetched
}
```

### Handling errors

When the target URL is unreachable, returns too large a response, or times out (15 s), the function returns a result with `fetchFailed: true` and all other fields at their default values. No exception is thrown.

## How it works

1. Fetches the page HTML with a single GET request (max 5 MB).
2. Reads `Server` and `X-Powered-By` response headers.
3. Parses HTML with cheerio to extract `<meta name="generator">`, `<script src>`, and `<link href>` values.
4. Matches those values against built-in pattern lists for CMS, framework, and analytics detection.
5. Returns a structured result object.

## License

ISC
