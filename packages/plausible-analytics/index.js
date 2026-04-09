// Plausible Analytics
// Zero dependencies — native fetch only.
// Covers server-side event tracking (pageviews + custom events), the Stats API
// (aggregate, breakdown, realtime), and the Sites management API.
// Works with both Plausible Cloud and self-hosted instances.

const TIMEOUT_MS = 15000;
const DEFAULT_BASE_URL = "https://plausible.io";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build authorization headers for the Plausible Stats/Sites API.
 *
 * @param {string} apiKey - Plausible API key (from account settings)
 * @returns {Record<string, string>}
 */
function authHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

/**
 * Serialize an object into a URL query string, omitting null/undefined values.
 * Arrays are serialized as repeated key=value pairs.
 *
 * @param {Record<string, *>} params
 * @returns {string} Query string (without leading "?")
 */
function toQueryString(params) {
  const parts = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  }
  return parts.join("&");
}

// ---------------------------------------------------------------------------
// Event tracking (no auth required)
// ---------------------------------------------------------------------------

/**
 * Track a pageview event via Plausible's /api/event endpoint.
 * This mirrors what the Plausible JavaScript snippet does, but from the server side.
 * No API key is required — the domain ownership is inferred from the domain parameter.
 *
 * Plausible uses the User-Agent header for device/browser detection and the
 * X-Forwarded-For header for geolocation. Supply these via options to get accurate stats.
 * Returns true on a 202 Accepted response, false on any error.
 *
 * @param {string} domain - The site domain as configured in Plausible (e.g. "example.com")
 * @param {string} url - Full URL of the page being tracked (e.g. "https://example.com/blog/post")
 * @param {object} [options={}]
 * @param {string} [options.referrer] - HTTP referrer URL
 * @param {Record<string, string|number>} [options.props] - Custom event properties (key-value pairs)
 * @param {string} [options.userAgent] - Visitor's User-Agent string (for device detection)
 * @param {string} [options.ip] - Visitor's IP address (for geo; will not be stored by Plausible)
 * @param {string} [options.baseUrl='https://plausible.io'] - Override for self-hosted instances
 * @returns {Promise<boolean>} true on success (202), false on failure
 */
export async function trackPageview(domain, url, options = {}) {
  return _sendEvent(domain, "pageview", url, options);
}

/**
 * Track a custom named event via Plausible's /api/event endpoint.
 * Custom events must be registered in your Plausible dashboard (Goals section)
 * before they appear in reports. Revenue tracking requires Plausible v2+.
 *
 * @param {string} domain - The site domain as configured in Plausible
 * @param {string} eventName - Event name (e.g. "Signup", "Purchase", "Download")
 * @param {string} url - Full URL where the event occurred
 * @param {object} [options={}]
 * @param {Record<string, string|number>} [options.props] - Custom event properties
 * @param {{amount: number, currency: string}} [options.revenue] - Revenue data for ecommerce tracking
 * @param {string} [options.referrer] - HTTP referrer URL
 * @param {string} [options.userAgent] - Visitor's User-Agent string
 * @param {string} [options.ip] - Visitor's IP address (for geolocation only)
 * @param {string} [options.baseUrl='https://plausible.io'] - Self-hosted base URL
 * @returns {Promise<boolean>} true on success (202), false on failure
 */
export async function trackEvent(domain, eventName, url, options = {}) {
  return _sendEvent(domain, eventName, url, options);
}

/**
 * Internal event sender used by both trackPageview and trackEvent.
 *
 * @param {string} domain
 * @param {string} name
 * @param {string} url
 * @param {object} options
 * @returns {Promise<boolean>}
 */
