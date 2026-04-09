// Twilio SMS & WhatsApp Client
// Zero dependencies - uses native fetch.
// Covers SMS sending, WhatsApp, OTP via Twilio Verify, delivery webhooks,
// opt-out compliance (STOP/START), and webhook signature verification.

const TWILIO_API = "https://api.twilio.com/2010-04-01";
const TWILIO_VERIFY_API = "https://verify.twilio.com/v2";
const TIMEOUT_MS = 15000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build a Basic-auth header from Twilio credentials.
 * @param {string} accountSid
 * @param {string} authToken
 * @returns {string}
 */
function basicAuth(accountSid, authToken) {
  return "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");
}

/**
 * Normalize a phone number to E.164 format.
 * Accepts numbers with spaces, dashes, dots, parens, and optional leading +.
 * Assumes US (+1) when no country code is detected (10-digit input).
 *
 * @param {string} phone - Raw phone number string
 * @returns {string|null} E.164 number or null if unparseable
 */
export function normalizePhone(phone) {
  if (typeof phone !== "string") return null;

  // Strip everything except digits and a leading +
  const stripped = phone.replace(/[^\d+]/g, "");

  // Already E.164 (starts with +, 8–15 digits total)
  if (/^\+\d{8,15}$/.test(stripped)) return stripped;

  // Digits only
  const digits = stripped.replace(/^\+/, "");

  if (digits.length === 10) {
    // Assume US/Canada country code
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    // US with leading 1
    return `+${digits}`;
  }
  if (digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }

  console.error(`[twilio-sms] Cannot normalize phone number: ${phone}`);
  return null;
}

/**
 * Execute a Twilio REST request, returning parsed JSON or null on error.
 * @param {string} url
 * @param {string} method
 * @param {string} auth
 * @param {URLSearchParams|null} body
 * @returns {Promise<object|null>}
 */
async function twilioRequest(url, method, auth, body = null) {
  const init = {
    method,
    headers: {
      Authorization: auth,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  };

  if (body) {
    init.headers["Content-Type"] = "application/x-www-form-urlencoded";
    init.body = body.toString();
  }

  const res = await fetch(url, init);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error(`[twilio-sms] API error ${res.status}: ${err.message || err.code || ""}`);
    return null;
  }

  return res.json().catch(() => null);
}

// ---------------------------------------------------------------------------
// SMS
// ---------------------------------------------------------------------------

/**
 * Send an SMS message via Twilio.
 *
 * @param {object} creds - { accountSid, authToken }
 * @param {object} params
 * @param {string} params.to - Recipient phone (normalized to E.164 internally)
 * @param {string} params.from - Twilio number or messaging service SID
 * @param {string} params.body - Message text (max 1600 chars; auto-splits into segments)
 * @param {string} [params.statusCallback] - URL to receive delivery status webhooks
 * @param {string} [params.messagingServiceSid] - Use a messaging service instead of `from`
 * @returns {Promise<{sid: string, status: string, to: string}|null>}
 */
