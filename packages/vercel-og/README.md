# vercel-og

Source code generators for Next.js OG image route handlers. Covers route handler scaffolding, three screenshot-style card templates (blog post, product, profile), font loading config, dynamic composition helpers, OG meta tag building, and cache header utilities. Zero dependencies.

> **Note:** `@vercel/og` is a runtime library that must be installed in your Next.js project (`npm install @vercel/og` or via `next/og` in Next.js 13.3+). This package generates the *source code* you paste into your project; it does not wrap the runtime itself.

## Setup

Install `@vercel/og` in your Next.js project (already bundled in Next.js 13.3+ via `next/og`):

```bash
npm install @vercel/og   # only needed for Next.js < 13.3
```

## Route handler generators

### App Router (`app/og/route.js`)

```js
import { generateRouteHandler, blogPostTemplate } from "./index.js";

const source = generateRouteHandler({
  width: 1200,
  height: 630,
  templateBody: blogPostTemplate({ siteUrl: "myblog.com", accentColor: "#f59e0b" }),
  fonts: [
    { name: "Inter", url: "https://rsms.me/inter/font-files/Inter-Bold.woff", weight: 700 },
  ],
  maxAge: 3600,
});

console.log(source); // paste into app/og/route.js
```

### Pages Router (`pages/api/og.js`)

```js
import { generatePagesRouteHandler, productTemplate } from "./index.js";

const source = generatePagesRouteHandler({
  templateBody: productTemplate({ accentColor: "#2563eb" }),
  maxAge: 86400,
});

console.log(source); // paste into pages/api/og.js
```

## Card templates

All templates read values from `searchParams` at request time. Call the template function to get a JSX source string, then pass it as `templateBody` to a route handler generator, or edit it directly.

### Blog post card

```js
import { blogPostTemplate } from "./index.js";

const template = blogPostTemplate({
  titleParam:  "title",   // ?title=My+Post
  authorParam: "author",  // ?author=Ada+Lovelace
  tagParam:    "tag",     // ?tag=Engineering
  bgColor:     "#0f172a",
  accentColor: "#6366f1",
  siteUrl:     "myblog.com",
});
```

URL: `/og?title=My+Post+Title&author=Ada+Lovelace&tag=Engineering`

### Product card

```js
import { productTemplate } from "./index.js";

const template = productTemplate({
  nameParam:   "name",   // ?name=Pro+Plan
  priceParam:  "price",  // ?price=%2499%2Fmo
  descParam:   "desc",   // ?desc=Everything+you+need
  accentColor: "#2563eb",
  badgeText:   "New",
});
```

URL: `/og?name=Pro+Plan&price=%2499%2Fmo&desc=Everything+you+need`

### Profile card

```js
import { profileTemplate } from "./index.js";

const template = profileTemplate({
  nameParam:   "name",    // ?name=Ada+Lovelace
  roleParam:   "role",    // ?role=Engineer
  handleParam: "handle",  // ?handle=ada
  avatarParam: "avatar",  // ?avatar=https://...
  bgColor:     "#0ea5e9",
});
```

URL: `/og?name=Ada+Lovelace&role=Engineer&handle=ada&avatar=https%3A%2F%2F...`

## Font loading

### buildFontLoadingBlock

Generates the `const fonts = [...]` block inside a route handler. Each font is fetched via `fetch()` (edge-compatible).

```js
import { buildFontLoadingBlock } from "./index.js";

const block = buildFontLoadingBlock([
  { name: "Inter", url: "https://rsms.me/inter/font-files/Inter-Bold.woff", weight: 700, style: "normal" },
  { name: "Inter", url: "https://rsms.me/inter/font-files/Inter-Regular.woff", weight: 400 },
]);

console.log(block);
// const font0Res = await fetch("https://...");
// const font0Data = await font0Res.arrayBuffer();
// const fonts = [
//   { name: "Inter", data: font0Data, weight: 700, style: "normal" },
//   ...
// ];
```

### googleFontUrl

Build a Google Fonts URL for a given family and weight:

```js
import { googleFontUrl } from "./index.js";

const url = googleFontUrl("Inter", 700);
// "https://fonts.googleapis.com/css2?family=Inter:wght@700&display=swap"
```

## OG meta tags

### buildOgMetaTags

Returns an array of `{ property, content }` / `{ name, content }` objects covering OG and Twitter card tags.

```js
import { buildOgMetaTags, buildOgImageUrl } from "./index.js";

const imageUrl = buildOgImageUrl("https://example.com/og", {
  title: "My Post",
  author: "Ada Lovelace",
});

const tags = buildOgMetaTags({
  title:       "My Post",
  description: "A great read.",
  imageUrl,
  siteUrl:     "https://example.com/blog/my-post",
  siteName:    "My Blog",
  type:        "article",
  twitterSite: "@myblog",
});
// [
//   { property: "og:title", content: "My Post" },
//   { property: "og:image", content: "https://example.com/og?title=My+Post&..." },
//   { name: "twitter:card", content: "summary_large_image" },
//   ...
// ]
```

In a Next.js App Router page you can spread these directly into `<Metadata>` or map them to `<meta>` tags.

### renderOgMetaHtml

Render the tag array as raw HTML (for non-React contexts):

```js
import { renderOgMetaHtml } from "./index.js";

const html = renderOgMetaHtml(tags);
// <meta property="og:title" content="My Post">
// <meta property="og:image" content="https://...">
// ...
```

## Dynamic composition helpers

### buildOgImageUrl

Build a query string URL for your OG route from a params object. Skips `null`/`undefined` values.

```js
import { buildOgImageUrl } from "./index.js";

buildOgImageUrl("/og", { title: "Hello World", author: "Ada", tag: null });
// "/og?title=Hello+World&author=Ada"

buildOgImageUrl("https://example.com/og", { title: "Hello", price: 49.99 });
// "https://example.com/og?title=Hello&price=49.99"
```

### truncateOgText

Truncate strings to a safe display length so card titles never overflow:

```js
import { truncateOgText } from "./index.js";

truncateOgText("A very long blog post title that would overflow the card bounds", 60);
// "A very long blog post title that would overflow the card…"
```

## Cache header helpers

### ogCacheControl

Build a `Cache-Control` value tuned for OG images:

```js
import { ogCacheControl } from "./index.js";

ogCacheControl({ maxAge: 3600, sMaxAge: 86400, immutable: false });
// "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400"

ogCacheControl({ immutable: true });
// "public, max-age=86400, s-maxage=604800, immutable, stale-while-revalidate=604800"
```

Use `immutable: true` when your OG URL contains a content hash so CDNs can cache indefinitely.

### ogResponseHeaders

Return a complete headers object for use in an `ImageResponse`:

```js
import { ogResponseHeaders } from "./index.js";

return new ImageResponse(jsx, {
  width: 1200,
  height: 630,
  headers: ogResponseHeaders({ maxAge: 3600, sMaxAge: 604800 }),
});
// headers: { "Cache-Control": "public, max-age=3600, ...", "Content-Type": "image/png" }
```

## Edge Cases Handled

- **Null safety** — all exported functions return `null` (not throw) on bad input, with a `console.error("[vercel-og] ...")` message
- **Optional params** — `buildOgImageUrl` silently omits `null`/`undefined` query params
- **Font weight defaults** — fonts without a `weight` field default to `400`; `style` defaults to `"normal"`
- **Text truncation** — `truncateOgText` handles non-string input gracefully (returns `""`)
- **Tag rendering** — `renderOgMetaHtml` escapes double quotes in content to avoid breaking HTML attributes
