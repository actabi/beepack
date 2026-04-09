// GitHub Actions Notifier
// Zero npm dependencies — uses node:crypto for HMAC verification only.
// Verifies webhook signatures, parses workflow/deployment/check/PR events,
// and formats rich notifications for Slack (Block Kit) and Discord (Embeds).

import { createHmac, timingSafeEqual } from "node:crypto";

const TIMEOUT_MS = 15000; // retained for API consistency

// ---------------------------------------------------------------------------
// Webhook signature verification
// ---------------------------------------------------------------------------

/**
 * Verify a GitHub webhook request's HMAC signature.
 * Supports both the current sha256= format (X-Hub-Signature-256 header) and
 * the legacy sha1= format (X-Hub-Signature header) for backward compatibility.
 * Uses constant-time comparison to prevent timing attacks.
 *
 * @param {string} secret - The webhook secret configured in GitHub (GITHUB_WEBHOOK_SECRET)
 * @param {string|Buffer} rawBody - The raw, unparsed request body bytes
 * @param {string} signatureHeader - Value of X-Hub-Signature-256 or X-Hub-Signature header
 *   e.g. "sha256=abc123..." or "sha1=def456..."
 * @returns {boolean} True if the signature is valid, false otherwise
 */
export function verifyGitHubWebhook(secret, rawBody, signatureHeader) {
  if (!secret || !rawBody || !signatureHeader) return false;

  try {
    const [algo, sig] = signatureHeader.split("=");
    if (!algo || !sig) return false;

    const hmacAlgo = algo === "sha256" ? "sha256" : algo === "sha1" ? "sha1" : null;
    if (!hmacAlgo) return false;

    const hmac = createHmac(hmacAlgo, secret);
    hmac.update(rawBody);
    const digest = hmac.digest("hex");

    // Use timingSafeEqual to prevent timing attacks — buffers must be same length
    const sigBuf = Buffer.from(sig, "hex");
    const digestBuf = Buffer.from(digest, "hex");

    if (sigBuf.length !== digestBuf.length) return false;
    return timingSafeEqual(sigBuf, digestBuf);
  } catch (err) {
    console.error(`[github-actions-notify] Signature verification failed: ${err.message}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Generic event dispatcher
// ---------------------------------------------------------------------------

/**
 * Parse a raw GitHub webhook payload into a normalized event object.
 * Dispatches to the appropriate type-specific parser based on the
 * X-GitHub-Event header value. Unknown event types return a minimal object.
 *
 * Normalized fields present on all event types:
 *   type, repo, actor, timestamp, url
 *
 * @param {object} payload - Parsed JSON body from the webhook request
 * @param {string} eventType - Value of the X-GitHub-Event request header
 * @returns {object} Normalized event object (shape varies by type)
 */
export function parseWebhookEvent(payload, eventType) {
  if (!payload || typeof payload !== "object") {
    console.error("[github-actions-notify] parseWebhookEvent: payload must be an object");
    return { type: "unknown", repo: null, actor: null, timestamp: null, url: null };
  }

  switch (eventType) {
    case "workflow_run":
      return parseWorkflowRunEvent(payload);
    case "deployment_status":
      return parseDeploymentStatusEvent(payload);
    case "check_run":
      return parseCheckRunEvent(payload);
    case "pull_request":
      return parsePullRequestEvent(payload);
    default:
      return {
        type: eventType || "unknown",
        repo: payload.repository?.full_name ?? null,
        actor: payload.sender?.login ?? null,
        timestamp: payload.repository?.updated_at ?? null,
        url: payload.repository?.html_url ?? null,
        raw: payload,
      };
  }
}

// ---------------------------------------------------------------------------
// Workflow run events
// ---------------------------------------------------------------------------

/**
 * Parse a workflow_run webhook event payload into a normalized object.
 * Calculates duration for completed runs from created_at / updated_at timestamps.
 *
 * @param {object} payload - Raw workflow_run event JSON payload
 * @returns {{
 *   type: string,
 *   repo: string,
 *   actor: string,
 *   timestamp: string,
 *   url: string,
 *   workflowName: string,
 *   status: 'queued'|'in_progress'|'completed',
 *   conclusion: 'success'|'failure'|'cancelled'|'skipped'|'timed_out'|'action_required'|null,
 *   branch: string,
 *   commit: {sha: string, message: string},
 *   duration: number|null
 * }}
 */
export function parseWorkflowRunEvent(payload) {
  const run = payload.workflow_run ?? payload;

  let duration = null;
  if (run.status === "completed" && run.created_at && run.updated_at) {
    const start = new Date(run.created_at).getTime();
    const end = new Date(run.updated_at).getTime();
    if (!isNaN(start) && !isNaN(end) && end >= start) {
      duration = Math.round((end - start) / 1000);
    }
  }

  return {
    type: "workflow_run",
    repo: payload.repository?.full_name ?? run.repository?.full_name ?? null,
    actor: run.triggering_actor?.login ?? run.actor?.login ?? payload.sender?.login ?? null,
    timestamp: run.updated_at ?? run.created_at ?? null,
    url: run.html_url ?? null,
    workflowName: run.name ?? null,
    status: run.status ?? null,
    conclusion: run.conclusion ?? null,
    branch: run.head_branch ?? null,
    commit: {
      sha: run.head_sha ? run.head_sha.slice(0, 7) : null,
      message: run.head_commit?.message?.split("\n")[0] ?? null,
    },
    duration,
    runNumber: run.run_number ?? null,
    runAttempt: run.run_attempt ?? null,
  };
}

// ---------------------------------------------------------------------------
// Deployment status events
// ---------------------------------------------------------------------------

/**
 * Parse a deployment_status webhook event payload into a normalized object.
 * Deployment status events fire when GitHub or an external system updates
 * the state of a deployment (e.g. after a CD pipeline completes).
 *
 * @param {object} payload - Raw deployment_status event JSON payload
 * @returns {{
 *   type: string,
 *   repo: string,
 *   actor: string,
 *   timestamp: string,
 *   url: string,
 *   environment: string,
 *   state: 'pending'|'success'|'failure'|'error'|'inactive',
 *   description: string|null,
 *   deploymentUrl: string|null,
 *   repoName: string
 * }}
 */
export function parseDeploymentStatusEvent(payload) {
  const status = payload.deployment_status ?? {};
  const deployment = payload.deployment ?? {};

  return {
    type: "deployment_status",
    repo: payload.repository?.full_name ?? null,
    actor: payload.sender?.login ?? status.creator?.login ?? null,
    timestamp: status.updated_at ?? status.created_at ?? null,
    url: status.deployment_url ?? deployment.url ?? null,
    environment: deployment.environment ?? status.environment ?? null,
    state: status.state ?? null,
    description: status.description ?? null,
    deploymentUrl: status.environment_url ?? status.log_url ?? null,
    repoName: payload.repository?.name ?? null,
    ref: deployment.ref ?? null,
    sha: deployment.sha ? deployment.sha.slice(0, 7) : null,
    task: deployment.task ?? null,
  };
}

// ---------------------------------------------------------------------------
// Check run events
// ---------------------------------------------------------------------------

/**
 * Parse a check_run webhook event payload into a normalized object.
 * Check runs are individual test/lint/build steps within a check suite.
 * Duration is computed from started_at and completed_at when available.
 *
 * @param {object} payload - Raw check_run event JSON payload
 * @returns {{
 *   type: string,
 *   repo: string,
 *   actor: string,
 *   timestamp: string,
 *   url: string,
 *   name: string,
 *   status: string,
 *   conclusion: string|null,
 *   headSha: string,
 *   pullRequests: Array<{number: number, url: string}>,
 *   duration: number|null,
 *   output: {title: string|null, summary: string|null}
 * }}
 */
export function parseCheckRunEvent(payload) {
  const run = payload.check_run ?? {};

  let duration = null;
  if (run.started_at && run.completed_at) {
    const start = new Date(run.started_at).getTime();
    const end = new Date(run.completed_at).getTime();
    if (!isNaN(start) && !isNaN(end) && end >= start) {
      duration = Math.round((end - start) / 1000);
    }
  }

  const pullRequests = (run.pull_requests ?? []).map((pr) => ({
    number: pr.number,
    url: pr.url ?? `https://github.com/${payload.repository?.full_name}/pull/${pr.number}`,
  }));

  return {
    type: "check_run",
    repo: payload.repository?.full_name ?? null,
    actor: payload.sender?.login ?? null,
    timestamp: run.completed_at ?? run.started_at ?? null,
    url: run.html_url ?? null,
    name: run.name ?? null,
    status: run.status ?? null,
    conclusion: run.conclusion ?? null,
    headSha: run.head_sha ? run.head_sha.slice(0, 7) : null,
    pullRequests,
    duration,
    output: {
      title: run.output?.title ?? null,
      summary: run.output?.summary ?? null,
    },
    checkSuiteId: run.check_suite?.id ?? null,
    appName: run.app?.name ?? null,
  };
}

