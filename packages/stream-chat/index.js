// Stream Chat API — server-side channel and message management.
// Zero dependencies — uses native fetch and Web Crypto for JWT signing.

const STREAM_API = "https://chat.stream-io-api.com";

/**
 * Generate a JWT token for Stream Chat server auth.
 * Uses Web Crypto HMAC-SHA256.
 *
 * @param {string} secret - STREAM_API_SECRET
 * @param {string} userId - User ID to generate token for (or "server" for server token)
 * @param {boolean} [serverAuth=false] - Generate a server-side auth token
 * @returns {Promise<string>} JWT token
 */
export async function generateUserToken(secret, userId, serverAuth = false) {
  const header = { alg: "HS256", typ: "JWT" };
  const payload = serverAuth
    ? { server: true }
    : { user_id: userId };

  const encode = (obj) => {
    const json = JSON.stringify(obj);
    return btoa(json).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  };

  const headerB64 = encode(header);
  const payloadB64 = encode(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${headerB64}.${payloadB64}.${sigB64}`;
}

/**
 * Make an authenticated request to Stream Chat API.
 * @param {string} apiKey
 * @param {string} secret
 * @param {string} method
 * @param {string} path
 * @param {object} [body]
 * @returns {Promise<object|null>}
 */
async function streamRequest(apiKey, secret, method, path, body) {
  const token = await generateUserToken(secret, "server", true);
  const url = `${STREAM_API}/${path}?api_key=${apiKey}`;

  try {
    const opts = {
      method,
      headers: {
        Authorization: token,
        "stream-auth-type": "jwt",
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15000),
    };
    if (body && method !== "GET") opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[stream-chat] API error ${res.status}:`, err.message || "");
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error(`[stream-chat] Request failed: ${err.message}`);
    return null;
  }
}

/**
 * Create or get a chat channel.
 *
 * @param {string} apiKey - STREAM_API_KEY
 * @param {string} secret - STREAM_API_SECRET
 * @param {object} params
 * @param {string} params.type - Channel type (messaging, livestream, team, etc.)
 * @param {string} [params.id] - Channel ID (auto-generated if omitted)
 * @param {string} params.createdBy - User ID of the channel creator
 * @param {string} [params.name] - Channel display name
 * @param {string[]} [params.members] - Array of user IDs to add
 * @returns {Promise<{channel: object, members: Array}|null>}
 */
export async function createChannel(apiKey, secret, params) {
  const { type, id, createdBy, name, members } = params;
  const path = id ? `channels/${type}/${id}/query` : `channels/${type}/query`;

  const body = {
    data: {
      created_by_id: createdBy,
    },
  };
  if (name) body.data.name = name;
  if (members) body.data.members = members;

  const result = await streamRequest(apiKey, secret, "POST", path, body);
  if (!result) return null;

  return {
    channel: {
      id: result.channel?.id,
      type: result.channel?.type,
      cid: result.channel?.cid,
      name: result.channel?.name,
      createdAt: result.channel?.created_at,
    },
    members: (result.members || []).map((m) => ({
      userId: m.user_id,
      role: m.role,
    })),
  };
}

/**
 * Send a message to a channel.
 *
 * @param {string} apiKey
 * @param {string} secret
 * @param {object} params
 * @param {string} params.channelType - Channel type
 * @param {string} params.channelId - Channel ID
 * @param {string} params.userId - Sender user ID
 * @param {string} params.text - Message text
 * @param {object} [params.attachments] - Message attachments
 * @returns {Promise<{id: string, text: string, createdAt: string}|null>}
 */
export async function sendMessage(apiKey, secret, params) {
  const { channelType, channelId, userId, text, attachments } = params;
  const path = `channels/${channelType}/${channelId}/message`;

  const body = {
    message: {
      text,
      user_id: userId,
    },
  };
  if (attachments) body.message.attachments = attachments;

  const result = await streamRequest(apiKey, secret, "POST", path, body);
  if (!result?.message) return null;

  return {
    id: result.message.id,
    text: result.message.text,
    createdAt: result.message.created_at,
  };
}

/**
 * Get channel info and recent messages.
 *
 * @param {string} apiKey
 * @param {string} secret
 * @param {string} channelType
 * @param {string} channelId
 * @param {number} [messageLimit=25]
 * @returns {Promise<{channel: object, messages: Array}|null>}
 */
export async function getChannel(apiKey, secret, channelType, channelId, messageLimit = 25) {
  const path = `channels/${channelType}/${channelId}/query`;
  const body = {
    messages: { limit: messageLimit },
  };

  const result = await streamRequest(apiKey, secret, "POST", path, body);
  if (!result) return null;

  return {
    channel: {
      id: result.channel?.id,
      type: result.channel?.type,
      name: result.channel?.name,
      memberCount: result.channel?.member_count,
    },
    messages: (result.messages || []).map((m) => ({
      id: m.id,
      text: m.text,
      userId: m.user?.id,
      createdAt: m.created_at,
    })),
  };
}

/**
 * Query users by filter.
 *
 * @param {string} apiKey
 * @param {string} secret
 * @param {object} [filter={}] - Filter conditions (e.g. { id: { $in: ["user1", "user2"] } })
 * @param {object} [sort=[{field: "last_active", direction: -1}]]
 * @param {number} [limit=20]
 * @returns {Promise<Array<{id: string, name: string, online: boolean, lastActive: string}>|null>}
 */
export async function queryUsers(apiKey, secret, filter = {}, sort, limit = 20) {
  const path = "users";
  const body = {
    filter_conditions: filter,
    sort: sort || [{ field: "last_active", direction: -1 }],
    limit,
  };

  const result = await streamRequest(apiKey, secret, "GET", `${path}?payload=${encodeURIComponent(JSON.stringify(body))}`, null);
  if (!result) return null;

  return (result.users || []).map((u) => ({
    id: u.id,
    name: u.name,
    online: u.online,
    lastActive: u.last_active,
  }));
}
