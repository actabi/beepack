# image-upload

Secure image upload pipeline helpers. Zero dependencies — everything runs on native Node.js ≥ 18 APIs and the Web Crypto API.

Covers the failure modes that bite you in production: trusting Content-Type headers (spoofable), forgetting to strip GPS coordinates from phone photos, and shipping Sharp as a hard dependency.

## What's inside

| Export | What it does |
|---|---|
| `detectImageType(buf)` | Magic-byte inspection for JPEG, PNG, GIF, WebP, AVIF, HEIC |
| `stripExif(buf)` | Removes all EXIF segments from a JPEG (including GPS coordinates) |
| `validateImage(buf, opts)` | Type + size + dimension guard in one call |
| `readDimensions(buf)` | Width/height from raw bytes, no decode |
| `presignUploadUrl(params)` | AWS SigV4 presigned PUT URL — browser uploads directly to S3 |
| `thumbnailPipelineConfigs(opts)` | Returns config objects for your Sharp pipeline |
| `buildThumbnailConfig(params)` | Single Sharp resize descriptor |
| `parseMultipart(body, boundary)` | Multipart form-data parser for raw request buffers |
| `extractBoundary(header)` | Pull boundary string from Content-Type header |

## Setup

No environment variables required at module level. S3 credentials are passed per-call to `presignUploadUrl` so you can use different buckets / accounts at runtime.

Node.js ≥ 18 is required for `crypto.subtle` and `AbortSignal.timeout`.

## Usage

### Validate an uploaded file

```js
import { validateImage } from "./index.js";

const result = validateImage(fileBuffer, {
  allowedTypes: ["jpeg", "png", "webp"],
  maxBytes:     10 * 1024 * 1024, // 10 MB
  maxWidth:     4000,
  maxHeight:    4000,
});

if (!result.ok) {
  return res.status(400).json({ error: result.error });
}
// result.type  → "jpeg"
// result.width → 1920, result.height → 1080
```

### Strip GPS / EXIF before storing

```js
import { stripExif, validateImage } from "./index.js";

const validation = validateImage(rawBuffer, { allowedTypes: ["jpeg"] });
if (!validation.ok) throw new Error(validation.error);

// Remove GPS coordinates and all other EXIF data
const clean = stripExif(rawBuffer);
// store `clean`, not `rawBuffer`
```

### Detect file type (never trust Content-Type)

```js
import { detectImageType } from "./index.js";

// Attacker uploads a PHP file renamed to photo.jpg
const detected = detectImageType(uploadedBuffer);
if (!detected || detected.type !== "jpeg") {
  return res.status(400).json({ error: "Not a JPEG" });
}
```

### Presigned PUT URL — direct browser-to-S3

```js
import { presignUploadUrl } from "./index.js";

// Called from your API route — credentials never reach the browser
const url = await presignUploadUrl({
  accessKeyId:     process.env.S3_KEY,
  secretAccessKey: process.env.S3_SECRET,
  bucket:          "my-bucket",
  region:          "us-east-1",
  key:             `uploads/${crypto.randomUUID()}.jpg`,
  contentType:     "image/jpeg",
  expiresIn:       300, // 5 minutes
});

// Return `url` to the browser; browser does:
// fetch(url, { method: "PUT", body: file, headers: { "Content-Type": "image/jpeg" } })
```

For Cloudflare R2 pass `endpoint`:

```js
const url = await presignUploadUrl({
  accessKeyId:     process.env.R2_KEY,
  secretAccessKey: process.env.R2_SECRET,
  bucket:          "my-bucket",
  region:          "auto",
  endpoint:        `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  key:             "uploads/photo.jpg",
  contentType:     "image/webp",
  expiresIn:       600,
});
```

### Sharp thumbnail pipeline

This package does **not** import Sharp (native binary, not always available). Instead it returns config objects you feed into your own Sharp instance:

```js
import sharp from "sharp";
import { thumbnailPipelineConfigs, stripExif } from "./index.js";

const clean  = stripExif(originalBuffer);
const presets = thumbnailPipelineConfigs({ format: "webp", quality: 82 });

for (const preset of presets) {
  const output = await sharp(clean)
    .resize(preset.width, preset.height, { fit: preset.fit, withoutEnlargement: true })
    .toFormat(preset.format, { quality: preset.quality })
    .withMetadata(false) // strip EXIF via Sharp too
    .toBuffer();

  await s3.upload(`images/photo${preset.suffix}.webp`, output, "image/webp");
}
```

Custom size:

```js
import { buildThumbnailConfig } from "./index.js";

const cfg = buildThumbnailConfig({ width: 600, height: 400, fit: "cover", format: "jpeg" });

const thumb = await sharp(buffer)
  .resize(cfg.resize)
  .toFormat(cfg.format, cfg.formatOptions)
  .withMetadata(cfg.withMetadata)
  .toBuffer();
```

### Multipart form-data parsing

```js
import { parseMultipart, extractBoundary, validateImage, stripExif } from "./index.js";

// In a Node.js HTTP handler:
const boundary = extractBoundary(req.headers["content-type"]);
if (!boundary) return res.status(400).end("Missing boundary");

const chunks = [];
for await (const chunk of req) chunks.push(chunk);
const body = Buffer.concat(chunks);

const parts = parseMultipart(body, boundary);
if (!parts) return res.status(400).end("Malformed multipart");

for (const part of parts) {
  if (!part.filename) continue; // skip non-file fields

  const validation = validateImage(part.data, {
    allowedTypes: ["jpeg", "png", "webp", "avif"],
    maxBytes: 20 * 1024 * 1024,
  });

  if (!validation.ok) {
    return res.status(400).json({ error: validation.error, field: part.name });
  }

  const safe = stripExif(part.data); // remove GPS before storing
  await s3.upload(`uploads/${part.filename}`, safe, validation.mime);
}
```

## Edge cases handled

- **Magic-byte validation** — inspects raw bytes, never trusts the `Content-Type` header which any client can forge
- **HEIC from iPhones** — detected via ISO Base Media `ftyp` box brand matching (`heic`, `heix`, `hevc`, and variants)
- **GPS stripping** — `stripExif` removes the entire EXIF APP1 segment from JPEGs, eliminating GPS coordinates, device model, and timestamp
- **WebP sub-formats** — handles VP8 (lossy), VP8L (lossless), and VP8X (extended) for dimension reading
- **Sharp as optional** — pipeline config objects keep Sharp out of the dependency graph; use it only when the server environment supports native modules
- **Presigned URL signed headers** — includes `content-type` in `SignedHeaders` so S3 enforces the declared MIME type on upload
- **AVIF/HEIC dimension reading** — not implemented (requires full ISO BMFF box parsing); `readDimensions` returns null for these; use Sharp for dimension validation on those formats
