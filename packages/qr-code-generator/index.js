// QR Code Generator
// Wrapper around the `qrcode` npm package (install: npm install qrcode).
// Provides high-level helpers for URLs, WiFi credentials, vCards, and SEPA
// payment QR codes (EPC069-12 standard).
//
// Usage:
//   import { generateQR, urlQR, wifiQR, vcardQR, sepaQR } from './index.js';
//   await generateQR('https://example.com'); // returns SVG string

const TIMEOUT_MS = 15000; // retained for API consistency; qrcode is synchronous

// Lazy-loaded qrcode module (dynamic import to avoid hard dependency at parse time)
let _qrcode = null;

/**
 * Dynamically load the `qrcode` npm package on first use.
 * Throws a helpful error if the package is not installed.
 *
 * @returns {Promise<object>} The qrcode module
 */
async function loadQrcode() {
  if (_qrcode) return _qrcode;
  try {
    _qrcode = await import("qrcode");
    return _qrcode;
  } catch {
    throw new Error(
      "[qr-code-generator] The 'qrcode' package is not installed. " +
        "Run: npm install qrcode"
    );
  }
}

// ---------------------------------------------------------------------------
// Escape helper
// ---------------------------------------------------------------------------

/**
 * Escape special characters in QR data strings per the QR Code specification.
 * The characters \, ;, ,, and " must be backslash-prefixed in WiFi and vCard
 * QR payloads to prevent premature field termination.
 *
 * @param {string} str - Raw string that may contain special characters
 * @returns {string} Escaped string safe for inclusion in QR data fields
 */
export function escapeQRSpecial(str) {
  if (typeof str !== "string") return String(str);
  // Escape backslash first to avoid double-escaping, then ;, comma, and quote
  return str.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/"/g, '\\"');
}

// ---------------------------------------------------------------------------
// Core generators
// ---------------------------------------------------------------------------

/**
 * Generate a QR code as an SVG string.
 * The SVG can be embedded directly in HTML or saved as a .svg file.
 *
 * @param {string} data - The data to encode (URL, text, structured string, etc.)
 * @param {object} [options={}]
 * @param {string} [options.errorCorrectionLevel='M'] - Error correction: 'L' | 'M' | 'Q' | 'H'
 * @param {number} [options.width=256] - Output width in pixels
 * @param {object} [options.color] - Color options
 * @param {string} [options.color.dark='#000000'] - Dark module color (hex)
 * @param {string} [options.color.light='#ffffff'] - Light module color (hex)
 * @returns {Promise<string|null>} SVG markup string, or null on error
 */
export async function generateQR(data, options = {}) {
  if (!data || typeof data !== "string") {
    console.error("[qr-code-generator] generateQR: data must be a non-empty string");
    return null;
  }

  try {
    const qrcode = await loadQrcode();
    const { errorCorrectionLevel = "M", width = 256, color } = options;
    const qrOptions = { type: "svg", errorCorrectionLevel, width };
    if (color) qrOptions.color = color;

    return await qrcode.toString(data, qrOptions);
  } catch (err) {
    console.error(`[qr-code-generator] generateQR failed: ${err.message}`);
    return null;
  }
}

/**
 * Generate a QR code as a PNG data URI (base64-encoded).
 * Suitable for use in <img src="..."> tags or embedding in emails.
 *
 * @param {string} data - The data to encode
 * @param {object} [options={}]
 * @param {string} [options.errorCorrectionLevel='M'] - Error correction level
 * @param {number} [options.width=256] - Output width in pixels
 * @param {number} [options.margin=4] - Quiet zone size in modules
 * @param {object} [options.color] - Color options ({ dark, light })
 * @returns {Promise<string|null>} data:image/png;base64,... string, or null on error
 */
