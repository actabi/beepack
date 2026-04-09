// Discord Bot API Client
// Zero dependencies - uses native fetch and Web Crypto API.
// Covers messaging, embeds, webhooks, and interaction signature verification.

const DISCORD_API = "https://discord.com/api/v10";
const TIMEOUT_MS = 15000;

/**
 * Send a message to a Discord channel.
 *
 * @param {string} botToken - Discord bot token
 * @param {string} channelId - Channel ID
 * @param {object} params
 * @param {string} [params.content] - Message text
 * @param {Array} [params.embeds] - Embed objects
 * @param {object} [params.messageReference] - Reply to a message {message_id}
 * @param {boolean} [params.tts=false] - Text-to-speech
 * @returns {Promise<{id: string, channelId: string}|null>}
 */
export async function sendMessage(botToken, channelId, params) {
  const { content, embeds, messageReference, tts = false } = params;

  const body = {};
  if (content) body.content = content;
  if (embeds) body.embeds = embeds;
  if (messageReference) body.message_reference = messageReference;
  if (tts) body.tts = true;

  try {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[discord-bot] Send error ${res.status}:`, err.message || "");
      return null;
    }

    const msg = await res.json();
    return { id: msg.id, channelId: msg.channel_id };
  } catch (err) {
    console.error(`[discord-bot] Send failed: ${err.message}`);
    return null;
  }
}

/**
 * Build a rich embed object.
 *
 * @param {object} params
 * @param {string} [params.title] - Embed title
 * @param {string} [params.description] - Embed description (markdown supported)
 * @param {string} [params.url] - Title hyperlink
 * @param {number} [params.color] - Side color (decimal, e.g. 0x5865F2)
 * @param {Array<{name: string, value: string, inline?: boolean}>} [params.fields] - Fields
 * @param {string} [params.thumbnail] - Thumbnail URL
 * @param {string} [params.image] - Image URL
 * @param {{text: string, iconUrl?: string}} [params.footer] - Footer
 * @param {string} [params.timestamp] - ISO 8601 timestamp
 * @returns {object} Discord embed object
 */
export function buildEmbed(params) {
  const embed = {};
  if (params.title) embed.title = params.title;
  if (params.description) embed.description = params.description;
  if (params.url) embed.url = params.url;
  if (params.color != null) embed.color = params.color;
  if (params.fields) embed.fields = params.fields;
  if (params.thumbnail) embed.thumbnail = { url: params.thumbnail };
  if (params.image) embed.image = { url: params.image };
  if (params.footer) embed.footer = { text: params.footer.text, icon_url: params.footer.iconUrl };
  if (params.timestamp) embed.timestamp = params.timestamp;
  return embed;
}

/**
 * Execute a Discord webhook (no bot token needed).
 *
 * @param {string} webhookUrl - Discord webhook URL
 * @param {object} params
 * @param {string} [params.content] - Message text
 * @param {string} [params.username] - Override webhook username
 * @param {string} [params.avatarUrl] - Override webhook avatar
 * @param {Array} [params.embeds] - Embed objects
 * @returns {Promise<boolean>} true if sent
 */
export async function executeWebhook(webhookUrl, params) {
  const { content, username, avatarUrl, embeds } = params;

  const body = {};
  if (content) body.content = content;
  if (username) body.username = username;
  if (avatarUrl) body.avatar_url = avatarUrl;
  if (embeds) body.embeds = embeds;

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok || res.status === 204;
  } catch (err) {
    console.error(`[discord-bot] Webhook failed: ${err.message}`);
    return false;
  }
}

/**
 * Verify a Discord interaction signature (for slash commands).
 * Required for handling interactions via HTTP endpoint.
 *
 * @param {string} publicKey - Application public key (hex)
 * @param {string} signature - X-Signature-Ed25519 header
 * @param {string} timestamp - X-Signature-Timestamp header
 * @param {string} body - Raw request body
 * @returns {Promise<boolean>} true if signature is valid
 */
export async function verifyInteraction(publicKey, signature, timestamp, body) {
  try {
    const publicKeyBytes = hexToBytes(publicKey);
    const signatureBytes = hexToBytes(signature);
    const message = new TextEncoder().encode(timestamp + body);

    const key = await crypto.subtle.importKey(
      "raw",
      publicKeyBytes,
      { name: "Ed25519" },
      false,
      ["verify"]
    );

    return await crypto.subtle.verify("Ed25519", key, signatureBytes, message);
  } catch (err) {
    console.error(`[discord-bot] Verification failed: ${err.message}`);
    return false;
  }
}

/**
 * Get channel information.
 *
 * @param {string} botToken - Discord bot token
 * @param {string} channelId - Channel ID
 * @returns {Promise<{id: string, name: string, type: number, guildId: string}|null>}
 */
export async function getChannel(botToken, channelId) {
  try {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}`, {
      headers: { Authorization: `Bot ${botToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) return null;
    const ch = await res.json();
    return { id: ch.id, name: ch.name, type: ch.type, guildId: ch.guild_id };
  } catch (err) {
    console.error(`[discord-bot] Get channel failed: ${err.message}`);
    return null;
  }
}

/**
 * Add a reaction to a message.
 *
 * @param {string} botToken - Discord bot token
 * @param {string} channelId - Channel ID
 * @param {string} messageId - Message ID
 * @param {string} emoji - URL-encoded emoji (e.g. "%F0%9F%91%8D" for thumbs up, or "custom:123456")
 * @returns {Promise<boolean>}
 */
export async function addReaction(botToken, channelId, messageId, emoji) {
  try {
    const res = await fetch(
      `${DISCORD_API}/channels/${channelId}/messages/${messageId}/reactions/${emoji}/@me`,
      {
        method: "PUT",
        headers: { Authorization: `Bot ${botToken}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );
    return res.ok || res.status === 204;
  } catch (err) {
    console.error(`[discord-bot] Reaction failed: ${err.message}`);
    return false;
  }
}

// --- Helpers ---

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}
