// Notion API Client
// Zero dependencies - uses native fetch with the Notion REST API v2022-06-28.
// Covers database CRUD, page creation with blocks, recursive block fetching,
// rich text serialization/deserialization, and file/image block handling.

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const TIMEOUT_MS = 15000;

// --- Helpers ---

/**
 * Build standard Notion request headers.
 * @param {string} apiKey - Notion integration token (secret_...)
 * @param {boolean} [json=true] - Whether to include Content-Type: application/json
 * @returns {object}
 */
function buildHeaders(apiKey, json = true) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Notion-Version": NOTION_VERSION,
  };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

/**
 * Execute a fetch with timeout and unified error handling.
 * Returns null on any error rather than throwing.
 * @param {string} tag - Log prefix, e.g. "queryDatabase"
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<object|null>}
 */
async function apiFetch(tag, url, options = {}) {
  try {
    const res = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[notion-api] ${tag} error ${res.status}: ${err.message || err.code || ""}`);
      return null;
    }

    return res.json();
  } catch (err) {
    console.error(`[notion-api] ${tag} failed: ${err.message}`);
    return null;
  }
}

// --- Rich Text ---

/**
 * Serialize an array of Notion rich_text objects into a plain string.
 * Preserves text content; annotations (bold, italic, etc.) are stripped.
 *
 * @param {Array<object>} richText - Notion rich_text array
 * @returns {string}
 */
export function serializeRichText(richText) {
  if (!Array.isArray(richText)) return "";
  return richText.map((segment) => segment?.plain_text ?? "").join("");
}

/**
 * Deserialize a plain string into a Notion rich_text array.
 * Produces a single unstyled text segment suitable for most API writes.
 *
 * @param {string} text - Plain text content
 * @returns {Array<object>} Notion rich_text array
 */
export function deserializeRichText(text) {
  if (!text) return [];
  return [{ type: "text", text: { content: String(text) } }];
}

/**
 * Build a rich_text segment with optional annotations.
 *
 * @param {string} text - Text content
 * @param {object} [annotations] - Notion annotation object (bold, italic, color, etc.)
 * @param {string} [url] - Wrap the segment as a link
 * @returns {object} Notion rich_text segment
 */
export function richTextSegment(text, annotations = {}, url) {
  const segment = {
    type: "text",
    text: { content: String(text), ...(url ? { link: { url } } : {}) },
  };
  if (Object.keys(annotations).length > 0) segment.annotations = annotations;
  return segment;
}

// --- Database ---

/**
 * Query a Notion database with optional filters, sorts, and pagination.
 * Returns all matching pages, automatically following cursor pagination.
 *
 * @param {string} apiKey - Notion integration token
 * @param {string} databaseId - Database UUID
 * @param {object} [options]
 * @param {object} [options.filter] - Notion filter object
 * @param {Array<object>} [options.sorts] - Notion sort array
 * @param {number} [options.pageSize=100] - Results per page (max 100)
 * @param {boolean} [options.fetchAll=true] - Follow cursor and return all results
 * @returns {Promise<Array<object>|null>} Array of page objects, or null on error
 */
export async function queryDatabase(apiKey, databaseId, options = {}) {
  const { filter, sorts, pageSize = 100, fetchAll = true } = options;
  const results = [];
  let cursor;

  do {
    const body = { page_size: Math.min(pageSize, 100) };
    if (filter) body.filter = filter;
    if (sorts) body.sorts = sorts;
    if (cursor) body.start_cursor = cursor;

    const data = await apiFetch(
      "queryDatabase",
      `${NOTION_API}/databases/${databaseId}/query`,
      {
        method: "POST",
        headers: buildHeaders(apiKey),
        body: JSON.stringify(body),
      }
    );

    if (!data) return null;
    results.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor && fetchAll);

  return results;
}

/**
 * Retrieve metadata for a Notion database (title, properties schema, etc.).
 *
 * @param {string} apiKey
 * @param {string} databaseId
 * @returns {Promise<object|null>} Database object or null on error
 */
export async function getDatabase(apiKey, databaseId) {
  return apiFetch(
    "getDatabase",
    `${NOTION_API}/databases/${databaseId}`,
    { headers: buildHeaders(apiKey, false) }
  );
}

/**
 * Create a new page (row) in a Notion database.
 *
 * @param {string} apiKey
 * @param {string} databaseId - Parent database UUID
 * @param {object} properties - Notion properties object matching the database schema
 * @param {Array<object>} [children] - Initial block children for the page body
 * @returns {Promise<object|null>} Created page object or null on error
 */
export async function createDatabasePage(apiKey, databaseId, properties, children) {
  const body = {
    parent: { database_id: databaseId },
    properties,
  };
  if (children && children.length > 0) body.children = children;

  return apiFetch("createDatabasePage", `${NOTION_API}/pages`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });
}

/**
 * Update properties on an existing Notion page (database row).
 * Only provided properties are changed; omitted properties are left as-is.
 *
 * @param {string} apiKey
 * @param {string} pageId - Page UUID
 * @param {object} properties - Partial properties object with fields to update
 * @param {boolean} [archived=false] - Set true to archive (soft-delete) the page
 * @returns {Promise<object|null>} Updated page object or null on error
 */
export async function updatePage(apiKey, pageId, properties, archived = false) {
  const body = { properties };
  if (archived) body.archived = true;

  return apiFetch("updatePage", `${NOTION_API}/pages/${pageId}`, {
    method: "PATCH",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });
}

// --- Pages ---

/**
 * Retrieve a Notion page object by ID.
 *
 * @param {string} apiKey
 * @param {string} pageId
 * @returns {Promise<object|null>}
 */
export async function getPage(apiKey, pageId) {
  return apiFetch(
    "getPage",
    `${NOTION_API}/pages/${pageId}`,
    { headers: buildHeaders(apiKey, false) }
  );
}

/**
 * Create a standalone Notion page under a parent page or workspace.
 *
 * @param {string} apiKey
 * @param {object} parent - { page_id: string } or { workspace: true }
 * @param {string|Array<object>} title - Page title as a plain string or rich_text array
 * @param {Array<object>} [children] - Block children to include in the page body
 * @returns {Promise<object|null>} Created page object or null on error
 */
export async function createPage(apiKey, parent, title, children) {
  const titleRichText = typeof title === "string" ? deserializeRichText(title) : title;
  const body = {
    parent,
    properties: {
      title: { title: titleRichText },
    },
  };
  if (children && children.length > 0) body.children = children;

  return apiFetch("createPage", `${NOTION_API}/pages`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });
}

// --- Blocks ---

/**
 * Retrieve the immediate children of a block or page.
 *
 * @param {string} apiKey
 * @param {string} blockId - Block or page UUID
 * @param {string} [startCursor] - Pagination cursor from a previous call
 * @param {number} [pageSize=100] - Results per page (max 100)
 * @returns {Promise<{results: Array<object>, hasMore: boolean, nextCursor: string|null}|null>}
 */
export async function getBlockChildren(apiKey, blockId, startCursor, pageSize = 100) {
  const params = new URLSearchParams({ page_size: String(Math.min(pageSize, 100)) });
  if (startCursor) params.set("start_cursor", startCursor);

  const data = await apiFetch(
    "getBlockChildren",
    `${NOTION_API}/blocks/${blockId}/children?${params}`,
    { headers: buildHeaders(apiKey, false) }
  );

  if (!data) return null;
  return {
    results: data.results,
    hasMore: data.has_more,
    nextCursor: data.next_cursor ?? null,
  };
}

/**
 * Recursively fetch all block descendants of a page or block.
 * Follows pagination at every level. Depth-first traversal.
 * Blocks with children will have a `children` array populated in place.
 *
 * @param {string} apiKey
 * @param {string} blockId - Root block or page UUID
 * @param {number} [maxDepth=10] - Safety cap to prevent infinite recursion
 * @returns {Promise<Array<object>|null>} Flat-or-nested block tree, or null on error
 */
export async function fetchBlocksRecursive(apiKey, blockId, maxDepth = 10) {
  if (maxDepth <= 0) return [];

  const allBlocks = [];
  let cursor;

  do {
    const page = await getBlockChildren(apiKey, blockId, cursor);
    if (!page) return null;

    for (const block of page.results) {
      if (block.has_children) {
        const childBlocks = await fetchBlocksRecursive(apiKey, block.id, maxDepth - 1);
        if (childBlocks === null) return null;
        block.children = childBlocks;
      }
      allBlocks.push(block);
    }

    cursor = page.hasMore ? page.nextCursor : null;
  } while (cursor);

  return allBlocks;
}

/**
 * Append block children to an existing page or block.
 * Notion enforces a maximum of 100 children per call; this function
 * automatically batches larger arrays.
 *
 * @param {string} apiKey
 * @param {string} blockId - Parent block or page UUID
 * @param {Array<object>} children - Notion block objects to append
 * @returns {Promise<Array<object>|null>} All appended block objects, or null on error
 */
export async function appendBlocks(apiKey, blockId, children) {
  const BATCH = 100;
  const appended = [];

  for (let i = 0; i < children.length; i += BATCH) {
    const batch = children.slice(i, i + BATCH);
    const data = await apiFetch(
      "appendBlocks",
      `${NOTION_API}/blocks/${blockId}/children`,
      {
        method: "PATCH",
        headers: buildHeaders(apiKey),
        body: JSON.stringify({ children: batch }),
      }
    );
    if (!data) return null;
    appended.push(...data.results);
  }

  return appended;
}

// --- Block Builders ---

/**
 * Build a paragraph block from a plain string or rich_text array.
 * @param {string|Array<object>} text
 * @param {string} [color="default"]
 * @returns {object}
 */
export function paragraphBlock(text, color = "default") {
  return {
    type: "paragraph",
    paragraph: {
      rich_text: typeof text === "string" ? deserializeRichText(text) : text,
      color,
    },
  };
}

/**
 * Build a heading block (h1, h2, or h3).
 * @param {string|Array<object>} text
 * @param {1|2|3} [level=1]
 * @returns {object}
 */
export function headingBlock(text, level = 1) {
  const type = `heading_${level}`;
  return {
    type,
    [type]: {
      rich_text: typeof text === "string" ? deserializeRichText(text) : text,
      is_toggleable: false,
    },
  };
}

/**
 * Build a bulleted list item block.
 * @param {string|Array<object>} text
 * @returns {object}
 */
export function bulletedListItem(text) {
  return {
    type: "bulleted_list_item",
    bulleted_list_item: {
      rich_text: typeof text === "string" ? deserializeRichText(text) : text,
    },
  };
}

/**
 * Build a code block.
 * @param {string} code - Source code content
 * @param {string} [language="plain text"] - Notion-supported language identifier
 * @returns {object}
 */
export function codeBlock(code, language = "plain text") {
  return {
    type: "code",
    code: {
      rich_text: deserializeRichText(code),
      language,
    },
  };
}

/**
 * Build an image block from a public URL.
 * Use this for externally hosted images; Notion does not accept uploads directly.
 *
 * @param {string} url - Public image URL
 * @param {string} [caption] - Optional caption text
 * @returns {object}
 */
export function imageBlock(url, caption) {
  return {
    type: "image",
    image: {
      type: "external",
      external: { url },
      ...(caption ? { caption: deserializeRichText(caption) } : {}),
    },
  };
}

/**
 * Build a file block from a public URL.
 *
 * @param {string} url - Public file URL
 * @param {string} [name] - Display name for the file
 * @param {string} [caption] - Optional caption text
 * @returns {object}
 */
export function fileBlock(url, name, caption) {
  return {
    type: "file",
    file: {
      type: "external",
      external: { url },
      ...(name ? { name } : {}),
      ...(caption ? { caption: deserializeRichText(caption) } : {}),
    },
  };
}

// --- File / Image Extraction ---

/**
 * Extract the URL from a Notion file or image block.
 * Handles both Notion-hosted (time-limited) and external URLs.
 *
 * @param {object} block - A Notion image or file block object
 * @returns {string|null} URL string, or null if not resolvable
 */
export function extractFileUrl(block) {
  const inner = block?.image ?? block?.file ?? block?.pdf ?? block?.video;
  if (!inner) return null;
  if (inner.type === "external") return inner.external?.url ?? null;
  if (inner.type === "file") return inner.file?.url ?? null;
  return null;
}
