// PostHog Analytics
// Zero dependencies - uses native fetch only.
// Covers: event capture, user identification, feature flags (client + server),
// session recording opt-in, group analytics for B2B, Next.js middleware.

const DEFAULT_HOST = "https://app.posthog.com";
const TIMEOUT_MS = 15_000;

/**
 * Resolve the PostHog host, stripping any trailing slash.
 * Falls back to process.env.POSTHOG_HOST and then the default.
 *
 * @param {string} [host]
 * @returns {string}
 */
function resolveHost(host) {
  return (host || process.env.POSTHOG_HOST || DEFAULT_HOST).replace(/\/$/, "");
}

/**
 * Resolve the PostHog API key.
 *
 * @param {string} [apiKey]
 * @returns {string}
 */
function resolveKey(apiKey) {
  return apiKey || process.env.POSTHOG_API_KEY || "";
}

/**
 * POST to the PostHog batch endpoint.
 * Returns null on network error or non-OK response.
 *
 * @param {string} host
 * @param {object} body
 * @returns {Promise<object|null>}
 */
async function post(host, body) {
  try {
    const res = await fetch(`${host}/batch/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[posthog-analytics] Batch API error ${res.status}: ${text}`);
      return null;
    }
    return await res.json().catch(() => ({}));
  } catch (err) {
    console.error(`[posthog-analytics] Request failed: ${err.message}`);
    return null;
  }
}

/**
 * Capture one or more events in a single batch call.
 *
 * @param {object} params
 * @param {string} params.distinctId - The user's unique identifier
 * @param {string} params.event - Event name (e.g. "page_view", "button_clicked")
 * @param {object} [params.properties] - Arbitrary event properties
 * @param {string} [params.timestamp] - ISO 8601 timestamp (defaults to now)
 * @param {string} [params.apiKey] - Override POSTHOG_API_KEY env var
 * @param {string} [params.host] - Override POSTHOG_HOST env var
 * @returns {Promise<object|null>} PostHog response or null on error
 */
export async function captureEvent({ distinctId, event, properties = {}, timestamp, apiKey, host }) {
  const key = resolveKey(apiKey);
  if (!key) {
    console.error("[posthog-analytics] Missing API key. Set POSTHOG_API_KEY or pass apiKey.");
    return null;
  }

  return post(resolveHost(host), {
    api_key: key,
    batch: [
      {
        type: "capture",
        distinct_id: distinctId,
        event,
        properties: { $lib: "posthog-analytics-beepack", ...properties },
        timestamp: timestamp || new Date().toISOString(),
      },
    ],
  });
}

/**
 * Identify a user and set or update their profile properties.
 * Sends a PostHog `$identify` event with `$set` traits.
 *
 * @param {object} params
 * @param {string} params.distinctId - The user's unique identifier
 * @param {object} [params.traits] - Profile properties (name, email, plan, etc.)
 * @param {string} [params.anonymousId] - Previous anonymous ID to alias
 * @param {string} [params.apiKey]
 * @param {string} [params.host]
 * @returns {Promise<object|null>}
 */
export async function identifyUser({ distinctId, traits = {}, anonymousId, apiKey, host }) {
  const key = resolveKey(apiKey);
  if (!key) {
    console.error("[posthog-analytics] Missing API key. Set POSTHOG_API_KEY or pass apiKey.");
    return null;
  }

  const batch = [
    {
      type: "capture",
      distinct_id: distinctId,
      event: "$identify",
      properties: {
        $lib: "posthog-analytics-beepack",
        $set: traits,
        ...(anonymousId ? { $anon_distinct_id: anonymousId } : {}),
      },
      timestamp: new Date().toISOString(),
    },
  ];

  return post(resolveHost(host), { api_key: key, batch });
}

/**
 * Evaluate a feature flag for a given user via the PostHog Decide API.
 * Works server-side (no browser SDK required).
 *
 * @param {object} params
 * @param {string} params.distinctId - The user's unique identifier
 * @param {string} params.flag - Feature flag key to evaluate
 * @param {object} [params.personProperties] - Properties for flag targeting rules
 * @param {object} [params.groupProperties] - Group properties for flag targeting
 * @param {string} [params.apiKey]
 * @param {string} [params.host]
 * @returns {Promise<boolean|string|null>} Flag value, or null on error
 */
export async function evaluateFeatureFlag({ distinctId, flag, personProperties = {}, groupProperties = {}, apiKey, host }) {
  const key = resolveKey(apiKey);
  if (!key) {
    console.error("[posthog-analytics] Missing API key. Set POSTHOG_API_KEY or pass apiKey.");
    return null;
  }

  try {
    const res = await fetch(`${resolveHost(host)}/decide/?v=3`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        distinct_id: distinctId,
        person_properties: personProperties,
        groups: groupProperties,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error(`[posthog-analytics] Decide API error ${res.status}`);
      return null;
    }

    const data = await res.json();
    const flags = data.featureFlags || {};
    return flags[flag] ?? null;
  } catch (err) {
    console.error(`[posthog-analytics] Feature flag evaluation failed: ${err.message}`);
    return null;
  }
}

/**
 * Evaluate all active feature flags for a user in one Decide call.
 * Useful for bootstrapping flags client-side via a server route.
 *
 * @param {object} params
 * @param {string} params.distinctId
 * @param {object} [params.personProperties]
 * @param {object} [params.groupProperties]
 * @param {string} [params.apiKey]
 * @param {string} [params.host]
 * @returns {Promise<Record<string, boolean|string>|null>} Map of flag key to value, or null on error
 */