// ---------------------------------------------------------------------------
// Pull request events
// ---------------------------------------------------------------------------

/**
 * Parse a pull_request webhook event payload into a normalized object.
 * Covers all PR actions: opened, closed, merged, synchronized, labeled, etc.
 *
 * @param {object} payload - Raw pull_request event JSON payload
 * @returns {{
 *   type: string,
 *   repo: string,
 *   actor: string,
 *   timestamp: string,
 *   url: string,
 *   action: string,
 *   number: number,
 *   title: string,
 *   state: 'open'|'closed',
 *   merged: boolean,
 *   branch: string,
 *   baseBranch: string,
 *   labels: string[],
 *   draft: boolean
 * }}
 */
export function parsePullRequestEvent(payload) {
  const pr = payload.pull_request ?? {};

  return {
    type: "pull_request",
    repo: payload.repository?.full_name ?? null,
    actor: payload.sender?.login ?? pr.user?.login ?? null,
    timestamp: pr.updated_at ?? pr.created_at ?? null,
    url: pr.html_url ?? null,
    action: payload.action ?? null,
    number: pr.number ?? null,
    title: pr.title ?? null,
    state: pr.state ?? null,
    merged: pr.merged ?? false,
    branch: pr.head?.ref ?? null,
    baseBranch: pr.base?.ref ?? null,
    labels: (pr.labels ?? []).map((l) => l.name),
    draft: pr.draft ?? false,
    additions: pr.additions ?? null,
    deletions: pr.deletions ?? null,
    changedFiles: pr.changed_files ?? null,
    reviewers: (pr.requested_reviewers ?? []).map((r) => r.login),
  };
}

