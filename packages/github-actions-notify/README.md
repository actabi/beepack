# github-actions-notify

Verify GitHub webhook signatures and format workflow, deployment, check-run, and pull-request events as rich Slack Block Kit or Discord Embed notifications. Zero npm dependencies — uses `node:crypto` only.

## Setup

```bash
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here
```

Set this in GitHub under **Repository Settings → Webhooks → Secret**. The same secret is passed to `verifyGitHubWebhook` at runtime — no other environment variables are required.

## Usage

### Verify a webhook signature

Always verify before parsing. Pass the raw, unparsed request body — not the JSON-decoded object.

```js
import { verifyGitHubWebhook } from "./index.js";

// Express example — use raw body middleware before express.json()
app.post("/webhook", express.raw({ type: "*/*" }), (req, res) => {
  const valid = verifyGitHubWebhook(
    process.env.GITHUB_WEBHOOK_SECRET,
    req.body,                                   // raw Buffer
    req.headers["x-hub-signature-256"]          // or "x-hub-signature" for legacy SHA-1
  );

  if (!valid) return res.status(401).send("Bad signature");

  // safe to parse now
  const payload = JSON.parse(req.body.toString());
  const eventType = req.headers["x-github-event"];
  // ...
});
```

### Parse any webhook event

`parseWebhookEvent` dispatches to the correct type-specific parser automatically. All returned objects share the same base fields: `type`, `repo`, `actor`, `timestamp`, `url`.

```js
import { parseWebhookEvent } from "./index.js";

const payload = JSON.parse(req.body.toString());
const eventType = req.headers["x-github-event"];   // e.g. "workflow_run"

const event = parseWebhookEvent(payload, eventType);
// event.type, event.repo, event.actor, event.timestamp, event.url
// — plus type-specific fields shown below
```

Unknown event types are returned as a minimal object with a `raw` property containing the original payload.

### Parse a workflow_run event

```js
import { parseWorkflowRunEvent } from "./index.js";

const event = parseWorkflowRunEvent(payload);
// {
//   type: "workflow_run",
//   workflowName: "CI",
//   status: "completed",
//   conclusion: "success" | "failure" | "cancelled" | ...,
//   branch: "main",
//   commit: { sha: "a1b2c3d", message: "fix: correct off-by-one" },
//   duration: 142,          // seconds, null while in-progress
//   runNumber: 47,
//   runAttempt: 1,
//   repo, actor, timestamp, url
// }
```

### Parse a deployment_status event

```js
import { parseDeploymentStatusEvent } from "./index.js";

const event = parseDeploymentStatusEvent(payload);
// {
//   type: "deployment_status",
//   environment: "production",
//   state: "success" | "failure" | "error" | "pending" | "inactive",
//   description: "Deployed successfully",
//   deploymentUrl: "https://your-app.vercel.app",
//   ref: "main",
//   sha: "a1b2c3d",
//   task: "deploy",
//   repo, actor, timestamp, url
// }
```

### Parse a check_run event

```js
import { parseCheckRunEvent } from "./index.js";

const event = parseCheckRunEvent(payload);
// {
//   type: "check_run",
//   name: "Unit Tests",
//   status: "completed",
//   conclusion: "success" | "failure" | ...,
//   headSha: "a1b2c3d",
//   duration: 38,           // seconds, null if not yet completed
//   pullRequests: [{ number: 12, url: "https://github.com/..." }],
//   output: { title: "All tests passed", summary: "42 passed, 0 failed" },
//   checkSuiteId: 9876543,
//   appName: "GitHub Actions",
//   repo, actor, timestamp, url
// }
```

### Parse a pull_request event

```js
import { parsePullRequestEvent } from "./index.js";

const event = parsePullRequestEvent(payload);
// {
//   type: "pull_request",
//   action: "opened" | "closed" | "merged" | "synchronize" | "labeled" | ...,
//   number: 42,
//   title: "feat: add dark mode",
//   state: "open" | "closed",
//   merged: false,
//   branch: "feat/dark-mode",
//   baseBranch: "main",
//   draft: false,
//   labels: ["enhancement", "ui"],
//   reviewers: ["octocat"],
//   additions: 120,
//   deletions: 15,
//   changedFiles: 8,
//   repo, actor, timestamp, url
// }
```

### Format for Slack (Block Kit)

Pass the returned object directly as the body of a Slack incoming webhook POST.

```js
import { parseWebhookEvent, formatSlackNotification } from "./index.js";

const event = parseWebhookEvent(payload, req.headers["x-github-event"]);
const message = formatSlackNotification(event);

await fetch(process.env.SLACK_WEBHOOK_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(message),
});
// message = { attachments: [{ color, title, fields, footer, ts }], blocks: [...] }
```

The sidebar color and button style reflect the event outcome: green for success, red for failure, yellow for in-progress/pending, blue for informational.

### Format for Discord (Embeds)

Pass the returned embed inside an `embeds` array in your Discord webhook payload.

```js
import { parseWebhookEvent, formatDiscordEmbed } from "./index.js";

const event = parseWebhookEvent(payload, req.headers["x-github-event"]);
const embed = formatDiscordEmbed(event);

await fetch(process.env.DISCORD_WEBHOOK_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ embeds: [embed] }),
});
// embed = { title, description, color, url, fields, footer, timestamp }
```

Discord embed colors are integer RGB values (`0x2cbe4e` for success, etc.) as required by the Discord API.

## Edge Cases Handled

- **Timing-safe signature comparison** — Uses `timingSafeEqual` from `node:crypto` instead of `===` to prevent signature leakage through timing side-channels.
- **SHA-1 backward compatibility** — `verifyGitHubWebhook` accepts both the current `X-Hub-Signature-256` (SHA-256) header and the legacy `X-Hub-Signature` (SHA-1) header, detected automatically from the `sha256=` or `sha1=` prefix.
- **Buffer length mismatch guard** — `timingSafeEqual` throws if buffers differ in length; the function pre-checks lengths and returns `false` rather than throwing, so bad signatures never crash the server.
- **Workflow run duration** — Duration is only calculated when `status === "completed"` and both timestamps are present and valid. It returns `null` for queued or in-progress runs to avoid negative or nonsensical values.
- **Check run duration** — Uses `started_at` / `completed_at` (not `created_at` / `updated_at`) for accuracy; `null` when either timestamp is missing.
- **Short SHAs** — All commit/head SHA fields are sliced to 7 characters to match GitHub's display format; the full SHA is never exposed.
- **Multi-actor workflow runs** — `triggering_actor` (the user who triggered the re-run) is preferred over `actor` (the original committer) and `sender` (the webhook sender), matching GitHub's own UI behavior.
- **Unknown event types** — `parseWebhookEvent` returns a safe minimal object with the raw payload attached rather than throwing, so a single webhook endpoint handles future GitHub event types without code changes.
- **Missing or malformed payloads** — All parsers use optional chaining (`?.`) and nullish coalescing (`??`) throughout; no field access will throw on incomplete payloads.
- **Discord commit message truncation** — Commit messages in Discord embeds are capped at 60 characters to stay within Discord's embed field limits; check run output summaries are capped at 1024 characters.
