// vercel-og — Source generators for Next.js OG image route handlers.
// Zero dependencies. Returns null on errors. ESM only.

// ---------------------------------------------------------------------------
// Route handler source generators
// ---------------------------------------------------------------------------

/**
 * Generate a complete Next.js App Router route handler file for OG images.
 * Paste the returned string into `app/og/route.js` (or `route.ts`).
 *
 * @param {object} [options]
 * @param {string} [options.width=1200] - Image width in pixels
 * @param {string} [options.height=630] - Image height in pixels
 * @param {string} [options.templateBody] - JSX body string to render (defaults to a simple card)
 * @param {Array<{name: string, url: string, weight?: number, style?: string}>} [options.fonts] - Font configs
 * @param {number} [options.maxAge=3600] - Cache-Control max-age in seconds
 * @param {boolean} [options.typescript=false] - Emit TypeScript syntax
 * @returns {string|null} Route handler source code, or null on error
 */
export function generateRouteHandler(options = {}) {
  try {
    const {
      width = 1200,
      height = 630,
      templateBody = defaultTemplateBody(),
      fonts = [],
      maxAge = 3600,
      typescript = false,
    } = options;

    const fontLoading = fonts.length > 0 ? buildFontLoadingBlock(fonts) : "  const fonts = [];";
    const typeAnnotation = typescript ? ": Promise<Response>" : "";

    return `import { ImageResponse } from "next/og";

export const runtime = "edge";

export const revalidate = ${maxAge};

export async function GET(request)${typeAnnotation} {
  const { searchParams } = new URL(request.url);

${fontLoading}

  return new ImageResponse(
    (
${indentLines(templateBody, 6)}
    ),
    {
      width: ${width},
      height: ${height},
      fonts,
      headers: {
        "Cache-Control": \`public, immutable, no-transform, max-age=${maxAge}\`,
      },
    }
  );
}
`;
  } catch (err) {
    console.error("[vercel-og] generateRouteHandler failed:", err.message);
    return null;
  }
}

/**
 * Generate a minimal Pages Router API route handler (`pages/api/og.js`).
 *
 * @param {object} [options]
 * @param {number} [options.width=1200]
 * @param {number} [options.height=630]
 * @param {string} [options.templateBody] - JSX body string to render
 * @param {number} [options.maxAge=3600]
 * @returns {string|null}
 */
