// Resend Email Client - Send transactional emails via Resend API
// Zero dependencies - uses native fetch.

const RESEND_API = "https://api.resend.com";
const TIMEOUT_MS = 15000;

/**
 * Send a single email via Resend.
 *
 * @param {string} apiKey - Resend API key (re_...)
 * @param {object} params
 * @param {string} params.from - Sender (e.g. "App <noreply@example.com>")
 * @param {string|string[]} params.to - Recipient(s)
 * @param {string} params.subject - Email subject
 * @param {string} [params.html] - HTML body
 * @param {string} [params.text] - Plain text body
 * @param {string[]} [params.cc] - CC recipients
 * @param {string[]} [params.bcc] - BCC recipients
 * @param {string} [params.replyTo] - Reply-to address
 * @param {Array<{filename: string, content: string}>} [params.attachments] - Base64-encoded attachments
 * @param {object} [params.headers] - Custom email headers
 * @param {string[]} [params.tags] - Tags for tracking
 * @returns {Promise<{id: string}|null>} Email ID or null on error
 */
export async function sendEmail(apiKey, params) {
  const { from, to, subject, html, text, cc, bcc, replyTo, attachments, headers, tags } = params;

  const body = { from, to: Array.isArray(to) ? to : [to], subject };
  if (html) body.html = html;
  if (text) body.text = text;
  if (cc) body.cc = Array.isArray(cc) ? cc : [cc];
  if (bcc) body.bcc = Array.isArray(bcc) ? bcc : [bcc];
  if (replyTo) body.reply_to = replyTo;
  if (headers) body.headers = headers;
  if (tags) body.tags = tags.map((t) => ({ name: t, value: "true" }));
  if (attachments) body.attachments = attachments;

  try {
    const res = await fetch(`${RESEND_API}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[resend-email] API error ${res.status}:`, err.message || "");
      return null;
    }

    const data = await res.json();
    return { id: data.id };
  } catch (err) {
    console.error(`[resend-email] Send failed: ${err.message}`);
    return null;
  }
}

/**
 * Send a batch of emails (up to 100) in a single API call.
 *
 * @param {string} apiKey - Resend API key
 * @param {Array<{from: string, to: string|string[], subject: string, html?: string, text?: string}>} emails
 * @returns {Promise<{ids: string[]}|null>} Array of email IDs or null on error
 */
export async function sendBatch(apiKey, emails) {
  if (emails.length > 100) {
    console.error("[resend-email] Batch limit is 100 emails");
    return null;
  }

  const batch = emails.map((e) => ({
    from: e.from,
    to: Array.isArray(e.to) ? e.to : [e.to],
    subject: e.subject,
    html: e.html,
    text: e.text,
  }));

  try {
    const res = await fetch(`${RESEND_API}/emails/batch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[resend-email] Batch error ${res.status}:`, err.message || "");
      return null;
    }

    const data = await res.json();
    return { ids: data.data?.map((d) => d.id) || [] };
  } catch (err) {
    console.error(`[resend-email] Batch failed: ${err.message}`);
    return null;
  }
}

/**
 * Get email delivery status by ID.
 *
 * @param {string} apiKey - Resend API key
 * @param {string} emailId - Email ID returned from sendEmail
 * @returns {Promise<{id: string, status: string, to: string[], subject: string, createdAt: string}|null>}
 */
export async function getEmailStatus(apiKey, emailId) {
  try {
    const res = await fetch(`${RESEND_API}/emails/${emailId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) return null;

    const data = await res.json();
    return {
      id: data.id,
      status: data.last_event || "sent",
      to: data.to,
      subject: data.subject,
      createdAt: data.created_at,
    };
  } catch (err) {
    console.error(`[resend-email] Status check failed: ${err.message}`);
    return null;
  }
}
