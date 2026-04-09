# resend-email

Send transactional emails via the Resend API. Supports single sends, batch sends (up to 100), attachments, and delivery tracking. Zero dependencies.

## Setup

```bash
RESEND_API_KEY=re_...  # Get yours at https://resend.com
```

You also need a verified domain in your Resend dashboard.

## Usage

### Send a Single Email

```js
import { sendEmail } from "./index.js";

const result = await sendEmail(process.env.RESEND_API_KEY, {
  from: "App <noreply@yourdomain.com>",
  to: "user@example.com",
  subject: "Welcome!",
  html: "<h1>Welcome to our app</h1><p>Thanks for signing up.</p>",
});
// { id: "abc123" }
```

### Send with Attachments

```js
import { readFileSync } from "fs";

const pdf = readFileSync("invoice.pdf").toString("base64");
await sendEmail(process.env.RESEND_API_KEY, {
  from: "Billing <billing@yourdomain.com>",
  to: "customer@example.com",
  subject: "Your Invoice",
  html: "<p>Please find your invoice attached.</p>",
  attachments: [{ filename: "invoice.pdf", content: pdf }],
});
```

### Batch Send

```js
import { sendBatch } from "./index.js";

const result = await sendBatch(process.env.RESEND_API_KEY, [
  { from: "App <noreply@yourdomain.com>", to: "user1@example.com", subject: "Update", html: "<p>News</p>" },
  { from: "App <noreply@yourdomain.com>", to: "user2@example.com", subject: "Update", html: "<p>News</p>" },
]);
// { ids: ["abc123", "def456"] }
```

### Check Delivery Status

```js
import { getEmailStatus } from "./index.js";

const status = await getEmailStatus(process.env.RESEND_API_KEY, "abc123");
// { id: "abc123", status: "delivered", to: ["user@example.com"], ... }
```

## Edge Cases Handled

- **Batch limit enforcement** — rejects batches over 100 emails before hitting the API
- **Flexible recipients** — accepts string or array for `to`, `cc`, `bcc`
- **Network failures** — 15s timeout for single sends, 30s for batches, returns null instead of throwing
- **Attachment encoding** — expects base64-encoded content, matches Resend's API format