export async function generateQRDataURI(data, options = {}) {
  if (!data || typeof data !== "string") {
    console.error("[qr-code-generator] generateQRDataURI: data must be a non-empty string");
    return null;
  }

  try {
    const qrcode = await loadQrcode();
    const { errorCorrectionLevel = "M", width = 256, margin = 4, color } = options;
    const qrOptions = { errorCorrectionLevel, width, margin };
    if (color) qrOptions.color = color;

    return await qrcode.toDataURL(data, qrOptions);
  } catch (err) {
    console.error(`[qr-code-generator] generateQRDataURI failed: ${err.message}`);
    return null;
  }
}

/**
 * Generate a QR code as a raw PNG Buffer.
 * Useful for writing directly to a file (fs.writeFile) or streaming in HTTP responses.
 *
 * @param {string} data - The data to encode
 * @param {object} [options={}]
 * @param {string} [options.errorCorrectionLevel='M'] - Error correction level
 * @param {number} [options.width=256] - Output width in pixels
 * @param {number} [options.margin=4] - Quiet zone size in modules
 * @param {object} [options.color] - Color options ({ dark, light })
 * @returns {Promise<Buffer|null>} PNG image buffer, or null on error
 */
export async function generateQRBuffer(data, options = {}) {
  if (!data || typeof data !== "string") {
    console.error("[qr-code-generator] generateQRBuffer: data must be a non-empty string");
    return null;
  }

  try {
    const qrcode = await loadQrcode();
    const { errorCorrectionLevel = "M", width = 256, margin = 4, color } = options;
    const qrOptions = { errorCorrectionLevel, width, margin };
    if (color) qrOptions.color = color;

    return await qrcode.toBuffer(data, qrOptions);
  } catch (err) {
    console.error(`[qr-code-generator] generateQRBuffer failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// High-level helpers
// ---------------------------------------------------------------------------

/**
 * Generate a WiFi network QR code that lets mobile devices connect by scanning.
 * Produces a WIFI: URI string encoded per the WiFi QR standard.
 *
 * Special characters in ssid and password are automatically escaped.
 *
 * @param {string} ssid - Network name (SSID)
 * @param {string} password - Network password (use "" for open networks)
 * @param {object} [options={}]
 * @param {string} [options.security='WPA'] - Security type: 'WPA' | 'WEP' | 'nopass'
 * @param {boolean} [options.hidden=false] - Whether the network is hidden
 * @param {string} [options.errorCorrectionLevel='M'] - QR error correction level
 * @param {number} [options.width=256] - Output width in pixels
 * @returns {Promise<string|null>} SVG string, or null on error
 */
export async function wifiQR(ssid, password, options = {}) {
  if (!ssid || typeof ssid !== "string") {
    console.error("[qr-code-generator] wifiQR: ssid must be a non-empty string");
    return null;
  }

  const { security = "WPA", hidden = false, ...qrOptions } = options;
  const escapedSsid = escapeQRSpecial(ssid);
  const escapedPass = escapeQRSpecial(password || "");

  // WIFI:T:<security>;S:<ssid>;P:<password>;H:<hidden>;;
  const wifiString = `WIFI:T:${security};S:${escapedSsid};P:${escapedPass};H:${hidden ? "true" : "false"};;`;

  return generateQR(wifiString, qrOptions);
}

/**
 * Generate a vCard 3.0 QR code for contact sharing.
 * Scanning the QR code will prompt the user to save the contact on most devices.
 *
 * @param {object} contact - Contact information
 * @param {string} contact.firstName - First name
 * @param {string} contact.lastName - Last name
 * @param {string} [contact.phone] - Phone number (e.g. "+14155552671")
 * @param {string} [contact.email] - Email address
 * @param {string} [contact.org] - Organization / company name
 * @param {string} [contact.url] - Website URL
 * @param {string} [contact.address] - Physical address (single line)
 * @param {object} [options={}] - QR generation options (errorCorrectionLevel, width, color)
 * @returns {Promise<string|null>} SVG string, or null on error
 */
export async function vcardQR(contact, options = {}) {
  if (!contact || typeof contact !== "object") {
    console.error("[qr-code-generator] vcardQR: contact must be an object");
    return null;
  }
  if (!contact.firstName && !contact.lastName) {
    console.error("[qr-code-generator] vcardQR: contact must have at least a firstName or lastName");
    return null;
  }

  const { firstName = "", lastName = "", phone, email, org, url, address } = contact;

  // Build vCard 3.0 formatted string
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escapeQRSpecial(`${firstName} ${lastName}`.trim())}`,
    `N:${escapeQRSpecial(lastName)};${escapeQRSpecial(firstName)};;;`,
  ];

  if (phone) lines.push(`TEL;TYPE=CELL:${phone}`);
  if (email) lines.push(`EMAIL:${email}`);
  if (org) lines.push(`ORG:${escapeQRSpecial(org)}`);
  if (url) lines.push(`URL:${url}`);
  if (address) lines.push(`ADR:;;${escapeQRSpecial(address)};;;;`);

  lines.push("END:VCARD");

  return generateQR(lines.join("\n"), options);
}

/**
 * Generate a QR code for a URL.
 * Validates that the input is a properly formatted URL before encoding.
 *
 * @param {string} url - The URL to encode (must include protocol, e.g. https://)
 * @param {object} [options={}] - QR generation options (errorCorrectionLevel, width, color)
 * @returns {Promise<string|null>} SVG string, or null on invalid URL or error
 */
export async function urlQR(url, options = {}) {
  if (!url || typeof url !== "string") {
    console.error("[qr-code-generator] urlQR: url must be a non-empty string");
    return null;
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    console.error(`[qr-code-generator] urlQR: "${url}" is not a valid URL`);
    return null;
  }

  return generateQR(url, options);
}

/**
 * Generate a SEPA Credit Transfer QR code per the EPC069-12 standard.
 * These are used across the EU for contactless payment initiation.
 * Scanning the QR populates bank transfer details in compatible banking apps.
 *
 * @param {object} params - SEPA transfer parameters
 * @param {string} params.name - Beneficiary name (max 70 chars)
 * @param {string} params.iban - Beneficiary IBAN (e.g. "DE89370400440532013000")
 * @param {string} [params.bic] - Beneficiary BIC/SWIFT code (optional from version 002)
 * @param {number} [params.amount] - Transfer amount in EUR (e.g. 12.50); omit for variable
 * @param {string} [params.reference] - Structured creditor reference (e.g. "RF18539007547034")
 * @param {string} [params.remittance] - Unstructured remittance information (max 140 chars)
 * @param {object} [options={}] - QR generation options; errorCorrectionLevel defaults to 'M'
 * @returns {Promise<string|null>} SVG string, or null on validation error or failure
 */
export async function sepaQR(params, options = {}) {
  if (!params || typeof params !== "object") {
    console.error("[qr-code-generator] sepaQR: params must be an object");
    return null;
  }

  const { name, iban, bic = "", amount, reference = "", remittance = "" } = params;

  if (!name || !iban) {
    console.error("[qr-code-generator] sepaQR: name and iban are required");
    return null;
  }

  // Validate IBAN format (basic: letters+digits, 15-34 chars)
  const cleanIban = iban.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(cleanIban)) {
    console.error(`[qr-code-generator] sepaQR: "${iban}" does not look like a valid IBAN`);
    return null;
  }

  // Format amount as EUR followed by 2 decimal places (e.g. "EUR12.50")
  const amountStr = amount != null ? `EUR${Number(amount).toFixed(2)}` : "";

  // EPC069-12 payload (version 002 uses BIC as optional)
  // Lines: ServiceTag, Version, Encoding, BIC, Name, IBAN, Amount, Purpose, Reference, Remittance, Hint
  const payload = [
    "BCD",          // Service Tag
    "002",          // Version
    "1",            // Character set: UTF-8
    bic || "",      // BIC (optional in version 002)
    name.slice(0, 70),
    cleanIban,
    amountStr,
    "",             // Purpose (optional, leave blank)
    reference.slice(0, 35),
    remittance.slice(0, 140),
    "",             // Beneficiary to originator info (optional)
  ].join("\n");

  // EPC standard recommends error correction level M
  return generateQR(payload, { errorCorrectionLevel: "M", ...options });
}
