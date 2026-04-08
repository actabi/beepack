// Supabase Client
// Zero dependencies - uses native fetch with the Supabase REST and Auth APIs.
// Handles the hard parts: RLS-aware inserts, session hydration on server-side,
// real-time subscription lifecycle, and storage presigned URLs.

const TIMEOUT_MS = 15000;

// --- CRUD (PostgREST) ---

/**
 * Select rows from a Supabase table via the PostgREST API.
 * Respects RLS automatically when `accessToken` is provided.
 *
 * @param {object} config
 * @param {string} config.url - Supabase project URL (SUPABASE_URL)
 * @param {string} config.anonKey - Supabase anon key (SUPABASE_ANON_KEY)
 * @param {string} [config.accessToken] - JWT from getSession(); required for RLS-restricted reads
 * @param {string} config.table - Table name
 * @param {string} [config.select="*"] - Column selector (PostgREST syntax)
 * @param {object} [config.filters] - Key-value equality filters, e.g. { user_id: "uuid" }
 * @param {object} [config.order] - { column: string, ascending?: boolean }
 * @param {number} [config.limit] - Max rows to return
 * @returns {Promise<Array<object>|null>}
 */
export async function selectRows(config) {
  const { url, anonKey, accessToken, table, select = "*", filters, order, limit } = config;

  const params = new URLSearchParams({ select });
  if (filters) {
    for (const [col, val] of Object.entries(filters)) {
      params.set(`${col}`, `eq.${val}`);
    }
  }
  if (order) {
    params.set("order", `${order.column}.${order.ascending === false ? "desc" : "asc"}`);
  }
  if (limit != null) {
    params.set("limit", String(limit));
  }

  try {
    const res = await fetch(`${url}/rest/v1/${table}?${params}`, {
      headers: buildHeaders(anonKey, accessToken),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[supabase-client] selectRows error ${res.status}:`, err.message || err.hint || "");
      return null;
    }
    return res.json();
  } catch (err) {
    console.error(`[supabase-client] selectRows failed: ${err.message}`);
    return null;
  }
}

/**
 * Insert one or more rows into a Supabase table.
 * RLS note: if your policy requires auth.uid(), you MUST pass accessToken.
 * Without it, the anon key is used and RLS will block the insert.
 *
 * @param {object} config
 * @param {string} config.url
 * @param {string} config.anonKey
 * @param {string} [config.accessToken] - Required when table has RLS insert policies
 * @param {string} config.table
 * @param {object|Array<object>} config.rows - Row or array of rows to insert
 * @param {boolean} [config.upsert=false] - Use upsert (ON CONFLICT DO UPDATE)
 * @returns {Promise<Array<object>|null>} Inserted rows or null on error
 */
export async function insertRows(config) {
  const { url, anonKey, accessToken, table, rows, upsert = false } = config;

  const headers = {
    ...buildHeaders(anonKey, accessToken),
    "Content-Type": "application/json",
    Prefer: upsert ? "return=representation,resolution=merge-duplicates" : "return=representation",
  };

  try {
    const res = await fetch(`${url}/rest/v1/${table}`, {
      method: upsert ? "POST" : "POST",
      headers,
      body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      // Common failure: RLS blocking insert because auth.uid() is null
      if (res.status === 403 || (err.code === "42501")) {
        console.error(
          `[supabase-client] insertRows blocked by RLS (status ${res.status}). ` +
          "Did you forget to pass accessToken? auth.uid() will be null without it."
        );
      } else {
        console.error(`[supabase-client] insertRows error ${res.status}:`, err.message || err.hint || "");
      }
      return null;
    }
    return res.json();
  } catch (err) {
    console.error(`[supabase-client] insertRows failed: ${err.message}`);
    return null;
  }
}

/**
 * Update rows matching the given filters.
 *
 * @param {object} config
 * @param {string} config.url
 * @param {string} config.anonKey
 * @param {string} [config.accessToken]
 * @param {string} config.table
 * @param {object} config.filters - Equality filters to identify rows (e.g. { id: "uuid" })
 * @param {object} config.patch - Fields to update
 * @returns {Promise<Array<object>|null>} Updated rows or null on error
 */
export async function updateRows(config) {
  const { url, anonKey, accessToken, table, filters, patch } = config;

  const params = new URLSearchParams();
  for (const [col, val] of Object.entries(filters)) {
    params.set(`${col}`, `eq.${val}`);
  }

  try {
    const res = await fetch(`${url}/rest/v1/${table}?${params}`, {
      method: "PATCH",
      headers: {
        ...buildHeaders(anonKey, accessToken),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(patch),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[supabase-client] updateRows error ${res.status}:`, err.message || err.hint || "");
      return null;
    }
    return res.json();
  } catch (err) {
    console.error(`[supabase-client] updateRows failed: ${err.message}`);
    return null;
  }
}

