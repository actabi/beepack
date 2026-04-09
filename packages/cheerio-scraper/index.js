// HTML Scraper - Zero dependencies
// Fetch pages and extract data with regex-based selectors.

/**
 * Fetch an HTML page.
 * @param {string} url
 * @param {object} [opts] - fetch options
 * @returns {Promise<string>} HTML string
 */
export async function fetchPage(url, opts = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; BeepackBot/1.0)", ...opts.headers },
    signal: AbortSignal.timeout(opts.timeout || 15000),
    ...opts,
  });
  if (!res.ok) throw new Error("Fetch " + res.status + ": " + url);
  return res.text();
}

/**
 * Extract text content from elements matching a tag+class selector.
 * @param {string} html
 * @param {string} tag - HTML tag (e.g. "h1", "p", "div")
 * @param {string} [className] - Optional class name filter
 * @returns {string[]}
 */
export function extractText(html, tag, className) {
  const pattern = className
    ? new RegExp("<" + tag + "[^>]*class=\"[^\"]*\\b" + className + "\\b[^\"]*\"[^>]*>([\\s\\S]*?)</" + tag + ">", "gi")
    : new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)</" + tag + ">", "gi");
  const results = [];
  let match;
  while ((match = pattern.exec(html)) !== null) {
    results.push(match[1].replace(/<[^>]+>/g, "").trim());
  }
  return results;
}

/**
 * Extract all links from a page.
 * @param {string} html
 * @param {string} [baseUrl] - Base URL to resolve relative links
 * @returns {Array<{text: string, href: string}>}
 */
export function extractLinks(html, baseUrl) {
  const pattern = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const links = [];
  let match;
  while ((match = pattern.exec(html)) !== null) {
    let href = match[1];
    if (baseUrl && href.startsWith("/")) href = baseUrl.replace(/\/$/, "") + href;
    links.push({ href, text: match[2].replace(/<[^>]+>/g, "").trim() });
  }
  return links;
}

/**
 * Extract meta tag content.
 * @param {string} html
 * @param {string} name - Meta name or property
 * @returns {string|null}
 */
export function extractMeta(html, name) {
  const p1 = new RegExp('<meta[^>]*(?:name|property)="' + name + '"[^>]*content="([^"]*)"', "i");
  const p2 = new RegExp('<meta[^>]*content="([^"]*)"[^>]*(?:name|property)="' + name + '"', "i");
  const m = p1.exec(html) || p2.exec(html);
  return m ? m[1] : null;
}

/**
 * Extract the page title.
 * @param {string} html
 * @returns {string|null}
 */
export function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].trim() : null;
}

/**
 * Extract image sources.
 * @param {string} html
 * @returns {string[]}
 */
export function extractImages(html) {
  const pattern = /<img[^>]*src="([^"]*)"[^>]*\/?>/gi;
  const results = [];
  let match;
  while ((match = pattern.exec(html)) !== null) results.push(match[1]);
  return results;
}

/**
 * Extract an HTML table into a 2D array.
 * @param {string} html
 * @param {number} [tableIndex=0]
 * @returns {string[][]}
 */
export function extractTable(html, tableIndex = 0) {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  if (!tables[tableIndex]) return [];
  const rows = tables[tableIndex].match(/<tr[\s\S]*?<\/tr>/gi) || [];
  return rows.map(row => {
    const cells = row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
    return cells.map(cell => cell.replace(/<[^>]+>/g, "").trim());
  });
}