export async function sendSMS(creds, params) {
  const { accountSid, authToken } = creds;
  const { to, from, body, statusCallback, messagingServiceSid } = params;

  const toNorm = normalizePhone(to);
  if (!toNorm) return null;

  const auth = basicAuth(accountSid, authToken);
  const formBody = new URLSearchParams({ To: toNorm, Body: body });

  if (messagingServiceSid) {
    formBody.set("MessagingServiceSid", messagingServiceSid);
  } else {
    formBody.set("From", from);
  }
  if (statusCallback) formBody.set("StatusCallback", statusCallback);

  try {
    const data = await twilioRequest(
      `${TWILIO_API}/Accounts/${accountSid}/Messages.json`,
      "POST",
      auth,
      formBody
    );
    if (!data) return null;

    if (data.error_code) {
      console.error(`[twilio-sms] Message failed (${data.error_code}): ${data.error_message}`);
      return null;
    }

    return { sid: data.sid, status: data.status, to: data.to };
  } catch (err) {
    console.error(`[twilio-sms] sendSMS failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

/**
 * Send a WhatsApp message via Twilio's WhatsApp channel.
 * Requires a Twilio WhatsApp-enabled number prefixed with "whatsapp:".
 *
 * @param {object} creds - { accountSid, authToken }
 * @param {object} params
 * @param {string} params.to - Recipient WhatsApp number (E.164, with or without "whatsapp:" prefix)
 * @param {string} params.from - Twilio WhatsApp sender (E.164, with or without "whatsapp:" prefix)
 * @param {string} params.body - Message text
 * @param {string} [params.mediaUrl] - Publicly accessible media URL to attach
 * @param {string} [params.statusCallback] - Webhook URL for delivery events
 * @returns {Promise<{sid: string, status: string, to: string}|null>}
 */
export async function sendWhatsApp(creds, params) {
  const { accountSid, authToken } = creds;
  const { to, from, body, mediaUrl, statusCallback } = params;

  const toRaw = to.startsWith("whatsapp:") ? to.slice(9) : to;
  const fromRaw = from.startsWith("whatsapp:") ? from.slice(9) : from;

  const toNorm = normalizePhone(toRaw);
  const fromNorm = normalizePhone(fromRaw);
  if (!toNorm || !fromNorm) return null;

  const auth = basicAuth(accountSid, authToken);
  const formBody = new URLSearchParams({
    To: `whatsapp:${toNorm}`,
    From: `whatsapp:${fromNorm}`,
    Body: body,
  });
  if (mediaUrl) formBody.set("MediaUrl", mediaUrl);
  if (statusCallback) formBody.set("StatusCallback", statusCallback);

  try {
    const data = await twilioRequest(
      `${TWILIO_API}/Accounts/${accountSid}/Messages.json`,
      "POST",
      auth,
      formBody
    );
    if (!data) return null;

    if (data.error_code) {
      console.error(`[twilio-sms] WhatsApp failed (${data.error_code}): ${data.error_message}`);
      return null;
    }

    return { sid: data.sid, status: data.status, to: data.to };
  } catch (err) {
    console.error(`[twilio-sms] sendWhatsApp failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Twilio Verify (OTP)
// ---------------------------------------------------------------------------

/**
 * Send an OTP via Twilio Verify.
 *
 * @param {object} creds - { accountSid, authToken }
 * @param {object} params
 * @param {string} params.serviceSid - Twilio Verify service SID (VAxxxxxxx)
 * @param {string} params.to - Recipient phone or email (E.164 for SMS/WhatsApp)
 * @param {"sms"|"whatsapp"|"email"|"call"} [params.channel="sms"] - Delivery channel
 * @param {string} [params.locale] - BCP-47 locale for the OTP message (e.g. "fr")
 * @returns {Promise<{sid: string, status: string, to: string}|null>}
 */
export async function sendOTP(creds, params) {
  const { accountSid, authToken } = creds;
  const { serviceSid, to, channel = "sms", locale } = params;

  const toNorm = channel === "email" ? to : normalizePhone(to);
  if (!toNorm) return null;

  const auth = basicAuth(accountSid, authToken);
  const formBody = new URLSearchParams({ To: toNorm, Channel: channel });
  if (locale) formBody.set("Locale", locale);

  try {
    const data = await twilioRequest(
      `${TWILIO_VERIFY_API}/Services/${serviceSid}/Verifications`,
      "POST",
      auth,
      formBody
    );
    if (!data) return null;

    return { sid: data.sid, status: data.status, to: data.to };
  } catch (err) {
    console.error(`[twilio-sms] sendOTP failed: ${err.message}`);
    return null;
  }
}

/**
 * Verify an OTP code entered by the user.
 *
 * @param {object} creds - { accountSid, authToken }
 * @param {object} params
 * @param {string} params.serviceSid - Twilio Verify service SID
 * @param {string} params.to - The same phone/email used in sendOTP
 * @param {string} params.code - 6-digit code entered by the user
 * @returns {Promise<{valid: boolean, status: string}|null>}
 */
export async function verifyOTP(creds, params) {
  const { accountSid, authToken } = creds;
  const { serviceSid, to, code } = params;

  const toNorm = /^[^@]+@[^@]+$/.test(to) ? to : normalizePhone(to);
  if (!toNorm) return null;

  const auth = basicAuth(accountSid, authToken);
  const formBody = new URLSearchParams({ To: toNorm, Code: code });

  try {
    const data = await twilioRequest(
      `${TWILIO_VERIFY_API}/Services/${serviceSid}/VerificationCheck`,
      "POST",
      auth,
      formBody
    );
    if (!data) return null;

    return { valid: data.status === "approved", status: data.status };
  } catch (err) {
    console.error(`[twilio-sms] verifyOTP failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Delivery status webhook
// ---------------------------------------------------------------------------

/**
 * Parse a Twilio delivery status webhook payload (application/x-www-form-urlencoded).
 * Use in your POST /webhooks/twilio-status route handler.
 *
 * @param {string|URLSearchParams} rawBody - Raw request body string or already-parsed params
 * @returns {{
 *   messageSid: string,
 *   status: string,
 *   to: string,
 *   from: string,
 *   errorCode: string|null,
 *   errorMessage: string|null,
 *   timestamp: string|null
 * }}
 */
export function parseDeliveryWebhook(rawBody) {
  const params = typeof rawBody === "string" ? new URLSearchParams(rawBody) : rawBody;

  const errorCode = params.get("ErrorCode") || null;
  if (errorCode) {
    console.error(`[twilio-sms] Delivery error ${errorCode} for ${params.get("MessageSid")}`);
  }

  return {
    messageSid: params.get("MessageSid") || "",
    status: params.get("MessageStatus") || params.get("SmsStatus") || "",
    to: params.get("To") || "",
    from: params.get("From") || "",
    errorCode,
    errorMessage: params.get("ErrorMessage") || null,
    timestamp: params.get("Timestamp") || null,
  };
}

// ---------------------------------------------------------------------------
// Opt-out / opt-in compliance (STOP / START)
// ---------------------------------------------------------------------------

/**
 * Parse inbound SMS body for opt-out (STOP) or opt-in (START) keywords
 * per CTIA/TCPA compliance guidelines.
 *
 * Recognized STOP words: STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT
 * Recognized START words: START, UNSTOP, YES
 *
 * @param {string} messageBody - The raw incoming SMS body
 * @returns {"stop"|"start"|null} Compliance action, or null if not a keyword
 */
export function parseOptKeyword(messageBody) {
  if (typeof messageBody !== "string") return null;
  const normalized = messageBody.trim().toUpperCase();

  const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
  const START_WORDS = new Set(["START", "UNSTOP", "YES"]);

  if (STOP_WORDS.has(normalized)) return "stop";
  if (START_WORDS.has(normalized)) return "start";
  return null;
}

/**
 * Parse a Twilio inbound SMS webhook and extract compliance state.
 * Returns the message details and the compliance action (if any).
 *
 * @param {string|URLSearchParams} rawBody - Raw inbound webhook body
 * @returns {{
 *   from: string,
 *   to: string,
 *   body: string,
 *   messageSid: string,
 *   optAction: "stop"|"start"|null
 * }}
 */
export function parseInboundSMS(rawBody) {
  const params = typeof rawBody === "string" ? new URLSearchParams(rawBody) : rawBody;

  const body = params.get("Body") || "";
  const from = params.get("From") || "";
  const optAction = parseOptKeyword(body);

  if (optAction === "stop") {
    console.error(`[twilio-sms] Opt-out received from ${from} — must suppress future messages`);
  }

  return {
    from,
    to: params.get("To") || "",
    body,
    messageSid: params.get("MessageSid") || "",
    optAction,
  };
}

// ---------------------------------------------------------------------------
// Webhook signature verification
// ---------------------------------------------------------------------------

/**
 * Verify a Twilio webhook request signature using HMAC-SHA1.
 * Must be called before processing any inbound webhook to prevent spoofing.
 *
 * @param {object} params
 * @param {string} params.authToken - Your Twilio auth token
 * @param {string} params.signature - Value of the X-Twilio-Signature header
 * @param {string} params.url - The full URL of your webhook endpoint (must match exactly)
 * @param {string|URLSearchParams} params.body - Raw POST body (application/x-www-form-urlencoded)
 * @returns {Promise<boolean>} true if signature is valid
 */
export async function verifyWebhookSignature({ authToken, signature, url, body }) {
  if (!signature || !url) {
    console.error("[twilio-sms] Missing signature or url for webhook verification");
    return false;
  }

  try {
    const params = typeof body === "string" ? new URLSearchParams(body) : body;

    // Build the signed string: URL + sorted key/value pairs concatenated
    const sortedKeys = [...params.keys()].sort();
    const paramString = sortedKeys.map((k) => `${k}${params.get(k)}`).join("");
    const signedString = url + paramString;

    // HMAC-SHA1 with authToken as the key
    const keyData = new TextEncoder().encode(authToken);
    const msgData = new TextEncoder().encode(signedString);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"]
    );
    const signatureBytes = await crypto.subtle.sign("HMAC", cryptoKey, msgData);

    // Base64-encode the computed signature
    const computed = Buffer.from(signatureBytes).toString("base64");

    if (computed !== signature) {
      console.error("[twilio-sms] Webhook signature mismatch — possible spoofing attempt");
      return false;
    }

    return true;
  } catch (err) {
    console.error(`[twilio-sms] verifyWebhookSignature failed: ${err.message}`);
    return false;
  }
}