/**
 * Delete rows matching the given filters.
 *
 * @param {object} config
 * @param {string} config.url
 * @param {string} config.anonKey
 * @param {string} [config.accessToken]
 * @param {string} config.table
 * @param {object} config.filters - Equality filters to identify rows (e.g. { id: "uuid" })
 * @returns {Promise<boolean>} true on success, false on error
 */
export async function deleteRows(config) {
  const { url, anonKey, accessToken, table, filters } = config;

  const params = new URLSearchParams();
  for (const [col, val] of Object.entries(filters)) {
    params.set(`${col}`, `eq.${val}`);
  }

  try {
    const res = await fetch(`${url}/rest/v1/${table}?${params}`, {
      method: "DELETE",
      headers: buildHeaders(anonKey, accessToken),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[supabase-client] deleteRows error ${res.status}:`, err.message || err.hint || "");
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[supabase-client] deleteRows failed: ${err.message}`);
    return false;
  }
}

// --- Auth ---

/**
 * Sign in with email and password.
 *
 * @param {object} config
 * @param {string} config.url
 * @param {string} config.anonKey
 * @param {string} config.email
 * @param {string} config.password
 * @returns {Promise<{accessToken: string, refreshToken: string, expiresAt: number, user: object}|null>}
 */
export async function signIn(config) {
  const { url, anonKey, email, password } = config;

  try {
    const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
      },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[supabase-client] signIn error ${res.status}:`, err.error_description || err.msg || "");
      return null;
    }

    const data = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
      user: data.user,
    };
  } catch (err) {
    console.error(`[supabase-client] signIn failed: ${err.message}`);
    return null;
  }
}

/**
 * Sign out and invalidate the current session.
 *
 * @param {object} config
 * @param {string} config.url
 * @param {string} config.anonKey
 * @param {string} config.accessToken
 * @returns {Promise<boolean>}
 */
export async function signOut(config) {
  const { url, anonKey, accessToken } = config;

  try {
    const res = await fetch(`${url}/auth/v1/logout`, {
      method: "POST",
      headers: buildHeaders(anonKey, accessToken),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok || res.status === 204;
  } catch (err) {
    console.error(`[supabase-client] signOut failed: ${err.message}`);
    return false;
  }
}

/**
 * Get the current user from an access token.
 * Server-side note: you must call this (or refreshToken) to hydrate session context.
 * Skipping this step means auth.uid() is null in RLS policies.
 *
 * @param {object} config
 * @param {string} config.url
 * @param {string} config.anonKey
 * @param {string} config.accessToken
 * @returns {Promise<{id: string, email: string, role: string, createdAt: string, userMetadata: object}|null>}
 */
export async function getSession(config) {
  const { url, anonKey, accessToken } = config;

  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: buildHeaders(anonKey, accessToken),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      if (res.status === 401) {
        console.error("[supabase-client] getSession: token is expired or invalid. Call refreshToken() to renew.");
      }
      return null;
    }

    const user = await res.json();
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.created_at,
      userMetadata: user.user_metadata || {},
    };
  } catch (err) {
    console.error(`[supabase-client] getSession failed: ${err.message}`);
    return null;
  }
}

/**
 * Refresh an access token using a refresh token.
 * Use this when accessToken has expired (getSession returns null with 401).
 *
 * @param {object} config
 * @param {string} config.url
 * @param {string} config.anonKey
 * @param {string} config.refreshToken
 * @returns {Promise<{accessToken: string, refreshToken: string, expiresAt: number}|null>}
 */
export async function refreshToken(config) {
  const { url, anonKey, refreshToken: token } = config;

  try {
    const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
      },
      body: JSON.stringify({ refresh_token: token }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[supabase-client] refreshToken error ${res.status}:`, err.error_description || err.msg || "");
      return null;
    }

    const data = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
    };
  } catch (err) {
    console.error(`[supabase-client] refreshToken failed: ${err.message}`);
    return null;
  }
}

// --- Real-time ---

/**
 * Subscribe to real-time changes on a Supabase table via WebSocket.
 * Returns an object with an `unsubscribe()` method — call it on component unmount
 * to avoid memory leaks and dangling connections.
 *
 * @param {object} config
 * @param {string} config.url - Supabase project URL
 * @param {string} config.anonKey
 * @param {string} [config.accessToken] - Pass for authenticated channels
 * @param {string} config.table - Table to listen on
 * @param {string} [config.event="*"] - "INSERT"|"UPDATE"|"DELETE"|"*"
 * @param {string} [config.schema="public"]
 * @param {string} [config.filter] - PostgREST filter string e.g. "user_id=eq.uuid"
 * @param {function} config.onMessage - Called with each change payload
 * @param {function} [config.onError] - Called with error message
 * @returns {{ unsubscribe: function }}
 */