// ---------------------------------------------------------------------------
// Notification formatters
// ---------------------------------------------------------------------------

/**
 * Determine a status color/emoji category from a normalized event object.
 * Used internally by Slack and Discord formatters.
 *
 * @param {object} event - Normalized event from any parser
 * @returns {'success'|'failure'|'warning'|'info'}
 */
function getStatusCategory(event) {
  const conclusion = event.conclusion ?? event.state ?? event.action ?? "";
  if (["success", "completed"].includes(conclusion)) return "success";
  if (["failure", "error", "failed"].includes(conclusion)) return "failure";
  if (["in_progress", "queued", "pending"].includes(event.status ?? conclusion)) return "warning";
  return "info";
}

/**
 * Format a normalized GitHub event as a Slack Block Kit message payload.
 * Includes a colored attachment sidebar, repo/branch/actor context fields,
 * and a button that links to the event URL.
 *
 * Pass the returned object directly as the body of a Slack webhook POST request.
 *
 * @param {object} event - Normalized event from parseWorkflowRunEvent, parseDeploymentStatusEvent,
 *   parseCheckRunEvent, or parsePullRequestEvent
 * @returns {object} Slack Block Kit message object with blocks[] and attachments[]
 */
export function formatSlackNotification(event) {
  const category = getStatusCategory(event);

  const colorMap = {
    success: "#2cbe4e",
    failure: "#cb2431",
    warning: "#dbab09",
    info: "#0075ca",
  };

  const emojiMap = {
    success: ":white_check_mark:",
    failure: ":x:",
    warning: ":hourglass_flowing_sand:",
    info: ":information_source:",
  };

  const color = colorMap[category];
  const emoji = emojiMap[category];

  // Build a human-readable title from the event type
  let title = event.type?.replace(/_/g, " ") ?? "GitHub Event";
  if (event.workflowName) title = `Workflow: ${event.workflowName}`;
  else if (event.name) title = `Check: ${event.name}`;
  else if (event.number) title = `PR #${event.number}: ${event.title ?? ""}`;
  else if (event.environment) title = `Deploy: ${event.environment}`;

  const statusText = [event.status, event.conclusion, event.state]
    .filter(Boolean)
    .join(" › ");

  const fields = [];
  if (event.repo) fields.push({ title: "Repository", value: event.repo, short: true });
  if (event.branch) fields.push({ title: "Branch", value: event.branch, short: true });
  if (event.actor) fields.push({ title: "Actor", value: event.actor, short: true });
  if (event.environment) fields.push({ title: "Environment", value: event.environment, short: true });
  if (statusText) fields.push({ title: "Status", value: statusText, short: true });
  if (event.duration != null) fields.push({ title: "Duration", value: `${event.duration}s`, short: true });
  if (event.commit?.sha) fields.push({ title: "Commit", value: event.commit.sha, short: true });

  const attachment = {
    color,
    title: `${emoji} ${title}`,
    title_link: event.url ?? undefined,
    fields,
    footer: "GitHub Actions",
    ts: event.timestamp ? Math.floor(new Date(event.timestamp).getTime() / 1000) : undefined,
  };

  const blocks = [];

  if (event.url) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View on GitHub", emoji: true },
          url: event.url,
          style: category === "failure" ? "danger" : "primary",
        },
      ],
    });
  }

  return {
    attachments: [attachment],
    blocks: blocks.length > 0 ? blocks : undefined,
  };
}

