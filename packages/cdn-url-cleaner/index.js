/**
 * Clean CDN image URLs to get highest-quality originals.
 *
 * Many CDNs (Wix, Squarespace, Shopify, etc.) embed transformation parameters
 * in URLs for lazy-loading placeholders (blur, low quality, tiny dimensions).
 * This strips those transforms to fetch the real full-resolution image.
 */

/**
 * Wix static URLs follow this pattern:
 *   https://static.wixstatic.com/media/{mediaId}.{ext}/v1/fill/w_334,h_250,q_30,blur_30,.../filename.webp
 *
 * The original is just:
 *   https://static.wixstatic.com/media/{mediaId}.{ext}
 */
function cleanWixUrl(url) {
  const wixMediaPattern = /^(https?:\/\/static\.wixstatic\.com\/media\/[^/]+\.\w+)\/v1\/.+$/i;
  const match = url.match(wixMediaPattern);
  if (match) {
    return match[1];
  }
  return url;
}

/**
 * Squarespace image URLs have ?format=xxx&width=xxx parameters.
 * Strip to get original.
 */
function cleanSquarespaceUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("squarespace-cdn.com") || u.hostname.includes("sqspcdn.com")) {
      u.search = "";
      return u.toString();
    }
  } catch {
    // ignore
  }
  return url;
}

/**
 * Shopify CDN URLs: ..._{width}x.{ext} or ?width=N&height=N
 * Clean to get largest version.
 */
function cleanShopifyUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("shopify.com") || u.hostname.includes("cdn.shopify.com")) {
      // Remove size suffix like _200x, _400x300
      u.pathname = u.pathname.replace(/_\d+x\d*(?=\.\w+$)/, "");
      u.search = "";
      return u.toString();
    }
  } catch {
    // ignore
  }
  return url;
}

/**
 * WordPress/WP Engine thumbnail URLs: ...-{width}x{height}.{ext}
 * Clean to get original upload.
 */
function cleanWordPressUrl(url) {
  if (!url.includes("/wp-content/uploads/")) return url;
  return url.replace(/-\d{2,4}x\d{2,4}(?=\.\w{3,4}(?:\?|$))/, "");
}

/**
 * Generic cleanup: remove obvious quality/blur params from any URL.
 */
function cleanGenericParams(url) {
  try {
    const u = new URL(url);
    for (const param of ["blur", "quality", "q", "w", "h", "width", "height"]) {
      u.searchParams.delete(param);
    }
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Clean a CDN image URL to get the highest-quality original.
 * Handles Wix, Squarespace, Shopify, WordPress, and generic query params.
 *
 * @param {string} url - The CDN image URL to clean.
 * @returns {string} The cleaned URL pointing to the original high-quality image.
 */
export function cleanCdnImageUrl(url) {
  if (!url) return url;

  // Wix
  if (url.includes("wixstatic.com")) {
    return cleanWixUrl(url);
  }

  // Squarespace
  if (url.includes("squarespace") || url.includes("sqspcdn")) {
    return cleanSquarespaceUrl(url);
  }

  // Shopify
  if (url.includes("shopify.com")) {
    return cleanShopifyUrl(url);
  }

  // WordPress
  if (url.includes("/wp-content/uploads/")) {
    return cleanWordPressUrl(url);
  }

  // Generic: only strip query params if URL looks like it has quality/blur params
  try {
    const u = new URL(url);
    if (u.searchParams.has("blur") || u.searchParams.has("quality") || u.searchParams.has("q")) {
      return cleanGenericParams(url);
    }
  } catch {
    // ignore
  }

  return url;
}

/**
 * Deduplicate image URLs that resolve to the same base image.
 * E.g., multiple Wix transforms of the same media ID.
 *
 * @param {string[]} urls - Array of CDN image URLs.
 * @returns {string[]} Deduplicated array of cleaned URLs.
 */
export function deduplicateCleanedUrls(urls) {
  const entries = urls.map((url) => ({ original: url, cleanedUrl: cleanCdnImageUrl(url) }));
  const seen = new Set();
  const result = [];

  for (const { cleanedUrl } of entries) {
    if (!seen.has(cleanedUrl)) {
      seen.add(cleanedUrl);
      result.push(cleanedUrl);
    }
  }

  return result;
}
