// Chrome DevTools Protocol Client - Zero dependencies
// Manage browser tabs via the Chrome CDP HTTP API.

/**
 * List all open browser pages.
 * @param {string} chromeUrl - Chrome debug URL (http://localhost:9222)
 * @returns {Promise<Array<{id: string, url: string, title: string}>>}
 */
export async function listPages(chromeUrl) {
  const res = await fetch(chromeUrl + "/json");
  if (!res.ok) throw new Error("Chrome CDP " + res.status);
  return res.json();
}

/**
 * Open a new tab.
 * @param {string} chromeUrl
 * @param {string} url
 * @returns {Promise<object>} Page info
 */
export async function openPage(chromeUrl, url) {
  const res = await fetch(chromeUrl + "/json/new?" + encodeURIComponent(url));
  if (!res.ok) throw new Error("Chrome new tab " + res.status);
  return res.json();
}

/**
 * Close a tab.
 * @param {string} chromeUrl
 * @param {string} pageId
 */
export async function closePage(chromeUrl, pageId) {
  await fetch(chromeUrl + "/json/close/" + pageId);
}

/**
 * Activate a tab (bring to front).
 * @param {string} chromeUrl
 * @param {string} pageId
 */
export async function activatePage(chromeUrl, pageId) {
  await fetch(chromeUrl + "/json/activate/" + pageId);
}

/**
 * Get browser version info.
 * @param {string} chromeUrl
 * @returns {Promise<object>}
 */
export async function getBrowserVersion(chromeUrl) {
  const res = await fetch(chromeUrl + "/json/version");
  return res.json();
}

/**
 * Navigate a page and wait for load.
 * @param {string} chromeUrl
 * @param {string} url
 * @param {number} [waitMs=3000]
 * @returns {Promise<{pageId: string, title: string, url: string}>}
 */
export async function navigateAndWait(chromeUrl, url, waitMs = 3000) {
  const page = await openPage(chromeUrl, url);
  await new Promise(r => setTimeout(r, waitMs));
  // Refresh page info
  const pages = await listPages(chromeUrl);
  const updated = pages.find(p => p.id === page.id);
  return { pageId: page.id, title: updated?.title || "", url: updated?.url || url };
}

/**
 * Get all page URLs matching a pattern.
 * @param {string} chromeUrl
 * @param {RegExp} pattern
 * @returns {Promise<Array<{id: string, url: string, title: string}>>}
 */
export async function findPages(chromeUrl, pattern) {
  const pages = await listPages(chromeUrl);
  return pages.filter(p => pattern.test(p.url));
}