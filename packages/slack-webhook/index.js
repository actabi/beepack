// Slack Webhook + Web API Client
// Zero dependencies - uses native fetch.
// Covers the two most common patterns: incoming webhooks and bot token messaging.

const SLACK_API = "https://slack.com/api";
const TIMEOUT_MS = 15000;

/**
 * Send a message via Slack Incoming Webhook.
 * Simplest integration - no bot token needed.
 *
 * @param {string} webhookUrl - Slack webhook URL
 * @param {object} params
 * @param {string} [params.text] - Plain text message (fallback for notifications)
 * @param {Array} [params.blocks] - Block Kit blocks
 * @param {string} [params.username] - Override bot username
 * @param {string} [params.iconEmoji] - Override bot icon (e.g. ":robot_face:")
 * @param {boolean} [params.unfurlLinks=false] - Unfurl links in the message
 * @returns {Promise<boolean>} true if sent successfully
 */
export async function sendWebhook(webhookUrl, params) {
  const { text, blocks, username, iconEmoji, unfurlLinks = false } = params;

  const body = {};
  if (text) body.text = text;
  if (blocks) body.blocks = blocks;
  if (username) body.username = username;
  if (iconEmoji) body.icon_emoji = iconEmoji;
  body.unfurl_links = unfurlLinks;

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error(`[slack-webhook] Webhook error ${res.status}: ${await res.text().catch(() => "")}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[slack-webhook] Webhook failed: ${err.message}`);
    return false;
  }
}

/**
 * Send a message to a Slack channel using the Web API (bot token required).
 *
 * @param {string} botToken - Slack bot token (xoxb-...)
 * @param {object} params
 * @param {string} params.channel - Channel ID (C...) or name
 * @param {string} [params.text] - Plain text (used as notification fallback)
 * @param {Array} [params.blocks] - Block Kit blocks
 * @param {string} [params.threadTs] - Thread timestamp (for replies)
 * @param {boolean} [params.replyBroadcast=false] - Also send to channel when replying in thread
 * @param {boolean} [params.unfurlLinks=true] - Unfurl URLs
 * @returns {Promise<{ok: boolean, ts?: string, channel?: string, error?: string}>}
 */
export async function postMessage(botToken, params) {
  const { channel, text, blocks, threadTs, replyBroadcast = false, unfurlLinks = true } = params;

  const body = { channel };
  if (text) body.text = text;
  if (blocks) body.blocks = blocks;
  if (threadTs) body.thread_ts = threadTs;
  if (replyBroadcast) body.reply_broadcast = true;
  body.unfurl_links = unfurlLinks;

  try {
    const res = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const data = await res.json();
    if (!data.ok) {
      console.error(`[slack-webhook] postMessage error: ${data.error}`);
      return { ok: false, error: data.error };
    }
    return { ok: true, ts: data.ts, channel: data.channel };
  } catch (err) {
    console.error(`[slack-webhook] postMessage failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

/**
 * Upload a file to a Slack channel.
 *
 * @param {string} botToken - Slack bot token
 * @param {object} params
 * @param {string} params.channel - Channel ID
 * @param {Buffer|Uint8Array} params.file - File content
 * @param {string} params.filename - File name
 * @param {string} [params.title] - File title
 * @param {string} [params.comment] - Initial comment
 * @param {string} [params.threadTs] - Thread to attach to
 * @returns {Promise<{ok: boolean, fileId?: string, error?: string}>}
 */
export async function uploadFile(botToken, params) {
  const { channel, file, filename, title, comment, threadTs } = params;

  try {
    // Step 1: Get upload URL
    const urlRes = await fetch(`${SLACK_API}/files.getUploadURLExternal`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        filename,
        length: String(file.byteLength || file.length),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const urlData = await urlRes.json();
    if (!urlData.ok) {
      return { ok: false, error: urlData.error };
    }

    // Step 2: Upload file content
    await fetch(urlData.upload_url, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: file,
      signal: AbortSignal.timeout(30000),
    });

    // Step 3: Complete the upload
    const completeBody = {
      files: [{ id: urlData.file_id, title: title || filename }],
      channel_id: channel,
    };
    if (comment) completeBody.initial_comment = comment;
    if (threadTs) completeBody.thread_ts = threadTs;

    const completeRes = await fetch(`${SLACK_API}/files.completeUploadExternal`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(completeBody),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const completeData = await completeRes.json();
    if (!completeData.ok) {
      return { ok: false, error: completeData.error };
    }
    return { ok: true, fileId: urlData.file_id };
  } catch (err) {
    console.error(`[slack-webhook] Upload failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

// --- Block Kit Helpers ---

/**
 * Build common Block Kit structures.
 */
export const blocks = {
  /** Section block with markdown text */
  section(text) {
    return { type: "section", text: { type: "mrkdwn", text } };
  },

  /** Section with fields (two-column layout) */
  fields(fieldTexts) {
    return {
      type: "section",
      fields: fieldTexts.map((t) => ({ type: "mrkdwn", text: t })),
    };
  },

  /** Divider line */
  divider() {
    return { type: "divider" };
  },

  /** Header block */
  header(text) {
    return { type: "header", text: { type: "plain_text", text } };
  },

  /** Context block (small grey text) */
  context(texts) {
    return {
      type: "context",
      elements: texts.map((t) => ({ type: "mrkdwn", text: t })),
    };
  },

  /** Actions block with buttons */
  actions(buttonConfigs) {
    return {
      type: "actions",
      elements: buttonConfigs.map((b) => ({
        type: "button",
        text: { type: "plain_text", text: b.text },
        action_id: b.actionId,
        url: b.url,
        style: b.style, // "primary" | "danger"
        value: b.value,
      })),
    };
  },
};
