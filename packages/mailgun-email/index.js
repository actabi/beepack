// mailgun-email – zero-dependency Mailgun email API wrapper
// SPDX-License-Identifier: MIT

const DEFAULT_TIMEOUT = 15000;

/**
 * Resolve Mailgun domain from opts or environment.
 * @param {object} opts - Options object.
 * @returns {string} The Mailgun domain.
 */
function getDomain(opts) {
  const domain = opts.domain || process.env.MAILGUN_DOMAIN;
  if (!domain) throw new Error('MAILGUN_DOMAIN is required');
  return domain;
}

/**
 * Build Basic auth header value.
 * @param {object} opts - Options object.
 * @returns {string} The Authorization header value.
 */
function authHeader(opts) {
  const key = opts.apiKey || process.env.MAILGUN_API_KEY;
  if (!key) throw new Error('MAILGUN_API_KEY is required');
  return 'Basic ' + btoa(`api:${key}`);
}

/**
 * Internal POST request helper using form-encoded body.
 * @param {string} url - Full request URL.
 * @param {Record<string,string>} fields - Form fields.
 * @param {object} opts - Auth options.
 * @returns {Promise<object|null>} Parsed JSON response or null.
 */
async function postForm(url, fields, opts) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null) body.set(k, String(v));
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: authHeader(opts) },
      body,
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`Mailgun API error ${res.status}: ${text}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error('Mailgun request failed:', err.message);
    return null;
  }
}

/**
 * Internal GET request helper.
 * @param {string} url - Full request URL.
 * @param {object} opts - Auth options.
 * @returns {Promise<object|null>} Parsed JSON response or null.
 */
async function getJson(url, opts) {
  try {
    const res = await fetch(url, {
      headers: { Authorization: authHeader(opts) },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`Mailgun API error ${res.status}: ${text}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error('Mailgun request failed:', err.message);
    return null;
  }
}

/**
 * Send a plain email through Mailgun.
 * @param {object} message - Email message fields.
 * @param {string} message.from - Sender address.
 * @param {string} message.to - Recipient address(es), comma-separated.
 * @param {string} message.subject - Email subject line.
 * @param {string} [message.text] - Plain-text body.
 * @param {string} [message.html] - HTML body.
 * @param {object} [opts] - Optional overrides (apiKey, domain).
 * @returns {Promise<object|null>} Mailgun response or null.
 */
export async function sendEmail(message, opts = {}) {
  if (!message || !message.to || !message.subject) {
    throw new Error('message.to and message.subject are required');
  }
  const domain = getDomain(opts);
  const url = `https://api.mailgun.net/v3/${domain}/messages`;
  return postForm(url, message, opts);
}

/**
 * Send an email using a stored Mailgun template.
 * @param {object} params - Template email parameters.
 * @param {string} params.from - Sender address.
 * @param {string} params.to - Recipient address(es).
 * @param {string} params.subject - Email subject.
 * @param {string} params.template - Template name.
 * @param {Record<string,string>} [params.variables] - Template variables as JSON string.
 * @param {object} [opts] - Optional overrides (apiKey, domain).
 * @returns {Promise<object|null>} Mailgun response or null.
 */
export async function sendTemplateEmail(params, opts = {}) {
  if (!params || !params.template) throw new Error('params.template is required');
  const domain = getDomain(opts);
  const url = `https://api.mailgun.net/v3/${domain}/messages`;
  const fields = {
    from: params.from,
    to: params.to,
    subject: params.subject,
    template: params.template,
  };
  if (params.variables) {
    fields['h:X-Mailgun-Variables'] = typeof params.variables === 'string'
      ? params.variables
      : JSON.stringify(params.variables);
  }
  return postForm(url, fields, opts);
}

/**
 * Retrieve message events (delivery, open, click, bounce, etc.).
 * @param {object} [query] - Event query params (event, limit, begin, end, etc.).
 * @param {object} [opts] - Optional overrides (apiKey, domain).
 * @returns {Promise<object|null>} Events response or null.
 */
export async function getMessageEvents(query = {}, opts = {}) {
  const domain = getDomain(opts);
  const url = new URL(`https://api.mailgun.net/v3/${domain}/events`);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  return getJson(url.toString(), opts);
}

/**
 * Validate an email address using Mailgun's validation API.
 * @param {string} address - The email address to validate.
 * @param {object} [opts] - Optional overrides (apiKey).
 * @returns {Promise<object|null>} Validation result or null.
 */
export async function validateEmail(address, opts = {}) {
  if (!address) throw new Error('address is required');
  const url = new URL('https://api.mailgun.net/v4/address/validate');
  url.searchParams.set('address', address);
  return getJson(url.toString(), opts);
}