async function _sendEvent(domain, name, url, options = {}) {
  if (!domain || !name || !url) {
    console.error("[plausible-analytics] trackEvent: domain, name, and url are required");
    return false;
  }

  const { referrer, props, userAgent, ip, revenue, baseUrl = DEFAULT_BASE_URL } = options;

  const payload = { name, url, domain };
  if (referrer) payload.referrer = referrer;
  if (props && typeof props === "object") payload.props = props;
  if (revenue && typeof revenue === "object") payload.revenue = revenue;

  const headers = {
    "Content-Type": "application/json",
  };
  if (userAgent) headers["User-Agent"] = userAgent;
  if (ip) headers["X-Forwarded-For"] = ip;

  try {
    const res = await fetch(`${baseUrl}/api/event`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    // Plausible returns 202 Accepted (no body) on success
    if (res.status === 202) return true;

    const body = await res.text().catch(() => "");
    console.error(
      `[plausible-analytics] Event tracking failed (${res.status}): ${body.slice(0, 200)}`
    );
    return false;
  } catch (err) {
    console.error(`[plausible-analytics] Event tracking error: ${err.message}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Stats API — requires API key
// ---------------------------------------------------------------------------

/**
 * Fetch aggregate statistics for a site over a time period.
 * Wraps GET /api/v1/stats/aggregate. Useful for dashboard widgets and reports.
 *
 * @param {string} apiKey - Plausible API key
 * @param {string} siteId - Site ID (usually the domain, e.g. "example.com")
 * @param {object} [options={}]
 * @param {string} [options.period='30d'] - Time period: '12mo'|'6mo'|'month'|'30d'|'7d'|'day'|'custom'
 * @param {string[]} [options.metrics=['visitors','pageviews','bounce_rate','visit_duration']]
 *   Metrics to include in the response
 * @param {string} [options.filters] - Filter string (see Plausible docs)
 * @param {string} [options.date] - ISO date string for 'day'/'month' periods
 * @param {string} [baseUrl='https://plausible.io'] - Self-hosted base URL
 * @returns {Promise<{results: Record<string, {value: number}>}|null>}
 */
export async function querySiteStats(
  apiKey,
  siteId,
  options = {},
  baseUrl = DEFAULT_BASE_URL
) {
  if (!apiKey || !siteId) {
    console.error("[plausible-analytics] querySiteStats: apiKey and siteId are required");
    return null;
  }

  const {
    period = "30d",
    metrics = ["visitors", "pageviews", "bounce_rate", "visit_duration"],
    filters,
    date,
  } = options;

  const qs = toQueryString({
    site_id: siteId,
    period,
    metrics: Array.isArray(metrics) ? metrics.join(",") : metrics,
    filters: filters || undefined,
    date: date || undefined,
  });

  try {
    const res = await fetch(`${baseUrl}/api/v1/stats/aggregate?${qs}`, {
      headers: authHeaders(apiKey),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[plausible-analytics] querySiteStats error ${res.status}:`, err.error || "");
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error(`[plausible-analytics] querySiteStats failed: ${err.message}`);
    return null;
  }
}

/**
 * Fetch the top pages by visitor count for a site.
 * Wraps GET /api/v1/stats/breakdown?property=event:page.
 *
 * @param {string} apiKey - Plausible API key
 * @param {string} siteId - Site ID / domain
 * @param {object} [options={}]
 * @param {string} [options.period='30d'] - Time period
 * @param {number} [options.limit=10] - Maximum number of pages to return
 * @param {string} [options.filters] - Optional filter string
 * @param {string} [baseUrl='https://plausible.io'] - Self-hosted base URL
 * @returns {Promise<Array<{page: string, visitors: number}>|null>}
 */
export async function listTopPages(apiKey, siteId, options = {}, baseUrl = DEFAULT_BASE_URL) {
  return _breakdown(apiKey, siteId, "event:page", options, baseUrl, (r) => ({
    page: r.page,
    visitors: r.visitors,
  }));
}

/**
 * Fetch the top referral sources by visitor count for a site.
 * Wraps GET /api/v1/stats/breakdown?property=visit:source.
 *
 * @param {string} apiKey - Plausible API key
 * @param {string} siteId - Site ID / domain
 * @param {object} [options={}]
 * @param {string} [options.period='30d'] - Time period
 * @param {number} [options.limit=10] - Maximum results
 * @param {string} [options.filters] - Optional filter string
 * @param {string} [baseUrl='https://plausible.io'] - Self-hosted base URL
 * @returns {Promise<Array<{source: string, visitors: number}>|null>}
 */
export async function listTopSources(apiKey, siteId, options = {}, baseUrl = DEFAULT_BASE_URL) {
  return _breakdown(apiKey, siteId, "visit:source", options, baseUrl, (r) => ({
    source: r.source,
    visitors: r.visitors,
  }));
}

/**
 * Fetch a breakdown of visitors by country.
 * Wraps GET /api/v1/stats/breakdown?property=visit:country.
 * Country codes are ISO 3166-1 alpha-2 (e.g. "US", "DE", "FR").
 *
 * @param {string} apiKey - Plausible API key
 * @param {string} siteId - Site ID / domain
 * @param {object} [options={}]
 * @param {string} [options.period='30d'] - Time period
 * @param {number} [options.limit=10] - Maximum results
 * @param {string} [options.filters] - Optional filter string
 * @param {string} [baseUrl='https://plausible.io'] - Self-hosted base URL
 * @returns {Promise<Array<{country: string, visitors: number}>|null>}
 */
export async function listTopCountries(apiKey, siteId, options = {}, baseUrl = DEFAULT_BASE_URL) {
  return _breakdown(apiKey, siteId, "visit:country", options, baseUrl, (r) => ({
    country: r.country,
    visitors: r.visitors,
  }));
}

/**
 * Fetch a breakdown of goal completions for a site.
 * Wraps GET /api/v1/stats/breakdown?property=event:goal.
 * Goals must be configured in the Plausible dashboard.
 *
 * @param {string} apiKey - Plausible API key
 * @param {string} siteId - Site ID / domain
 * @param {object} [options={}]
 * @param {string} [options.period='30d'] - Time period
 * @param {number} [options.limit=10] - Maximum results
 * @param {string} [baseUrl='https://plausible.io'] - Self-hosted base URL
 * @returns {Promise<Array<{goal: string, visitors: number, events: number}>|null>}
 */
export async function listGoals(apiKey, siteId, options = {}, baseUrl = DEFAULT_BASE_URL) {
  return _breakdown(apiKey, siteId, "event:goal", options, baseUrl, (r) => ({
    goal: r.goal,
    visitors: r.visitors,
    events: r.events ?? r.pageviews ?? 0,
  }));
}

/**
 * Internal helper for all /api/v1/stats/breakdown requests.
 *
 * @param {string} apiKey
 * @param {string} siteId
 * @param {string} property - Breakdown property (e.g. "event:page")
 * @param {object} options
 * @param {string} baseUrl
 * @param {function} mapRow - Transform raw API row to output shape
 * @returns {Promise<Array|null>}
 */
async function _breakdown(apiKey, siteId, property, options, baseUrl, mapRow) {
  if (!apiKey || !siteId) {
    console.error("[plausible-analytics] API key and siteId are required");
    return null;
  }

  const { period = "30d", limit = 10, filters, date } = options;

  const qs = toQueryString({
    site_id: siteId,
    property,
    period,
    limit,
    filters: filters || undefined,
    date: date || undefined,
  });

  try {
    const res = await fetch(`${baseUrl}/api/v1/stats/breakdown?${qs}`, {
      headers: authHeaders(apiKey),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[plausible-analytics] Breakdown (${property}) error ${res.status}:`, err.error || "");
      return null;
    }

    const data = await res.json();
    return (data.results ?? []).map(mapRow);
  } catch (err) {
    console.error(`[plausible-analytics] Breakdown (${property}) failed: ${err.message}`);
    return null;
  }
}

/**
 * Fetch the number of visitors currently active on the site (last 5 minutes).
 * Wraps GET /api/v1/stats/realtime/visitors.
 * Useful for live visitor counters on dashboards.
 *
 * @param {string} apiKey - Plausible API key
 * @param {string} siteId - Site ID / domain
 * @param {string} [baseUrl='https://plausible.io'] - Self-hosted base URL
 * @returns {Promise<number|null>} Active visitor count, or null on error
 */
export async function getRealtimeVisitors(apiKey, siteId, baseUrl = DEFAULT_BASE_URL) {
  if (!apiKey || !siteId) {
    console.error("[plausible-analytics] getRealtimeVisitors: apiKey and siteId are required");
    return null;
  }

  const qs = toQueryString({ site_id: siteId });

  try {
    const res = await fetch(`${baseUrl}/api/v1/stats/realtime/visitors?${qs}`, {
      headers: authHeaders(apiKey),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[plausible-analytics] getRealtimeVisitors error ${res.status}:`, err.error || "");
      return null;
    }

    // API returns a plain integer (e.g. 42) — not a JSON object
    const body = await res.text();
    const count = parseInt(body.trim(), 10);
    return isNaN(count) ? null : count;
  } catch (err) {
    console.error(`[plausible-analytics] getRealtimeVisitors failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sites API
// ---------------------------------------------------------------------------

/**
 * Create a new site in Plausible.
 * Wraps POST /api/v1/sites.
 * The domain must not already exist in your account.
 *
 * @param {string} apiKey - Plausible API key
 * @param {string} domain - The domain to track (e.g. "mynewsite.com")
 * @param {string} [timezone='UTC'] - IANA timezone name (e.g. "America/New_York")
 * @param {string} [baseUrl='https://plausible.io'] - Self-hosted base URL
 * @returns {Promise<{domain: string, timezone: string}|null>} Created site object, or null on error
 */
export async function createSite(apiKey, domain, timezone = "UTC", baseUrl = DEFAULT_BASE_URL) {
  if (!apiKey || !domain) {
    console.error("[plausible-analytics] createSite: apiKey and domain are required");
    return null;
  }

  try {
    const res = await fetch(`${baseUrl}/api/v1/sites`, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify({ domain, timezone }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[plausible-analytics] createSite error ${res.status}:`, err.error || "");
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error(`[plausible-analytics] createSite failed: ${err.message}`);
    return null;
  }
}

/**
 * Fetch details for a specific site.
 * Wraps GET /api/v1/sites/:siteId.
 * Returns metadata including the domain, timezone, and configuration flags.
 *
 * @param {string} apiKey - Plausible API key
 * @param {string} siteId - Site ID (the domain string, e.g. "example.com")
 * @param {string} [baseUrl='https://plausible.io'] - Self-hosted base URL
 * @returns {Promise<object|null>} Site details object, or null on error
 */
export async function getSite(apiKey, siteId, baseUrl = DEFAULT_BASE_URL) {
  if (!apiKey || !siteId) {
    console.error("[plausible-analytics] getSite: apiKey and siteId are required");
    return null;
  }

  try {
    const res = await fetch(
      `${baseUrl}/api/v1/sites/${encodeURIComponent(siteId)}`,
      {
        headers: authHeaders(apiKey),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[plausible-analytics] getSite error ${res.status}:`, err.error || "");
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error(`[plausible-analytics] getSite failed: ${err.message}`);
    return null;
  }
}
