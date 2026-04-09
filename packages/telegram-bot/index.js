// Telegram Bot API Client
// Zero dependencies - uses native fetch.
// Covers messaging, inline keyboards, file/photo sending, webhook setup,
// signature verification, command routing, and group chat handling.

const TELEGRAM_API = "https://api.telegram.org";
const TIMEOUT_MS = 15000;

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

/**
 * Call the Telegram Bot API.
 *
 * @param {string} token - Bot token from BotFather
 * @param {string} method - API method name (e.g. "sendMessage")
 * @param {object} [body] - JSON body params
 * @returns {Promise<object|null>} Parsed `result` field, or null on error
 */
async function callApi(token, method, body) {
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const data = await res.json();

    if (!data.ok) {
      console.error(`[telegram-bot] API error (${method}): ${data.description}`);
      return null;
    }

    return data.result;
  } catch (err) {
    console.error(`[telegram-bot] ${method} failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

/**
 * Register a webhook URL with Telegram so updates are pushed to your server.
 *
 * @param {string} token - Bot token
 * @param {string} url - HTTPS URL that Telegram will POST updates to
 * @param {object} [opts]
 * @param {string} [opts.secretToken] - Arbitrary string sent as X-Telegram-Bot-Api-Secret-Token header
 * @param {string[]} [opts.allowedUpdates] - Filter update types (e.g. ["message","callback_query"])
 * @param {number} [opts.maxConnections=40] - Max simultaneous connections (1-100)
 * @returns {Promise<boolean>} true if registered successfully
 */
export async function setWebhook(token, url, opts = {}) {
  const { secretToken, allowedUpdates, maxConnections = 40 } = opts;

  const body = { url, max_connections: maxConnections };
  if (secretToken) body.secret_token = secretToken;
  if (allowedUpdates) body.allowed_updates = allowedUpdates;

  const result = await callApi(token, "setWebhook", body);
  return result === true;
}

/**
 * Remove the currently registered webhook.
 *
 * @param {string} token - Bot token
 * @returns {Promise<boolean>}
 */
export async function deleteWebhook(token) {
  const result = await callApi(token, "deleteWebhook", { drop_pending_updates: false });
  return result === true;
}

/**
 * Verify that an incoming webhook request originated from Telegram.
 * Compare the X-Telegram-Bot-Api-Secret-Token header against the secret
 * you passed to setWebhook.
 *
 * @param {string} incomingToken - Value of the X-Telegram-Bot-Api-Secret-Token header
 * @param {string} expectedToken - The secret_token you registered
 * @returns {boolean}
 */
export function verifyWebhookSecret(incomingToken, expectedToken) {
  if (!incomingToken || !expectedToken) return false;
  // Constant-time compare to prevent timing attacks
  const a = new TextEncoder().encode(incomingToken);
  const b = new TextEncoder().encode(expectedToken);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

/**
 * Send a plain text, Markdown, or HTML message.
 *
 * @param {string} token - Bot token
 * @param {string|number} chatId - Chat ID or @username
 * @param {string} text - Message text
 * @param {object} [opts]
 * @param {"Markdown"|"MarkdownV2"|"HTML"} [opts.parseMode] - Formatting mode
 * @param {boolean} [opts.disablePreview=false] - Disable link previews
 * @param {boolean} [opts.silent=false] - Send without notification
 * @param {string|number} [opts.replyToMessageId] - ID of the message to reply to
 * @param {object} [opts.replyMarkup] - Inline or reply keyboard markup
 * @returns {Promise<{messageId: number, chatId: number}|null>}
 */
export async function sendMessage(token, chatId, text, opts = {}) {
  const { parseMode, disablePreview = false, silent = false, replyToMessageId, replyMarkup } = opts;

  const body = { chat_id: chatId, text };
  if (parseMode) body.parse_mode = parseMode;
  if (disablePreview) body.disable_web_page_preview = true;
  if (silent) body.disable_notification = true;
  if (replyToMessageId) body.reply_to_message_id = replyToMessageId;
  if (replyMarkup) body.reply_markup = replyMarkup;

  const msg = await callApi(token, "sendMessage", body);
  if (!msg) return null;
  return { messageId: msg.message_id, chatId: msg.chat.id };
}

/**
 * Edit an existing message's text.
 *
 * @param {string} token - Bot token
 * @param {string|number} chatId - Chat ID
 * @param {number} messageId - Message to edit
 * @param {string} text - New text
 * @param {object} [opts]
 * @param {"Markdown"|"MarkdownV2"|"HTML"} [opts.parseMode] - Formatting mode
 * @param {object} [opts.replyMarkup] - Updated inline keyboard markup
 * @returns {Promise<boolean>}
 */
export async function editMessage(token, chatId, messageId, text, opts = {}) {
  const body = { chat_id: chatId, message_id: messageId, text };
  if (opts.parseMode) body.parse_mode = opts.parseMode;
  if (opts.replyMarkup) body.reply_markup = opts.replyMarkup;
  const result = await callApi(token, "editMessageText", body);
  return result !== null;
}

// ---------------------------------------------------------------------------
// Inline keyboards
// ---------------------------------------------------------------------------

/**
 * Build an inline keyboard markup object from a 2-D array of button configs.
 *
 * Each button must have a `text` property and one of:
 *   - `callbackData` (string) — triggers a callback_query update
 *   - `url` (string) — opens a URL when tapped
 *   - `switchInlineQuery` (string) — switches to inline mode in a chat
 *
 * @param {Array<Array<{text: string, callbackData?: string, url?: string, switchInlineQuery?: string}>>} rows
 * @returns {object} reply_markup suitable for sendMessage / editMessage
 *
 * @example
 * buildInlineKeyboard([
 *   [{ text: "Approve", callbackData: "approve:42" }, { text: "Reject", callbackData: "reject:42" }],
 *   [{ text: "View", url: "https://example.com" }],
 * ]);
 */
export function buildInlineKeyboard(rows) {
  return {
    inline_keyboard: rows.map((row) =>
      row.map((btn) => {
        const b = { text: btn.text };
        if (btn.callbackData != null) b.callback_data = btn.callbackData;
        if (btn.url) b.url = btn.url;
        if (btn.switchInlineQuery != null) b.switch_inline_query = btn.switchInlineQuery;
        return b;
      })
    ),
  };
}

/**
 * Answer a callback_query (required to dismiss the loading spinner on the button).
 *
 * @param {string} token - Bot token
 * @param {string} callbackQueryId - ID from the callback_query update
 * @param {object} [opts]
 * @param {string} [opts.text] - Toast notification text shown to the user
 * @param {boolean} [opts.showAlert=false] - Show as alert dialog instead of toast
 * @returns {Promise<boolean>}
 */
export async function answerCallbackQuery(token, callbackQueryId, opts = {}) {
  const body = { callback_query_id: callbackQueryId };
  if (opts.text) body.text = opts.text;
  if (opts.showAlert) body.show_alert = true;
  const result = await callApi(token, "answerCallbackQuery", body);
  return result === true;
}

// ---------------------------------------------------------------------------
// File and photo sending
// ---------------------------------------------------------------------------

/**
 * Send a photo by public URL or file_id.
 *
 * @param {string} token - Bot token
 * @param {string|number} chatId - Chat ID
 * @param {string} photo - HTTPS URL or Telegram file_id
 * @param {object} [opts]
 * @param {string} [opts.caption] - Caption text (up to 1024 chars)
 * @param {"Markdown"|"MarkdownV2"|"HTML"} [opts.parseMode] - Caption formatting
 * @param {object} [opts.replyMarkup] - Inline keyboard markup
 * @returns {Promise<{messageId: number, fileId: string}|null>}
 */
export async function sendPhoto(token, chatId, photo, opts = {}) {
  const body = { chat_id: chatId, photo };
  if (opts.caption) body.caption = opts.caption;
  if (opts.parseMode) body.parse_mode = opts.parseMode;
  if (opts.replyMarkup) body.reply_markup = opts.replyMarkup;

  const msg = await callApi(token, "sendPhoto", body);
  if (!msg) return null;
  const largest = msg.photo[msg.photo.length - 1];
  return { messageId: msg.message_id, fileId: largest.file_id };
}

/**
 * Send a document (any file type) by public URL or file_id.
 *
 * @param {string} token - Bot token
 * @param {string|number} chatId - Chat ID
 * @param {string} document - HTTPS URL or Telegram file_id
 * @param {object} [opts]
 * @param {string} [opts.filename] - Override display filename
 * @param {string} [opts.caption] - Caption text
 * @param {"Markdown"|"MarkdownV2"|"HTML"} [opts.parseMode] - Caption formatting
 * @param {object} [opts.replyMarkup] - Inline keyboard markup
 * @returns {Promise<{messageId: number, fileId: string}|null>}
 */
export async function sendDocument(token, chatId, document, opts = {}) {
  const body = { chat_id: chatId, document };
  if (opts.filename) body.filename = opts.filename;
  if (opts.caption) body.caption = opts.caption;
  if (opts.parseMode) body.parse_mode = opts.parseMode;
  if (opts.replyMarkup) body.reply_markup = opts.replyMarkup;

  const msg = await callApi(token, "sendDocument", body);
  if (!msg) return null;
  return { messageId: msg.message_id, fileId: msg.document.file_id };
}

// ---------------------------------------------------------------------------
// Command routing
// ---------------------------------------------------------------------------

/**
 * Extract the command and arguments from a Telegram message, if present.
 * Handles both private chats (/start) and group chats (/start@MyBot).
 *
 * @param {object} message - A Telegram Message object from an update
 * @returns {{command: string, args: string[], botUsername: string|null}|null}
 *   null if the message is not a bot command
 */
export function parseCommand(message) {
  const text = message?.text;
  if (!text) return null;

  const entity = (message.entities ?? []).find((e) => e.type === "bot_command" && e.offset === 0);
  if (!entity) return null;

  const raw = text.slice(0, entity.length); // e.g. "/start@MyBot"
  const rest = text.slice(entity.length).trim(); // everything after

  const [commandPart, botUsername = null] = raw.slice(1).split("@");
  const args = rest.length ? rest.split(/\s+/) : [];

  return { command: commandPart.toLowerCase(), args, botUsername };
}

/**
 * Create a simple command router for use inside a webhook handler.
 *
 * @param {Record<string, (message: object, args: string[]) => Promise<void>>} handlers
 *   Map of command name (without slash) to async handler function.
 * @returns {(message: object) => Promise<boolean>}
 *   Async function that processes a message and returns true if a handler ran.
 *
 * @example
 * const router = createCommandRouter({
 *   start: async (msg) => sendMessage(token, msg.chat.id, "Hello!"),
 *   help:  async (msg) => sendMessage(token, msg.chat.id, "Commands: /start /help"),
 * });
 *
 * // Inside your webhook handler:
 * if (update.message) await router(update.message);
 */
export function createCommandRouter(handlers) {
  return async function routeCommand(message) {
    const parsed = parseCommand(message);
    if (!parsed) return false;

    const handler = handlers[parsed.command];
    if (!handler) return false;

    try {
      await handler(message, parsed.args);
    } catch (err) {
      console.error(`[telegram-bot] Command /${parsed.command} handler threw: ${err.message}`);
    }
    return true;
  };
}

// ---------------------------------------------------------------------------
// Group chat helpers
// ---------------------------------------------------------------------------

/**
 * Get information about a chat (works for private, group, and supergroup chats).
 *
 * @param {string} token - Bot token
 * @param {string|number} chatId - Chat ID or @username
 * @returns {Promise<{id: number, type: string, title: string|null, username: string|null, memberCount: number|null}|null>}
 */
export async function getChat(token, chatId) {
  const chat = await callApi(token, "getChat", { chat_id: chatId });
  if (!chat) return null;

  const countResult = await callApi(token, "getChatMemberCount", { chat_id: chatId }).catch(() => null);

  return {
    id: chat.id,
    type: chat.type,
    title: chat.title ?? null,
    username: chat.username ?? null,
    memberCount: typeof countResult === "number" ? countResult : null,
  };
}

/**
 * Get a specific chat member's status.
 *
 * @param {string} token - Bot token
 * @param {string|number} chatId - Chat ID
 * @param {number} userId - User ID
 * @returns {Promise<{status: string, userId: number}|null>}
 *   status is one of: creator, administrator, member, restricted, left, kicked
 */
export async function getChatMember(token, chatId, userId) {
  const member = await callApi(token, "getChatMember", { chat_id: chatId, user_id: userId });
  if (!member) return null;
  return { status: member.status, userId: member.user.id };
}

/**
 * Determine whether the bot itself is an administrator in a group/supergroup.
 *
 * @param {string} token - Bot token
 * @param {string|number} chatId - Chat ID
 * @param {number} botUserId - The bot's own user ID
 * @returns {Promise<boolean>}
 */
export async function isBotAdmin(token, chatId, botUserId) {
  const member = await getChatMember(token, chatId, botUserId);
  return member?.status === "administrator" || member?.status === "creator";
}

// ---------------------------------------------------------------------------
// Bot info
// ---------------------------------------------------------------------------

/**
 * Get basic information about the bot account.
 *
 * @param {string} token - Bot token
 * @returns {Promise<{id: number, username: string, firstName: string, canJoinGroups: boolean}|null>}
 */
export async function getMe(token) {
  const me = await callApi(token, "getMe");
  if (!me) return null;
  return {
    id: me.id,
    username: me.username,
    firstName: me.first_name,
    canJoinGroups: me.can_join_groups ?? false,
  };
}
