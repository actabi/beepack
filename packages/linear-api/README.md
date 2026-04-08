# linear-api

Linear API client covering issue CRUD, team/project queries, comment creation, label management, full-text search, and webhook ingestion with signature verification. Zero dependencies — native fetch and Web Crypto API only.

## Setup

```bash
LINEAR_API_KEY=lin_api_...         # Personal API key from Linear Settings → API
LINEAR_WEBHOOK_SECRET=whsec_...    # Webhook signing secret from Linear Settings → Webhooks
```

Generate a personal API key at **Linear → Settings → API → Personal API keys**.

To create webhooks go to **Settings → API → Webhooks** and add a new endpoint. Copy the signing secret shown at creation time.

## Usage

### List Teams

```js
import { listTeams, listTeamStates } from "./index.js";

const teams = await listTeams(process.env.LINEAR_API_KEY);
// [{ id: "uuid", name: "Engineering", key: "ENG", description: null }, ...]

// Fetch workflow states for a team (needed for setIssueStatus)
const states = await listTeamStates(process.env.LINEAR_API_KEY, teams[0].id);
// [{ id: "uuid", name: "In Progress", type: "started", color: "#f59e0b", position: 2 }, ...]
```

### Create an Issue

```js
import { createIssue } from "./index.js";

const issue = await createIssue(
  process.env.LINEAR_API_KEY,
  "team-uuid",
  "Fix login redirect loop",
  {
    description: "Users are redirected in a loop when SSO is enabled.",
    priority: 1,           // 1 = Urgent
    assigneeId: "user-uuid",
    labelIds: ["label-uuid-bug"],
    stateId: "state-uuid-todo",
    dueDate: "2026-04-15",
    projectId: "project-uuid",
  }
);
// { id: "...", identifier: "ENG-42", title: "...", url: "https://linear.app/...", ... }
```

### Get an Issue

```js
import { getIssue } from "./index.js";

const issue = await getIssue(process.env.LINEAR_API_KEY, "issue-uuid");
// Full issue object with state, assignee, labels, project, team, parent, timestamps
```

### Update an Issue

```js
import { updateIssue } from "./index.js";

// Update any combination of fields — only provided fields change
const updated = await updateIssue(process.env.LINEAR_API_KEY, "issue-uuid", {
  title: "Fix SSO redirect loop",
  priority: 2,
  dueDate: "2026-04-20",
});
```

### Update Status, Assignee, or Priority

```js
import { setIssueStatus, setIssueAssignee, setIssuePriority } from "./index.js";

await setIssueStatus(process.env.LINEAR_API_KEY, "issue-uuid", "state-uuid-in-progress");
await setIssueAssignee(process.env.LINEAR_API_KEY, "issue-uuid", "user-uuid");
await setIssueAssignee(process.env.LINEAR_API_KEY, "issue-uuid", null); // unassign
await setIssuePriority(process.env.LINEAR_API_KEY, "issue-uuid", 3);   // 3 = Medium
```

### Search Issues

```js
import { searchIssues } from "./index.js";

// Search workspace-wide
const results = await searchIssues(process.env.LINEAR_API_KEY, "redirect loop", { first: 10 });

// Restrict to a single team using a Linear GraphQL filter
const engResults = await searchIssues(process.env.LINEAR_API_KEY, "auth bug", {
  first: 20,
  filter: { team: { key: { eq: "ENG" } } },
});
// [{ id, identifier, title, priority, url, state, assignee, team, createdAt, updatedAt }, ...]
```

### Create a Comment

```js
import { createComment } from "./index.js";

const comment = await createComment(
  process.env.LINEAR_API_KEY,
  "issue-uuid",
  "Reproduced on staging. Root cause is the missing `returnTo` param in the OAuth flow."
);
// { id: "...", body: "...", createdAt: "...", user: { name: "...", email: "..." } }
```

### List and Manage Labels

```js
import { listLabels, addLabels, removeLabels } from "./index.js";

const labels = await listLabels(process.env.LINEAR_API_KEY, "team-uuid");
// [{ id: "uuid", name: "bug", color: "#ef4444", description: null }, ...]

// Add labels (merged with existing — no duplicates)
await addLabels(process.env.LINEAR_API_KEY, "issue-uuid", ["label-uuid-bug"]);

// Remove specific labels
await removeLabels(process.env.LINEAR_API_KEY, "issue-uuid", ["label-uuid-bug"]);
```

### List Projects

```js
import { listProjects } from "./index.js";

const projects = await listProjects(process.env.LINEAR_API_KEY, "team-uuid");
// [{ id, name, state, progress, description, startDate, targetDate }, ...]
```

### Verify Webhook Signature

```js
import { verifyWebhook } from "./index.js";

// Express example — body must be the raw string before JSON.parse
app.post("/webhooks/linear", express.text({ type: "*/*" }), async (req, res) => {
  const result = await verifyWebhook(
    req.body,
    req.headers["linear-signature"],
    process.env.LINEAR_WEBHOOK_SECRET
  );

  if (!result.valid) {
    console.error("[webhook] Rejected:", result.error);
    return res.status(400).json({ error: result.error });
  }

  const { type, data } = result.payload;

  switch (type) {
    case "Issue":
      console.log("Issue event:", data.action, data.id);
      break;
    case "Comment":
      console.log("New comment on issue:", data.issueId);
      break;
  }

  res.json({ ok: true });
});
```

## Priority Reference

| Value | Label       |
|-------|-------------|
| 0     | No priority |
| 1     | Urgent      |
| 2     | High        |
| 3     | Medium      |
| 4     | Low         |

## Edge Cases

- **Missing env vars** — All functions accept the API key as an explicit argument rather than reading `process.env` themselves, so you control the key source and can catch missing values before any network call.
- **GraphQL errors with partial data** — When Linear returns both `errors` and `data`, the error is logged and `null` is returned. This is conservative but safe; callers never receive incomplete objects silently.
- **Bearer token format** — The `Authorization` header is always `Bearer <key>`. Personal API keys and OAuth tokens both use this scheme; do not prepend `Bearer` yourself.
- **Label add/remove race** — `addLabels` and `removeLabels` each do a `getIssue` round-trip to read the current label set before writing. Under concurrent updates the last write wins; use optimistic locking or a queue for high-concurrency scenarios.
- **Network failures and timeouts** — All requests use a 15-second `AbortSignal.timeout`. Any network error, timeout, or non-2xx response logs with `[linear-api]` and returns `null` instead of throwing.
- **Webhook body parsing** — Pass the raw body string to `verifyWebhook` **before** any `JSON.parse`. Framework body parsers (Express JSON, Next.js `bodyParser`) will corrupt the raw bytes needed for signature verification. Use `express.text()` or disable body parsing for the webhook route.
- **Webhook secret rotation** — If you rotate the signing secret in Linear, update `LINEAR_WEBHOOK_SECRET` before the old secret expires. During a rotation window you may need to accept signatures from both the old and new secrets.
- **Sub-issues** — Pass `parentId` to `createIssue` to create a sub-issue. The Linear API enforces that the parent and child must belong to the same team.