export function subscribeToTable(config) {
  const {
    url,
    anonKey,
    accessToken,
    table,
    event = "*",
    schema = "public",
    filter,
    onMessage,
    onError,
  } = config;

  const wsUrl = url.replace(/^https?/, (m) => (m === "https" ? "wss" : "ws"));
  const params = new URLSearchParams({ apikey: anonKey });
  const ws = new WebSocket(`${wsUrl}/realtime/v1/websocket?${params}`);

  let heartbeat = null;
  let subscribed = false;
  let closed = false;

  ws.addEventListener("open", () => {
    // Join the channel
    const joinPayload = {
      topic: `realtime:${schema}:${table}`,
      event: "phx_join",
      payload: {
        config: {
          broadcast: { self: false },
          presence: { key: "" },
          postgres_changes: [
            {
              event,
              schema,
              table,
              ...(filter ? { filter } : {}),
            },
          ],
        },
        ...(accessToken ? { access_token: accessToken } : {}),
      },
      ref: "1",
    };
    ws.send(JSON.stringify(joinPayload));

    // Heartbeat every 30s to keep connection alive
    heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: null }));
      }
    }, 30000);
  });

  ws.addEventListener("message", ({ data }) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    if (msg.event === "phx_reply" && msg.payload?.status === "ok") {
      subscribed = true;
      return;
    }

    if (msg.event === "postgres_changes" && msg.payload?.data) {
      onMessage(msg.payload.data);
    }
  });

  ws.addEventListener("error", (e) => {
    if (onError) onError(e.message || "WebSocket error");
    else console.error("[supabase-client] Realtime WebSocket error");
  });

  ws.addEventListener("close", () => {
    clearInterval(heartbeat);
    if (!closed && onError) onError("WebSocket closed unexpectedly");
  });

  return {
    /**
     * Unsubscribe and close the WebSocket channel.
     * Call this on component unmount to prevent leaks.
     */
    unsubscribe() {
      closed = true;
      clearInterval(heartbeat);
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1000, "unsubscribed");
      }
    },
  };
}

// --- Storage ---

/**
 * Upload a file to a Supabase Storage bucket.
 *
 * @param {object} config
 * @param {string} config.url
 * @param {string} config.anonKey
 * @param {string} [config.accessToken] - Required for private buckets
 * @param {string} config.bucket - Bucket name
 * @param {string} config.path - Object path within the bucket, e.g. "avatars/user-1.png"
 * @param {Blob|File|ArrayBuffer|Uint8Array} config.file - File content
 * @param {string} [config.contentType="application/octet-stream"]
 * @param {boolean} [config.upsert=false] - Overwrite if exists
 * @returns {Promise<{key: string, fullPath: string}|null>}
 */
export async function uploadFile(config) {
  const {
    url,
    anonKey,
    accessToken,
    bucket,
    path,
    file,
    contentType = "application/octet-stream",
    upsert = false,
  } = config;

  try {
    const res = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
      method: "POST",
      headers: {
        ...buildHeaders(anonKey, accessToken),
        "Content-Type": contentType,
        "x-upsert": upsert ? "true" : "false",
      },
      body: file,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[supabase-client] uploadFile error ${res.status}:`, err.message || err.error || "");
      return null;
    }

    const data = await res.json();
    return {
      key: data.Key || `${bucket}/${path}`,
      fullPath: `${url}/storage/v1/object/public/${bucket}/${path}`,
    };
  } catch (err) {
    console.error(`[supabase-client] uploadFile failed: ${err.message}`);
    return null;
  }
}

/**
 * Create a presigned URL for temporary access to a private storage object.
 *
 * @param {object} config
 * @param {string} config.url
 * @param {string} config.anonKey
 * @param {string} config.accessToken - Required; presigned URLs need auth
 * @param {string} config.bucket
 * @param {string} config.path - Object path within the bucket
 * @param {number} [config.expiresIn=3600] - Seconds until the URL expires
 * @returns {Promise<{signedUrl: string, expiresAt: string}|null>}
 */
export async function createPresignedUrl(config) {
  const { url, anonKey, accessToken, bucket, path, expiresIn = 3600 } = config;

  try {
    const res = await fetch(`${url}/storage/v1/object/sign/${bucket}/${path}`, {
      method: "POST",
      headers: {
        ...buildHeaders(anonKey, accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[supabase-client] createPresignedUrl error ${res.status}:`, err.message || err.error || "");
      return null;
    }

    const data = await res.json();
    const signedUrl = `${url}/storage/v1${data.signedURL}`;
    return {
      signedUrl,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  } catch (err) {
    console.error(`[supabase-client] createPresignedUrl failed: ${err.message}`);
    return null;
  }
}

// --- Helpers ---

/**
 * Build standard Supabase request headers.
 * @param {string} anonKey
 * @param {string} [accessToken]
 * @returns {object}
 */
function buildHeaders(anonKey, accessToken) {
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken || anonKey}`,
  };
  return headers;
}