export function generatePagesRouteHandler(options = {}) {
  try {
    const {
      width = 1200,
      height = 630,
      templateBody = defaultTemplateBody(),
      maxAge = 3600,
    } = options;

    return `import { ImageResponse } from "next/og";

export const config = { runtime: "edge" };

export default function handler(req) {
  const { searchParams } = new URL(req.url, "https://example.com");

  return new ImageResponse(
    (
${indentLines(templateBody, 6)}
    ),
    {
      width: ${width},
      height: ${height},
      headers: {
        "Cache-Control": \`public, immutable, no-transform, max-age=${maxAge}\`,
      },
    }
  );
}
`;
  } catch (err) {
    console.error("[vercel-og] generatePagesRouteHandler failed:", err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Card template generators
// ---------------------------------------------------------------------------

/**
 * Generate JSX source for a blog post OG card.
 *
 * @param {object} [options]
 * @param {string} [options.titleParam="title"] - Query-param name for the post title
 * @param {string} [options.authorParam="author"] - Query-param name for the author
 * @param {string} [options.tagParam="tag"] - Query-param name for a category tag
 * @param {string} [options.bgColor="#0f172a"] - Background hex color
 * @param {string} [options.accentColor="#6366f1"] - Accent/tag hex color
 * @param {string} [options.siteUrl] - Site URL shown at the bottom (e.g. "myblog.com")
 * @returns {string} JSX template string
 */
export function blogPostTemplate(options = {}) {
  const {
    titleParam = "title",
    authorParam = "author",
    tagParam = "tag",
    bgColor = "#0f172a",
    accentColor = "#6366f1",
    siteUrl = "myblog.com",
  } = options;

  return `<div
  style={{
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    padding: "64px",
    background: "${bgColor}",
    fontFamily: "Inter, sans-serif",
  }}
>
  {searchParams.get("${tagParam}") && (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        background: "${accentColor}22",
        border: "1px solid ${accentColor}",
        borderRadius: "6px",
        padding: "6px 16px",
        width: "fit-content",
        color: "${accentColor}",
        fontSize: "18px",
        fontWeight: 600,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
      }}
    >
      {searchParams.get("${tagParam}")}
    </div>
  )}
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: "24px",
      flex: 1,
      justifyContent: "center",
    }}
  >
    <div
      style={{
        color: "#ffffff",
        fontSize: "64px",
        fontWeight: 800,
        lineHeight: 1.1,
        letterSpacing: "-0.02em",
      }}
    >
      {searchParams.get("${titleParam}") || "Untitled Post"}
    </div>
  </div>
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      color: "#94a3b8",
      fontSize: "22px",
    }}
  >
    <span>{searchParams.get("${authorParam}") || ""}</span>
    <span>${siteUrl}</span>
  </div>
</div>`;
}

/**
 * Generate JSX source for a product OG card.
 *
 * @param {object} [options]
 * @param {string} [options.nameParam="name"] - Query-param for the product name
 * @param {string} [options.priceParam="price"] - Query-param for the price string
 * @param {string} [options.descParam="desc"] - Query-param for the tagline/description
 * @param {string} [options.bgColor="#ffffff"]
 * @param {string} [options.accentColor="#2563eb"]
 * @param {string} [options.badgeText="New"] - Static badge label (empty string to omit)
 * @returns {string} JSX template string
 */
export function productTemplate(options = {}) {
  const {
    nameParam = "name",
    priceParam = "price",
    descParam = "desc",
    bgColor = "#ffffff",
    accentColor = "#2563eb",
    badgeText = "New",
  } = options;

  return `<div
  style={{
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "flex-start",
    padding: "72px 80px",
    background: "${bgColor}",
    fontFamily: "Inter, sans-serif",
    gap: "20px",
  }}
>
  ${badgeText ? `<div
    style={{
      background: "${accentColor}",
      color: "#ffffff",
      fontSize: "16px",
      fontWeight: 700,
      padding: "6px 18px",
      borderRadius: "100px",
      letterSpacing: "0.04em",
      textTransform: "uppercase",
    }}
  >
    ${badgeText}
  </div>` : ""}
  <div
    style={{
      color: "#111827",
      fontSize: "72px",
      fontWeight: 800,
      lineHeight: 1.05,
      letterSpacing: "-0.03em",
    }}
  >
    {searchParams.get("${nameParam}") || "Product Name"}
  </div>
  <div
    style={{
      color: "#6b7280",
      fontSize: "28px",
      lineHeight: 1.4,
      maxWidth: "800px",
    }}
  >
    {searchParams.get("${descParam}") || ""}
  </div>
  {searchParams.get("${priceParam}") && (
    <div
      style={{
        color: "${accentColor}",
        fontSize: "48px",
        fontWeight: 800,
        marginTop: "8px",
      }}
    >
      {searchParams.get("${priceParam}")}
    </div>
  )}
</div>`;
}

/**
 * Generate JSX source for a profile / author OG card.
 *
 * @param {object} [options]
 * @param {string} [options.nameParam="name"] - Query-param for the person's name
 * @param {string} [options.roleParam="role"] - Query-param for the job title/role
 * @param {string} [options.handleParam="handle"] - Query-param for an @handle
 * @param {string} [options.avatarParam="avatar"] - Query-param for an avatar image URL
 * @param {string} [options.bgColor="#0ea5e9"]
 * @returns {string} JSX template string
 */
export function profileTemplate(options = {}) {
  const {
    nameParam = "name",
    roleParam = "role",
    handleParam = "handle",
    avatarParam = "avatar",
    bgColor = "#0ea5e9",
  } = options;

  return `<div
  style={{
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    padding: "64px 80px",
    background: "linear-gradient(135deg, ${bgColor} 0%, #0369a1 100%)",
    fontFamily: "Inter, sans-serif",
    gap: "56px",
  }}
>
  {searchParams.get("${avatarParam}") && (
    <img
      src={searchParams.get("${avatarParam}")}
      width={200}
      height={200}
      style={{ borderRadius: "50%", border: "6px solid rgba(255,255,255,0.3)" }}
    />
  )}
  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
    <div
      style={{
        color: "#ffffff",
        fontSize: "72px",
        fontWeight: 800,
        lineHeight: 1.05,
        letterSpacing: "-0.02em",
      }}
    >
      {searchParams.get("${nameParam}") || "Your Name"}
    </div>
    <div style={{ color: "rgba(255,255,255,0.85)", fontSize: "30px", fontWeight: 500 }}>
      {searchParams.get("${roleParam}") || ""}
    </div>
    {searchParams.get("${handleParam}") && (
      <div style={{ color: "rgba(255,255,255,0.65)", fontSize: "24px", marginTop: "4px" }}>
        @{searchParams.get("${handleParam}")}
      </div>
    )}
  </div>
</div>`;
}

// ---------------------------------------------------------------------------
// Font loading helpers
// ---------------------------------------------------------------------------

/**
 * Generate the font-loading block for use inside a route handler.
 * Each font is fetched from a URL at request time (edge-compatible).
 *
 * @param {Array<{name: string, url: string, weight?: number, style?: string}>} fonts
 * @returns {string} JS source block (multi-line string)
 */
export function buildFontLoadingBlock(fonts) {
  if (!Array.isArray(fonts) || fonts.length === 0) {
    console.error("[vercel-og] buildFontLoadingBlock: fonts array is empty");
    return "  const fonts = [];";
  }

  const fetches = fonts
    .map((f, i) => `  const font${i}Res = await fetch(${JSON.stringify(f.url)});`)
    .join("\n");
  const buffers = fonts
    .map((f, i) => `  const font${i}Data = await font${i}Res.arrayBuffer();`)
    .join("\n");
  const entries = fonts
    .map(
      (f, i) =>
        `    { name: ${JSON.stringify(f.name)}, data: font${i}Data, weight: ${f.weight ?? 400}, style: ${JSON.stringify(f.style ?? "normal")} }`
    )
    .join(",\n");

  return `${fetches}\n${buffers}\n  const fonts = [\n${entries},\n  ];`;
}

/**
 * Build a ready-to-use Google Fonts URL for fetching a font file.
 * Use the returned URL as the `url` field in a font config object.
 *
 * @param {string} family - Font family name (e.g. "Inter")
 * @param {number} [weight=700]
 * @returns {string} Google Fonts CSS2 API URL (resolves to a CSS file; for binary use the woff2 directly)
 */
export function googleFontUrl(family, weight = 700) {
  const encoded = encodeURIComponent(family);
  return `https://fonts.googleapis.com/css2?family=${encoded}:wght@${weight}&display=swap`;
}

// ---------------------------------------------------------------------------
// OG meta tag builder
// ---------------------------------------------------------------------------

/**
 * Build an array of OG + Twitter meta tag objects for use in `<head>`.
 * Each object has `{ property, content }` or `{ name, content }`.
 *
 * @param {object} params
 * @param {string} params.title - Page title
 * @param {string} [params.description] - Page description
 * @param {string} params.imageUrl - Full URL to the OG image (e.g. route handler URL)
 * @param {string} [params.siteUrl] - Canonical page URL
 * @param {string} [params.siteName] - Site name
 * @param {string} [params.type="website"] - OG type ("website" | "article")
 * @param {number} [params.imageWidth=1200]
 * @param {number} [params.imageHeight=630]
 * @param {string} [params.twitterCard="summary_large_image"]
 * @param {string} [params.twitterSite] - Twitter @handle for the site
 * @returns {Array<{property?: string, name?: string, content: string}>|null}
 */
export function buildOgMetaTags(params) {
  try {
    const {
      title,
      description,
      imageUrl,
      siteUrl,
      siteName,
      type = "website",
      imageWidth = 1200,
      imageHeight = 630,
      twitterCard = "summary_large_image",
      twitterSite,
    } = params;

    if (!title || !imageUrl) {
      console.error("[vercel-og] buildOgMetaTags: title and imageUrl are required");
      return null;
    }

    const tags = [
      { property: "og:title", content: title },
      { property: "og:type", content: type },
      { property: "og:image", content: imageUrl },
      { property: "og:image:width", content: String(imageWidth) },
      { property: "og:image:height", content: String(imageHeight) },
      { name: "twitter:card", content: twitterCard },
      { name: "twitter:title", content: title },
      { name: "twitter:image", content: imageUrl },
    ];

    if (description) {
      tags.push({ property: "og:description", content: description });
      tags.push({ name: "twitter:description", content: description });
    }
    if (siteUrl) tags.push({ property: "og:url", content: siteUrl });
    if (siteName) tags.push({ property: "og:site_name", content: siteName });
    if (twitterSite) tags.push({ name: "twitter:site", content: twitterSite });

    return tags;
  } catch (err) {
    console.error("[vercel-og] buildOgMetaTags failed:", err.message);
    return null;
  }
}

/**
 * Render OG meta tags as an HTML string (for non-React/template use).
 *
 * @param {Array<{property?: string, name?: string, content: string}>} tags - From buildOgMetaTags
 * @returns {string|null} HTML string of <meta> tags
 */
export function renderOgMetaHtml(tags) {
  try {
    if (!Array.isArray(tags)) {
      console.error("[vercel-og] renderOgMetaHtml: expected an array of tag objects");
      return null;
    }
    return tags
      .map((t) => {
        const key = t.property ? `property="${t.property}"` : `name="${t.name}"`;
        return `<meta ${key} content="${t.content.replace(/"/g, "&quot;")}">`;
      })
      .join("\n");
  } catch (err) {
    console.error("[vercel-og] renderOgMetaHtml failed:", err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cache header helpers
// ---------------------------------------------------------------------------

/**
 * Build a Cache-Control header value for OG images.
 *
 * @param {object} [options]
 * @param {number} [options.maxAge=86400] - Browser cache TTL in seconds (default: 1 day)
 * @param {number} [options.sMaxAge=604800] - CDN cache TTL in seconds (default: 7 days)
 * @param {boolean} [options.immutable=false] - Add `immutable` directive (use when URL contains a hash)
 * @param {boolean} [options.staleWhileRevalidate=true] - Allow stale serving while CDN revalidates
 * @returns {string} Cache-Control header value
 */
export function ogCacheControl(options = {}) {
  const {
    maxAge = 86400,
    sMaxAge = 604800,
    immutable = false,
    staleWhileRevalidate = true,
  } = options;

  const parts = ["public", `max-age=${maxAge}`, `s-maxage=${sMaxAge}`];
  if (immutable) parts.push("immutable");
  if (staleWhileRevalidate) parts.push(`stale-while-revalidate=${sMaxAge}`);
  return parts.join(", ");
}

/**
 * Build a complete headers object to attach to an OG ImageResponse.
 *
 * @param {object} [cacheOptions] - Same options as ogCacheControl
 * @returns {Record<string, string>}
 */
export function ogResponseHeaders(cacheOptions = {}) {
  return {
    "Cache-Control": ogCacheControl(cacheOptions),
    "Content-Type": "image/png",
  };
}

// ---------------------------------------------------------------------------
// Dynamic composition helpers
// ---------------------------------------------------------------------------

/**
 * Build a query string for an OG image route from a params object.
 * Safely encodes all values; omits keys with null/undefined values.
 *
 * @param {string} baseUrl - The route URL, e.g. "/og" or "https://example.com/og"
 * @param {Record<string, string|number|boolean|null|undefined>} params
 * @returns {string|null} Full URL with query string, or null on error
 */
export function buildOgImageUrl(baseUrl, params) {
  try {
    if (!baseUrl) {
      console.error("[vercel-og] buildOgImageUrl: baseUrl is required");
      return null;
    }
    const qs = Object.entries(params)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    return qs ? `${baseUrl}?${qs}` : baseUrl;
  } catch (err) {
    console.error("[vercel-og] buildOgImageUrl failed:", err.message);
    return null;
  }
}

/**
 * Truncate a string to a safe display length for OG card titles.
 * Prevents text overflow in fixed-width card templates.
 *
 * @param {string} text
 * @param {number} [maxLength=80] - Maximum character count before truncation
 * @param {string} [ellipsis="…"] - Suffix appended when truncated
 * @returns {string}
 */
export function truncateOgText(text, maxLength = 80, ellipsis = "…") {
  if (typeof text !== "string") return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - ellipsis.length).trimEnd() + ellipsis;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** @param {string} str @param {number} n @returns {string} */
function indentLines(str, n) {
  const pad = " ".repeat(n);
  return str
    .split("\n")
    .map((line) => (line.trim() === "" ? "" : pad + line))
    .join("\n");
}

/** @returns {string} */
function defaultTemplateBody() {
  return `<div
  style={{
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f172a",
    color: "#ffffff",
    fontSize: "64px",
    fontWeight: 800,
    fontFamily: "Inter, sans-serif",
  }}
>
  {searchParams.get("title") || "Hello World"}
</div>`;
}
