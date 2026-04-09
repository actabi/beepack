// Image Upload — secure image pipeline helpers
// Zero dependencies. Magic-byte validation, EXIF/GPS stripping, dimension checks,
// presigned S3 PUT URL generation (AWS SigV4), Sharp pipeline config, multipart parsing.

// ---------------------------------------------------------------------------
// Magic byte signatures — never trust Content-Type alone
// ---------------------------------------------------------------------------

/** @type {Array<{type: string, mime: string, bytes: number[], mask?: number[]}>} */
const SIGNATURES = [
  { type: "jpeg", mime: "image/jpeg",  bytes: [0xff, 0xd8, 0xff] },
  { type: "png",  mime: "image/png",   bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: "gif",  mime: "image/gif",   bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF8 (7/9)
  { type: "webp", mime: "image/webp",  bytes: [0x52, 0x49, 0x46, 0x46], offset4: [0x57, 0x45, 0x42, 0x50] },
  { type: "avif", mime: "image/avif",  bytes: [0x00, 0x00, 0x00], ftyp: true }, // ftyp box at byte 4
  { type: "heic", mime: "image/heic",  bytes: [0x00, 0x00, 0x00], ftypHeic: true },
];

const FTYP_AVIF_BRANDS = ["avif", "avis"];
const FTYP_HEIC_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1"];

/**
 * Detect image type from raw bytes using magic byte inspection.
 * Never relies on the Content-Type header (easily spoofed).
 *
 * @param {Buffer|Uint8Array|ArrayBuffer} input
 * @returns {{ type: string, mime: string } | null} Detected type, or null if unrecognised
 */
export function detectImageType(input) {
  const buf = toUint8Array(input);
  if (buf.length < 12) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { type: "jpeg", mime: "image/jpeg" };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
      buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) {
    return { type: "png", mime: "image/png" };
  }

  // GIF: GIF87a or GIF89a
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38 &&
      (buf[4] === 0x37 || buf[4] === 0x39) && buf[5] === 0x61) {
    return { type: "gif", mime: "image/gif" };
  }

  // WebP: RIFF????WEBP
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    return { type: "webp", mime: "image/webp" };
  }

  // AVIF / HEIC: ISO Base Media (ftyp box at offset 4)
  // Box size (4 bytes big-endian) then 'ftyp' then 4-char brand
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    const brand = String.fromCharCode(buf[8], buf[9], buf[10], buf[11]);
    if (FTYP_AVIF_BRANDS.includes(brand)) return { type: "avif", mime: "image/avif" };
    if (FTYP_HEIC_BRANDS.includes(brand)) return { type: "heic", mime: "image/heic" };
  }

  return null;
}

// ---------------------------------------------------------------------------
// EXIF / GPS stripping — JPEG only (EXIF lives in APP1 segment)
// ---------------------------------------------------------------------------

/**
 * Strip all EXIF metadata from a JPEG buffer, including GPS coordinates.
 * Non-JPEG inputs are returned unchanged. Operates on raw bytes, no deps.
 *
 * @param {Buffer|Uint8Array|ArrayBuffer} input
 * @returns {Uint8Array} JPEG with all APP1 (EXIF) segments removed
 */
export function stripExif(input) {
  const buf = toUint8Array(input);

  // Only process JPEG (FF D8)
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return buf;

  const out = [buf.slice(0, 2)]; // keep SOI marker
  let i = 2;

  while (i < buf.length) {
    if (buf[i] !== 0xff) break; // malformed — stop here, return what we have
    const marker = buf[i + 1];

    // SOS (Start of Scan) — everything after is raw image data, copy as-is
    if (marker === 0xda) {
      out.push(buf.slice(i));
      break;
    }

    // Segments with no length field: RST0-RST7 (D0-D7), EOI (D9)
    if ((marker >= 0xd0 && marker <= 0xd9)) {
      out.push(buf.slice(i, i + 2));
      i += 2;
      continue;
    }

    const segLen = (buf[i + 2] << 8) | buf[i + 3]; // includes the 2-byte length field itself
    const segEnd = i + 2 + segLen;

    // APP1 (0xE1) that starts with "Exif\0" — drop it
    const isExifApp1 =
      marker === 0xe1 &&
      segLen >= 6 &&
      buf[i + 4] === 0x45 && buf[i + 5] === 0x78 && buf[i + 6] === 0x69 &&
      buf[i + 7] === 0x66 && buf[i + 8] === 0x00;

    if (!isExifApp1) {
      out.push(buf.slice(i, segEnd));
    }

    i = segEnd;
  }

  return concatUint8Arrays(out);
}

// ---------------------------------------------------------------------------
// Size and dimension validation
// ---------------------------------------------------------------------------

/**
 * @typedef {object} DimensionResult
 * @property {number} width
 * @property {number} height
 */

