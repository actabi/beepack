// Mux Video API — upload, manage, and stream video assets.
// Zero dependencies — uses native fetch with Basic auth.

const MUX_API = "https://api.mux.com/video/v1";

/**
 * Build authorization header for Mux API.
 * @param {string} tokenId - MUX_TOKEN_ID
 * @param {string} tokenSecret - MUX_TOKEN_SECRET
 * @returns {string}
 */
function authHeader(tokenId, tokenSecret) {
  return "Basic " + btoa(`${tokenId}:${tokenSecret}`);
}

/**
 * Create a new video asset from a URL.
 *
 * @param {string} tokenId - Mux access token ID
 * @param {string} tokenSecret - Mux access token secret
 * @param {object} params
 * @param {string} params.url - Public URL of the video file
 * @param {"public"|"signed"} [params.playbackPolicy="public"] - Playback policy
 * @param {boolean} [params.mp4Support=false] - Enable static MP4 renditions
 * @param {object} [params.passthrough] - Custom metadata string
 * @returns {Promise<{id: string, status: string, playbackIds: Array<{id: string, policy: string}>}|null>}
 */
export async function createAsset(tokenId, tokenSecret, params) {
  const { url, playbackPolicy = "public", mp4Support = false, passthrough } = params;

  const body = {
    input: [{ url }],
    playback_policy: [playbackPolicy],
    mp4_support: mp4Support ? "standard" : "none",
  };
  if (passthrough) body.passthrough = String(passthrough);

  try {
    const res = await fetch(`${MUX_API}/assets`, {
      method: "POST",
      headers: {
        Authorization: authHeader(tokenId, tokenSecret),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[mux-video] Create asset error ${res.status}:`, err.error?.messages || "");
      return null;
    }

    const { data } = await res.json();
    return {
      id: data.id,
      status: data.status,
      playbackIds: (data.playback_ids || []).map((p) => ({ id: p.id, policy: p.policy })),
    };
  } catch (err) {
    console.error(`[mux-video] Create asset failed: ${err.message}`);
    return null;
  }
}

/**
 * Get a video asset by ID.
 *
 * @param {string} tokenId
 * @param {string} tokenSecret
 * @param {string} assetId - Mux asset ID
 * @returns {Promise<{id: string, status: string, duration: number, playbackIds: Array, createdAt: string}|null>}
 */
export async function getAsset(tokenId, tokenSecret, assetId) {
  try {
    const res = await fetch(`${MUX_API}/assets/${assetId}`, {
      headers: { Authorization: authHeader(tokenId, tokenSecret) },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;

    const { data } = await res.json();
    return {
      id: data.id,
      status: data.status,
      duration: data.duration,
      playbackIds: (data.playback_ids || []).map((p) => ({ id: p.id, policy: p.policy })),
      createdAt: data.created_at,
    };
  } catch (err) {
    console.error(`[mux-video] Get asset failed: ${err.message}`);
    return null;
  }
}

/**
 * List video assets with pagination.
 *
 * @param {string} tokenId
 * @param {string} tokenSecret
 * @param {object} [options]
 * @param {number} [options.limit=25]
 * @param {number} [options.page=1]
 * @returns {Promise<Array<{id: string, status: string, duration: number, createdAt: string}>|null>}
 */
export async function listAssets(tokenId, tokenSecret, options = {}) {
  const { limit = 25, page = 1 } = options;
  const params = new URLSearchParams({ limit: String(limit), page: String(page) });

  try {
    const res = await fetch(`${MUX_API}/assets?${params}`, {
      headers: { Authorization: authHeader(tokenId, tokenSecret) },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;

    const { data } = await res.json();
    return data.map((a) => ({
      id: a.id,
      status: a.status,
      duration: a.duration,
      createdAt: a.created_at,
    }));
  } catch (err) {
    console.error(`[mux-video] List assets failed: ${err.message}`);
    return null;
  }
}

/**
 * Create a direct upload URL for client-side video uploads.
 *
 * @param {string} tokenId
 * @param {string} tokenSecret
 * @param {object} [params]
 * @param {"public"|"signed"} [params.playbackPolicy="public"]
 * @param {string} [params.corsOrigin="*"] - Allowed CORS origin
 * @param {number} [params.timeout=3600] - Upload timeout in seconds
 * @returns {Promise<{uploadId: string, url: string, assetId: string}|null>}
 */
export async function createUploadUrl(tokenId, tokenSecret, params = {}) {
  const { playbackPolicy = "public", corsOrigin = "*", timeout = 3600 } = params;

  try {
    const res = await fetch(`${MUX_API}/uploads`, {
      method: "POST",
      headers: {
        Authorization: authHeader(tokenId, tokenSecret),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cors_origin: corsOrigin,
        new_asset_settings: { playback_policy: [playbackPolicy] },
        timeout,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;

    const { data } = await res.json();
    return {
      uploadId: data.id,
      url: data.url,
      assetId: data.asset_id,
    };
  } catch (err) {
    console.error(`[mux-video] Create upload failed: ${err.message}`);
    return null;
  }
}

/**
 * Add a playback ID to an existing asset.
 *
 * @param {string} tokenId
 * @param {string} tokenSecret
 * @param {string} assetId
 * @param {"public"|"signed"} [policy="public"]
 * @returns {Promise<{id: string, policy: string}|null>}
 */
export async function createPlaybackId(tokenId, tokenSecret, assetId, policy = "public") {
  try {
    const res = await fetch(`${MUX_API}/assets/${assetId}/playback-ids`, {
      method: "POST",
      headers: {
        Authorization: authHeader(tokenId, tokenSecret),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ policy }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;

    const { data } = await res.json();
    return { id: data.id, policy: data.policy };
  } catch (err) {
    console.error(`[mux-video] Create playback ID failed: ${err.message}`);
    return null;
  }
}
