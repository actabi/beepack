# cdn-url-cleaner

Extract original high-quality images from CDN-transformed URLs.

Many CDNs embed transformation parameters in image URLs for lazy-loading placeholders (blur, low quality, tiny dimensions). This package strips those transforms to recover the original full-resolution image URL.

## Supported CDNs

| CDN | What gets cleaned |
|---|---|
| **Wix** | `/v1/fill/w_334,h_250,q_30,blur_30,...` path segments |
| **Shopify** | `_200x`, `_400x300` size suffixes and query params |
| **WordPress** | `-300x200` thumbnail dimension suffixes |
| **Squarespace** | `?format=xxx&width=xxx` query parameters |
| **Generic** | `blur`, `quality`, `q`, `w`, `h`, `width`, `height` query params |

## Installation

Copy the `index.js` file into your project, or reference it directly from your Beepack workspace.

## Usage

```js
import { cleanCdnImageUrl, deduplicateCleanedUrls } from "./index.js";

// Wix - strips transformation path
cleanCdnImageUrl(
  "https://static.wixstatic.com/media/abc123.jpg/v1/fill/w_334,h_250,q_30,blur_30/photo.webp"
);
// => "https://static.wixstatic.com/media/abc123.jpg"

// Shopify - removes size suffix and query params
cleanCdnImageUrl(
  "https://cdn.shopify.com/s/files/1/product_400x300.png?v=123"
);
// => "https://cdn.shopify.com/s/files/1/product.png"

// WordPress - removes thumbnail dimensions
cleanCdnImageUrl(
  "https://example.com/wp-content/uploads/2024/01/photo-300x200.jpg"
);
// => "https://example.com/wp-content/uploads/2024/01/photo.jpg"

// Squarespace - strips all query params
cleanCdnImageUrl(
  "https://images.squarespace-cdn.com/content/v1/image.jpg?format=500w"
);
// => "https://images.squarespace-cdn.com/content/v1/image.jpg"

// Generic - removes quality/blur params from any URL
cleanCdnImageUrl(
  "https://example.com/image.jpg?blur=20&quality=10&other=keep"
);
// => "https://example.com/image.jpg?other=keep"
```

### Deduplication

When scraping a page you often find the same image at multiple transform sizes. `deduplicateCleanedUrls` cleans all URLs first, then removes duplicates:

```js
const urls = [
  "https://static.wixstatic.com/media/abc.jpg/v1/fill/w_100,h_75/thumb.webp",
  "https://static.wixstatic.com/media/abc.jpg/v1/fill/w_800,h_600/large.webp",
  "https://static.wixstatic.com/media/def.jpg/v1/fill/w_200,h_150/thumb.webp",
];

deduplicateCleanedUrls(urls);
// => [
//   "https://static.wixstatic.com/media/abc.jpg",
//   "https://static.wixstatic.com/media/def.jpg"
// ]
```

## API

### `cleanCdnImageUrl(url: string): string`

Takes a CDN image URL and returns the cleaned URL pointing to the original high-quality image. Returns the input unchanged if no CDN pattern is matched.

### `deduplicateCleanedUrls(urls: string[]): string[]`

Cleans all URLs via `cleanCdnImageUrl`, then returns a deduplicated array preserving first-seen order.