/**
 * Read width/height from a JPEG, PNG, GIF, or WebP buffer without decoding the image.
 * Returns null for unsupported or malformed files.
 *
 * @param {Buffer|Uint8Array|ArrayBuffer} input
 * @returns {DimensionResult | null}
 */
export function readDimensions(input) {
  const buf = toUint8Array(input);
  const type = detectImageType(buf);
  if (!type) return null;

  try {
    if (type.type === "png") {
      // IHDR chunk at byte 16: 4 bytes width, 4 bytes height
      return { width: readUint32BE(buf, 16), height: readUint32BE(buf, 20) };
    }

    if (type.type === "gif") {
      // Logical screen descriptor at byte 6: 2 bytes width LE, 2 bytes height LE
      return { width: readUint16LE(buf, 6), height: readUint16LE(buf, 8) };
    }

    if (type.type === "jpeg") {
      // Scan for SOF0/SOF2 marker (FF C0 / FF C2)
      let i = 2;
      while (i < buf.length - 8) {
        if (buf[i] !== 0xff) break;
        const marker = buf[i + 1];
        if (marker === 0xc0 || marker === 0xc2) {
          // height at i+5 (2 bytes BE), width at i+7 (2 bytes BE)
          return { width: readUint16BE(buf, i + 7), height: readUint16BE(buf, i + 5) };
        }
        if (marker === 0xda) break; // SOS — no SOF found before image data
        const segLen = (buf[i + 2] << 8) | buf[i + 3];
        i += 2 + segLen;
      }
      return null;
    }

    if (type.type === "webp") {
      // VP8 / VP8L / VP8X sub-formats
      const sub = String.fromCharCode(buf[12], buf[13], buf[14], buf[15]);
      if (sub === "VP8 ") {
        // Width (14 bits) and height (14 bits) stored as (w-1) and (h-1)
        const w = ((buf[26] | (buf[27] << 8)) & 0x3fff) + 1;
        const h = ((buf[28] | (buf[29] << 8)) & 0x3fff) + 1;
        return { width: w, height: h };
      }
      if (sub === "VP8L") {
        const bits = buf[21] | (buf[22] << 8) | (buf[23] << 16) | (buf[24] << 24);
        const w = (bits & 0x3fff) + 1;
        const h = ((bits >> 14) & 0x3fff) + 1;
        return { width: w, height: h };
      }
      if (sub === "VP8X") {
        // Canvas width (24-bit LE + 1) at offset 24, height at 27
        const w = (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1;
        const h = (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1;
        return { width: w, height: h };
      }
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * @typedef {object} ValidationOptions
 * @property {string[]} [allowedTypes] - Allowed type strings, e.g. ["jpeg","png","webp"]
 * @property {number} [maxBytes] - Max file size in bytes
 * @property {number} [maxWidth] - Max image width in pixels
 * @property {number} [maxHeight] - Max image height in pixels
 * @property {number} [minWidth] - Min image width in pixels
 * @property {number} [minHeight] - Min image height in pixels
 */

/**
 * Validate an image buffer against type, size, and dimension constraints.
 *
 * @param {Buffer|Uint8Array|ArrayBuffer} input
 * @param {ValidationOptions} [opts]
 * @returns {{ ok: boolean, type?: string, mime?: string, width?: number, height?: number, error?: string }}
 */
export function validateImage(input, opts = {}) {
  const buf = toUint8Array(input);
  const { allowedTypes, maxBytes, maxWidth, maxHeight, minWidth, minHeight } = opts;

  const detected = detectImageType(buf);
  if (!detected) {
    console.error("[image-upload] File type not recognised — magic bytes did not match any supported format");
    return { ok: false, error: "unsupported_type" };
  }

  if (allowedTypes && !allowedTypes.includes(detected.type)) {
    console.error(`[image-upload] File type "${detected.type}" not in allowed list: ${allowedTypes.join(", ")}`);
    return { ok: false, error: "type_not_allowed" };
  }

  if (maxBytes && buf.length > maxBytes) {
    console.error(`[image-upload] File size ${buf.length} exceeds limit ${maxBytes}`);
    return { ok: false, error: "too_large" };
  }

  const dims = readDimensions(buf);
  if (dims) {
    if (maxWidth  && dims.width  > maxWidth)  return { ok: false, error: "width_exceeded" };
    if (maxHeight && dims.height > maxHeight) return { ok: false, error: "height_exceeded" };
    if (minWidth  && dims.width  < minWidth)  return { ok: false, error: "width_too_small" };
    if (minHeight && dims.height < minHeight) return { ok: false, error: "height_too_small" };
  }

  return { ok: true, ...detected, ...(dims ?? {}) };
}

// ---------------------------------------------------------------------------
// Presigned S3 PUT URL — direct browser-to-S3 upload, no server proxy
// ---------------------------------------------------------------------------

/**
 * Generate a presigned S3 PUT URL so a browser can upload directly.
 * Uses AWS Signature V4 with the Web Crypto API — zero dependencies.
 *
 * @param {object} params
 * @param {string} params.accessKeyId
 * @param {string} params.secretAccessKey
 * @param {string} params.bucket
 * @param {string} params.region
 * @param {string} params.key - Object key (path in bucket)
 * @param {string} params.contentType - Must match what the browser sends
 * @param {number} [params.expiresIn=3600] - Validity in seconds (max 604800)
 * @param {string} [params.endpoint] - Custom endpoint for R2 / MinIO
 * @returns {Promise<string|null>} Presigned URL or null on error
 */
export async function presignUploadUrl({
  accessKeyId, secretAccessKey, bucket, region, key,
  contentType, expiresIn = 3600, endpoint,
}) {
  try {
    const host = endpoint
      ? new URL(endpoint).host
      : `${bucket}.s3.${region}.amazonaws.com`;
    const baseUrl = endpoint
      ? `${endpoint}/${bucket}`
      : `https://${bucket}.s3.${region}.amazonaws.com`;

    const now = new Date();
    const dateStamp = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const shortDate = dateStamp.slice(0, 8);
    const scope = `${shortDate}/${region}/s3/aws4_request`;

    const queryParams = new URLSearchParams({
      "X-Amz-Algorithm":     "AWS4-HMAC-SHA256",
      "X-Amz-Credential":    `${accessKeyId}/${scope}`,
      "X-Amz-Date":          dateStamp,
      "X-Amz-Expires":       String(expiresIn),
      "X-Amz-SignedHeaders": "content-type;host",
    });

    const canonicalRequest = [
      "PUT",
      "/" + key,
      queryParams.toString(),
      `content-type:${contentType}\nhost:${host}\n`,
      "content-type;host",
      "UNSIGNED-PAYLOAD",
    ].join("\n");

    const stringToSign = [
      "AWS4-HMAC-SHA256",
      dateStamp,
      scope,
      await sha256Hex(canonicalRequest),
    ].join("\n");

    const signingKey = await deriveSigningKey(secretAccessKey, shortDate, region, "s3");
    const signature  = await hmacHex(signingKey, stringToSign);

    queryParams.set("X-Amz-Signature", signature);
    return `${baseUrl}/${key}?${queryParams.toString()}`;
  } catch (err) {
    console.error(`[image-upload] presignUploadUrl failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Thumbnail pipeline configuration (for Sharp — not imported directly)
// ---------------------------------------------------------------------------

/**
 * @typedef {object} ThumbnailSpec
 * @property {string} suffix - Filename suffix, e.g. "_sm"
 * @property {number} width
 * @property {number} height
 * @property {'cover'|'contain'|'fill'|'inside'|'outside'} fit
 * @property {'jpeg'|'webp'|'png'|'avif'} format
 * @property {number} quality - 1–100
 */

/**
 * Return a Sharp-compatible pipeline configuration for common thumbnail presets.
 * Pass each config object to `sharp(input).resize(cfg.resize).toFormat(cfg.format, cfg.formatOptions)`.
 *
 * @param {object} [opts]
 * @param {string} [opts.format="webp"] - Output format: "jpeg"|"webp"|"avif"|"png"
 * @param {number} [opts.quality=82] - Compression quality
 * @returns {ThumbnailSpec[]}
 */
export function thumbnailPipelineConfigs(opts = {}) {
  const format  = opts.format  ?? "webp";
  const quality = opts.quality ?? 82;

  return [
    { suffix: "_thumb", width: 150,  height: 150,  fit: "cover",   format, quality },
    { suffix: "_sm",    width: 400,  height: 400,  fit: "inside",  format, quality },
    { suffix: "_md",    width: 800,  height: 800,  fit: "inside",  format, quality },
    { suffix: "_lg",    width: 1600, height: 1600, fit: "inside",  format, quality },
  ];
}

/**
 * Build a Sharp pipeline descriptor for a single resize operation.
 * Returns an object you pass to your own Sharp invocation — this package does not import Sharp.
 *
 * @param {object} params
 * @param {number} params.width
 * @param {number} params.height
 * @param {'cover'|'contain'|'fill'|'inside'|'outside'} [params.fit="inside"]
 * @param {'jpeg'|'webp'|'avif'|'png'} [params.format="webp"]
 * @param {number} [params.quality=82]
 * @param {boolean} [params.stripMetadata=true] - Strip EXIF via Sharp's withMetadata(false)
 * @returns {{ resize: object, format: string, formatOptions: object, withMetadata: boolean }}
 */
export function buildThumbnailConfig({ width, height, fit = "inside", format = "webp", quality = 82, stripMetadata = true }) {
  return {
    resize:        { width, height, fit, withoutEnlargement: true },
    format,
    formatOptions: { quality },
    withMetadata:  !stripMetadata,
  };
}

// ---------------------------------------------------------------------------
// Multipart form-data parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parse a multipart/form-data body into fields and file parts.
 * Suitable for use in Node.js route handlers where you have the raw Buffer.
 *
 * @param {Buffer|Uint8Array} body - Raw request body
 * @param {string} boundary - Boundary string from Content-Type header
 * @returns {Array<{ name: string, filename?: string, contentType?: string, data: Uint8Array }>|null}
 */
export function parseMultipart(body, boundary) {
  try {
    const buf = toUint8Array(body);
    const enc = new TextEncoder();
    const dec = new TextDecoder();
    const delimiter     = enc.encode(`--${boundary}`);
    const delimiterCRLF = enc.encode(`--${boundary}\r\n`);
    const lastDelimiter = enc.encode(`--${boundary}--`);
    const parts = [];

    let pos = 0;
    while (pos < buf.length) {
      // Find next delimiter
      const start = indexOf(buf, delimiter, pos);
      if (start === -1) break;
      pos = start + delimiter.length;

      // Check for final delimiter
      if (bufStartsWith(buf, lastDelimiter.slice(delimiter.length), pos)) break;

      // Skip CRLF after delimiter
      if (buf[pos] === 0x0d && buf[pos + 1] === 0x0a) pos += 2;

      // Parse headers (terminated by \r\n\r\n)
      const headerEnd = indexOf(buf, enc.encode("\r\n\r\n"), pos);
      if (headerEnd === -1) break;
      const headerBlock = dec.decode(buf.slice(pos, headerEnd));
      pos = headerEnd + 4;

      const headers = parsePartHeaders(headerBlock);
      const cd = headers["content-disposition"] ?? "";
      const name     = extractParam(cd, "name");
      const filename = extractParam(cd, "filename");
      const contentType = headers["content-type"];

      // Data runs until next delimiter (preceded by \r\n)
      const nextDelim = indexOf(buf, delimiter, pos);
      if (nextDelim === -1) break;
      // Strip trailing \r\n before delimiter
      const dataEnd = nextDelim - 2;
      const data = buf.slice(pos, dataEnd);
      pos = nextDelim;

      if (name) parts.push({ name, ...(filename ? { filename } : {}), ...(contentType ? { contentType } : {}), data });
    }

    return parts;
  } catch (err) {
    console.error(`[image-upload] parseMultipart failed: ${err.message}`);
    return null;
  }
}

/**
 * Extract the boundary string from a Content-Type header value.
 *
 * @param {string} contentTypeHeader - e.g. "multipart/form-data; boundary=----WebKitFormBoundary..."
 * @returns {string|null}
 */
export function extractBoundary(contentTypeHeader) {
  const m = /boundary=(?:"([^"]+)"|([^\s;]+))/.exec(contentTypeHeader);
  return m ? (m[1] ?? m[2]) : null;
}

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

function toUint8Array(input) {
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (input instanceof Uint8Array)  return input;
  // Node.js Buffer is a Uint8Array subclass — this covers it
  return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
}

function concatUint8Arrays(arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out   = new Uint8Array(total);
  let offset  = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

function readUint32BE(buf, offset) {
  return ((buf[offset] << 24) | (buf[offset+1] << 16) | (buf[offset+2] << 8) | buf[offset+3]) >>> 0;
}
function readUint16BE(buf, offset) { return (buf[offset] << 8) | buf[offset + 1]; }
function readUint16LE(buf, offset) { return buf[offset] | (buf[offset + 1] << 8); }

function indexOf(haystack, needle, start = 0) {
  outer: for (let i = start; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function bufStartsWith(buf, prefix, offset) {
  for (let i = 0; i < prefix.length; i++) {
    if (buf[offset + i] !== prefix[i]) return false;
  }
  return true;
}

function parsePartHeaders(block) {
  const headers = {};
  for (const line of block.split("\r\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
  }
  return headers;
}

function extractParam(header, param) {
  const re = new RegExp(`${param}=(?:"([^"]*)"|([^\\s;]*))`, "i");
  const m  = re.exec(header);
  return m ? (m[1] ?? m[2]) : undefined;
}

// AWS SigV4 crypto helpers (Web Crypto API)
async function sha256Hex(data) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash  = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(key, data) {
  const keyBytes  = typeof key  === "string" ? new TextEncoder().encode(key)  : key;
  const dataBytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, dataBytes));
}

async function hmacHex(key, data) {
  return Array.from(await hmac(key, data)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function deriveSigningKey(secret, date, region, service) {
  const kDate    = await hmac(`AWS4${secret}`, date);
  const kRegion  = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}
