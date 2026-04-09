# slack-webhook

Send Slack messages via incoming webhooks and the Web API. Includes Block Kit helpers, threaded replies, and file uploads. Zero dependencies.

## Setup

For webhooks (simplest):
```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../xxx
```

For Web API (richer features):
```bash
SLACK_BOT_TOKEN=xoxb-...
```

## Usage

### Incoming Webhook (No Bot Token Needed)

```js
import { sendWebhook } from "./index.js";

await sendWebhook(process.env.SLACK_WEBHOOK_URL, {
  text: "Deployment complete :rocket:",
});

// With Block Kit
import { blocks } from "./index.js";
await sendWebhook(process.env.SLACK_WEBHOOK_URL, {
  text: "Deploy notification",
  blocks: [
    blocks.header("Deployment Complete"),
    blocks.section("*Production* was updated to `v2.3.1`"),
    blocks.fields(["*Status:* :white_check_mark: Success", "*Duration:* 45s"]),
    blocks.divider(),
    blocks.context(["Deployed by CI at " + new Date().toISOString()]),
  ],
});
```

### Web API (Channel Messages)

```js
import { postMessage } from "./index.js";

// Send to channel
const result = await postMessage(process.env.SLACK_BOT_TOKEN, {
  channel: "C0123456789",
  text: "New signup: user@example.com",
});

// Reply in thread
await postMessage(process.env.SLACK_BOT_TOKEN, {
  channel: "C0123456789",
  text: "Processing complete",
  threadTs: result.ts,
});
```

### File Upload

```js
import { uploadFile } from "./index.js";
import { readFileSync } from "fs";

await uploadFile(process.env.SLACK_BOT_TOKEN, {
  channel: "C0123456789",
  file: readFileSync("report.csv"),
  filename: "report.csv",
  title: "Weekly Report",
  comment: "Here's the weekly report",
});
```

## Block Kit Helpers

| Helper | Description |
|--------|-------------|
| `blocks.section(text)` | Markdown text section |
| `blocks.fields([...])` | Two-column field layout |
| `blocks.header(text)` | Large header text |
| `blocks.divider()` | Horizontal divider |
| `blocks.context([...])` | Small grey context text |
| `blocks.actions([...])` | Button row |

## Edge Cases Handled

- **File upload v2** — uses the new 3-step upload flow (getUploadURLExternal)
- **Thread replies** — supports threadTs on all message methods
- **Notification fallback** — always include `text` alongside `blocks` for mobile notifications
- **Timeouts** — 15s for messages, 30s for file uploads