export async function getAllFeatureFlags({ distinctId, personProperties = {}, groupProperties = {}, apiKey, host }) {
  const key = resolveKey(apiKey);
  if (!key) {
    console.error("[posthog-analytics] Missing API key. Set POSTHOG_API_KEY or pass apiKey.");
    return null;
  }

  try {
    const res = await fetch(`${resolveHost(host)}/decide/?v=3`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        distinct_id: distinctId,
        person_properties: personProperties,
        groups: groupProperties,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error(`[posthog-analytics] Decide API error ${res.status}`);
      return null;
    }

    const data = await res.json();
    return data.featureFlags || {};
  } catch (err) {
    console.error(`[posthog-analytics] getAllFeatureFlags failed: ${err.message}`);
    return null;
  }
}

/**
 * Opt a user into or out of session recording.
 * Sends a `$opt_in_to_session_recording` or `$opt_out_of_session_recording` event.
 *
 * @param {object} params
 * @param {string} params.distinctId
 * @param {boolean} [params.optIn=true] - true = opt in, false = opt out
 * @param {string} [params.apiKey]
 * @param {string} [params.host]
 * @returns {Promise<object|null>}
 */
export async function setSessionRecording({ distinctId, optIn = true, apiKey, host }) {
  const event = optIn ? "$opt_in_to_session_recording" : "$opt_out_of_session_recording";
  return captureEvent({ distinctId, event, properties: {}, apiKey, host });
}

/**
 * Associate a user with a group for B2B analytics (org, company, workspace, etc.).
 * Sends a PostHog `$groupidentify` event, optionally updating group properties.
 *
 * @param {object} params
 * @param {string} params.distinctId - User performing the association
 * @param {string} params.groupType - Type of group (e.g. "company", "organization")
 * @param {string} params.groupKey - Unique key for this group instance
 * @param {object} [params.groupProperties] - Traits for the group (name, plan, size, etc.)
 * @param {string} [params.apiKey]
 * @param {string} [params.host]
 * @returns {Promise<object|null>}
 */
export async function associateGroup({ distinctId, groupType, groupKey, groupProperties = {}, apiKey, host }) {
  const key = resolveKey(apiKey);
  if (!key) {
    console.error("[posthog-analytics] Missing API key. Set POSTHOG_API_KEY or pass apiKey.");
    return null;
  }

  return post(resolveHost(host), {
    api_key: key,
    batch: [
      {
        type: "capture",
        distinct_id: distinctId,
        event: "$groupidentify",
        properties: {
          $lib: "posthog-analytics-beepack",
          $group_type: groupType,
          $group_key: groupKey,
          $group_set: groupProperties,
        },
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

/**
 * Capture an event attributed to a group (B2B group analytics).
 * The event appears in PostHog under both the user and the group.
 *
 * @param {object} params
 * @param {string} params.distinctId
 * @param {string} params.event
 * @param {string} params.groupType - e.g. "company"
 * @param {string} params.groupKey - e.g. "acme-corp"
 * @param {object} [params.properties]
 * @param {string} [params.apiKey]
 * @param {string} [params.host]
 * @returns {Promise<object|null>}
 */
export async function captureGroupEvent({ distinctId, event, groupType, groupKey, properties = {}, apiKey, host }) {
  return captureEvent({
    distinctId,
    event,
    properties: {
      ...properties,
      $groups: { [groupType]: groupKey },
    },
    apiKey,
    host,
  });
}

/**
 * Build a Next.js middleware handler that injects PostHog feature flags
 * into response headers for use during SSR.
 *
 * The middleware evaluates all flags server-side and sets:
 *   X-PostHog-Flags: <JSON string of { flagKey: value }>
 *
 * Usage in middleware.js:
 *   export { posthogMiddleware as middleware }
 *   export const config = { matcher: ['/((?!_next|favicon).*)'] }
 *
 * @param {object} [options]
 * @param {(req: Request) => string} [options.getDistinctId] - Extract user ID from request (defaults to cookie "ph_distinct_id")
 * @param {(req: Request) => object} [options.getPersonProperties] - Extract targeting properties from request
 * @param {string} [options.apiKey]
 * @param {string} [options.host]
 * @returns {(req: Request) => Promise<Response>} Next.js-compatible middleware function
 */
export function createPostHogMiddleware(options = {}) {
  const {
    getDistinctId = (req) => {
      const cookie = req.headers.get("cookie") || "";
      const match = cookie.match(/ph_distinct_id=([^;]+)/);
      return match ? decodeURIComponent(match[1]) : `anon-${Math.random().toString(36).slice(2)}`;
    },
    getPersonProperties = () => ({}),
    apiKey,
    host,
  } = options;

  return async function posthogMiddleware(req) {
    const { NextResponse } = await import("next/server");

    const distinctId = getDistinctId(req);
    const personProperties = getPersonProperties(req);

    const flags = await getAllFeatureFlags({ distinctId, personProperties, apiKey, host });

    const res = NextResponse.next();
    if (flags) {
      res.headers.set("X-PostHog-Flags", JSON.stringify(flags));
    }
    // Persist anonymous ID so subsequent requests resolve to the same user
    if (!req.cookies?.get("ph_distinct_id")) {
      res.cookies.set("ph_distinct_id", distinctId, { path: "/", sameSite: "lax" });
    }

    return res;
  };
}
