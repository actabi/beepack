# s3-storage

Upload, download, and manage files on any S3-compatible storage (AWS S3, Cloudflare R2, MinIO, DigitalOcean Spaces). Includes presigned URL generation. Zero dependencies — implements AWS Signature V4 using the Web Crypto API.

This is the package that saves you from wrestling with AWS SDK v3's modular imports or implementing SigV4 from scratch.

## Setup

```bash
S3_ACCESS_KEY_ID=AKIA...
S3_SECRET_ACCESS_KEY=secret
S3_BUCKET=my-bucket
S3_REGION=us-east-1
```

For Cloudflare R2, set the endpoint:

```bash
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
```

## Usage

```js
import { createS3Client } from "./index.js";

const s3 = createS3Client({
  accessKeyId: process.env.S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  bucket: process.env.S3_BUCKET,
  region: process.env.S3_REGION,
  endpoint: process.env.S3_ENDPOINT, // optional, for R2/MinIO
});

// Upload
const result = await s3.upload("images/photo.jpg", fileBuffer, "image/jpeg");
// { key: "images/photo.jpg", url: "https://..." }

// Download
const file = await s3.download("images/photo.jpg");
// { body: ArrayBuffer, contentType: "image/jpeg" }

// List files
const files = await s3.list("images/", 100);
// [{ key: "images/photo.jpg", size: 12345, lastModified: "2026-01-01T..." }]

// Generate presigned URL (1 hour)
const url = await s3.presignedUrl("images/photo.jpg", 3600);

// Delete
await s3.remove("images/photo.jpg");
```

## Cloudflare R2 Example

```js
const r2 = createS3Client({
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  bucket: "my-r2-bucket",
  region: "auto",
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
});

await r2.upload("docs/report.pdf", pdfBuffer, "application/pdf");
```

## Edge Cases Handled

- **AWS Signature V4** — full implementation with canonical headers, signed payloads, and proper scope chain
- **S3 vs path-style URLs** — auto-detects based on endpoint presence
- **Presigned URLs** — proper query string signing for temporary access
- **XML parsing** — handles S3 ListObjectsV2 XML response without a DOM parser
- **Cross-provider** — tested patterns for AWS S3, Cloudflare R2, and MinIO
- **Timeouts** — 30s timeout on all operations, returns null instead of throwing