/**
 * Format a normalized GitHub event as a Discord embed object.
 * Returns a single embed suitable for posting via a Discord webhook.
 * The color field uses Discord's integer color format (RGB hex as integer).
 *
 * Pass the returned object inside an embeds[] array in your Discord webhook payload:
 *   fetch(webhookUrl, { method: 'POST', body: JSON.stringify({ embeds: [embed] }) })
 *
 * @param {object} event - Normalized event from any parser
 * @returns {{
 *   title: string,
 *   description: string,
 *   color: number,
 *   url: string|null,
 *   fields: Array<{name: string, value: string, inline: boolean}>,
 *   footer: {text: string},
 *   timestamp: string|null
 * }}
 */
export function formatDiscordEmbed(event) {
  const category = getStatusCategory(event);

  // Discord embed colors (integer representation of hex RGB)
  const colorMap = {
    success: 0x2cbe4e, // green
    failure: 0xcb2431, // red
    warning: 0xdbab09, // yellow
    info: 0x0075ca,   // blue
  };

  const color = colorMap[category];

  const emojiMap = {
    success: "✅",
    failure: "❌",
    warning: "⏳",
    info: "ℹ️",
  };

  const emoji = emojiMap[category];

  let title = event.type?.replace(/_/g, " ") ?? "GitHub Event";
  if (event.workflowName) title = `${emoji} Workflow: ${event.workflowName}`;
  else if (event.name) title = `${emoji} Check: ${event.name}`;
  else if (event.number) title = `${emoji} PR #${event.number}: ${event.title ?? ""}`;
  else if (event.environment) title = `${emoji} Deploy: ${event.environment}`;
  else title = `${emoji} ${title}`;

  const statusParts = [event.status, event.conclusion, event.state].filter(Boolean);
  const description = statusParts.length > 0
    ? `**Status:** ${statusParts.join(" › ")}`
    : event.description ?? "No additional details";

  const fields = [];
  if (event.repo) fields.push({ name: "Repository", value: event.repo, inline: true });
  if (event.branch) fields.push({ name: "Branch", value: `\`${event.branch}\``, inline: true });
  if (event.actor) fields.push({ name: "Actor", value: event.actor, inline: true });
  if (event.environment) fields.push({ name: "Environment", value: event.environment, inline: true });
  if (event.duration != null) fields.push({ name: "Duration", value: `${event.duration}s`, inline: true });
  if (event.commit?.sha) {
    const commitMsg = event.commit.message ? ` — ${event.commit.message.slice(0, 60)}` : "";
    fields.push({ name: "Commit", value: `\`${event.commit.sha}\`${commitMsg}`, inline: false });
  }
  if (event.output?.summary) {
    fields.push({ name: "Summary", value: event.output.summary.slice(0, 1024), inline: false });
  }

  return {
    title,
    description,
    color,
    url: event.url ?? null,
    fields,
    footer: { text: "GitHub Actions" },
    timestamp: event.timestamp ?? null,
  };
}
