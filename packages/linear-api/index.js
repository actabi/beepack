// Linear API Client
// Zero dependencies - uses native fetch and Web Crypto API with the Linear GraphQL API.
// Covers issue CRUD, team/project queries, comments, labels, search,
// and webhook ingestion with HMAC-SHA256 signature verification.

const LINEAR_API = "https://api.linear.app/graphql";
const TIMEOUT_MS = 15000;

// --- Core helper ---

/**
 * Execute a Linear GraphQL request.
 * Returns the `data` field of a successful response, or null on any error.
 * GraphQL-level errors are logged and cause null to be returned.
 *
 * @param {string} tag - Label used in error logs, e.g. "createIssue"
 * @param {string} apiKey - Linear API key (lin_api_...)
 * @param {string} gql - GraphQL query or mutation string
 * @param {object} [variables={}] - GraphQL variables
 * @returns {Promise<object|null>}
 */
async function request(tag, apiKey, gql, variables = {}) {
  try {
    const res = await fetch(LINEAR_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: gql, variables }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[linear-api] ${tag} HTTP ${res.status}: ${body}`);
      return null;
    }

    const json = await res.json();

    if (json.errors && json.errors.length > 0) {
      const msgs = json.errors.map((e) => e.message).join("; ");
      console.error(`[linear-api] ${tag} GraphQL error: ${msgs}`);
      if (!json.data) return null;
    }

    return json.data ?? null;
  } catch (err) {
    console.error(`[linear-api] ${tag} failed: ${err.message}`);
    return null;
  }
}

// --- Teams ---

/**
 * List all teams accessible to the authenticated user.
 *
 * @param {string} apiKey - Linear API key
 * @returns {Promise<Array<{id: string, name: string, key: string, description: string|null}>|null>}
 */
export async function listTeams(apiKey) {
  const data = await request("listTeams", apiKey, `
    query ListTeams {
      teams {
        nodes { id name key description }
      }
    }
  `);
  return data?.teams?.nodes ?? null;
}

/**
 * List the workflow states (statuses) for a specific team.
 * Use the returned IDs with createIssue / setIssueStatus.
 *
 * @param {string} apiKey - Linear API key
 * @param {string} teamId - Team UUID
 * @returns {Promise<Array<{id: string, name: string, type: string, color: string, position: number}>|null>}
 */
export async function listTeamStates(apiKey, teamId) {
  if (!teamId) {
    console.error("[linear-api] listTeamStates: teamId is required");
    return null;
  }
  const data = await request("listTeamStates", apiKey, `
    query ListTeamStates($teamId: String!) {
      team(id: $teamId) {
        states {
          nodes { id name type color position }
        }
      }
    }
  `, { teamId });
  return data?.team?.states?.nodes ?? null;
}

// --- Issues ---

/**
 * Retrieve a single Linear issue by its UUID.
 *
 * @param {string} apiKey - Linear API key
 * @param {string} issueId - Issue UUID
 * @returns {Promise<{
 *   id: string, identifier: string, title: string, description: string|null,
 *   priority: number, url: string, dueDate: string|null,
 *   state: {id: string, name: string, type: string},
 *   assignee: {id: string, name: string, email: string}|null,
 *   labels: {nodes: Array<{id: string, name: string, color: string}>},
 *   project: {id: string, name: string}|null,
 *   team: {id: string, name: string, key: string},
 *   parent: {id: string, identifier: string, title: string}|null,
 *   createdAt: string, updatedAt: string
 * }|null>}
 */
export async function getIssue(apiKey, issueId) {
  if (!issueId) {
    console.error("[linear-api] getIssue: issueId is required");
    return null;
  }
  const data = await request("getIssue", apiKey, `
    query GetIssue($id: String!) {
      issue(id: $id) {
        id identifier title description priority url dueDate createdAt updatedAt
        state { id name type }
        assignee { id name email }
        labels { nodes { id name color } }
        project { id name }
        team { id name key }
        parent { id identifier title }
      }
    }
  `, { id: issueId });
  return data?.issue ?? null;
}

/**
 * Create a new issue in a Linear team.
 *
 * @param {string} apiKey - Linear API key
 * @param {string} teamId - Team UUID to create the issue in
 * @param {string} title - Issue title
 * @param {object} [options={}]
 * @param {string} [options.description] - Issue description (Markdown supported)
 * @param {number} [options.priority] - 0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low
 * @param {string} [options.assigneeId] - User UUID to assign the issue to
 * @param {string[]} [options.labelIds] - Array of label UUIDs to attach
 * @param {string} [options.stateId] - Workflow state UUID
 * @param {string} [options.dueDate] - ISO 8601 date string (YYYY-MM-DD)
 * @param {string} [options.projectId] - Project UUID to associate the issue with
 * @param {string} [options.parentId] - Parent issue UUID (creates a sub-issue)
 * @returns {Promise<{id: string, identifier: string, title: string, url: string, priority: number, state: {name: string}}|null>}
 */
export async function createIssue(apiKey, teamId, title, options = {}) {
  if (!teamId || !title) {
    console.error("[linear-api] createIssue: teamId and title are required");
    return null;
  }

  const { description, priority, assigneeId, labelIds, stateId, dueDate, projectId, parentId } = options;

  const input = { teamId, title };
  if (description !== undefined) input.description = description;
  if (priority !== undefined) input.priority = priority;
  if (assigneeId) input.assigneeId = assigneeId;
  if (labelIds && labelIds.length > 0) input.labelIds = labelIds;
  if (stateId) input.stateId = stateId;
  if (dueDate) input.dueDate = dueDate;
  if (projectId) input.projectId = projectId;
  if (parentId) input.parentId = parentId;

  const data = await request("createIssue", apiKey, `
    mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier title url priority state { name } }
      }
    }
  `, { input });

  if (!data?.issueCreate?.success) {
    console.error("[linear-api] createIssue: mutation returned success=false");
    return null;
  }
  return data.issueCreate.issue ?? null;
}

/**
 * Update fields on an existing Linear issue.
 * Only the provided fields in updates are changed; all other fields are left intact.
 *
 * @param {string} apiKey - Linear API key
 * @param {string} issueId - Issue UUID
 * @param {object} updates - Fields to update (at least one required)
 * @param {string} [updates.title] - New issue title
 * @param {string} [updates.description] - New description (Markdown)
 * @param {string} [updates.stateId] - New workflow state UUID
 * @param {string|null} [updates.assigneeId] - New assignee UUID, or null to unassign
 * @param {number} [updates.priority] - New priority (0–4)
 * @param {string|null} [updates.dueDate] - New due date (YYYY-MM-DD), or null to clear
 * @param {string[]} [updates.labelIds] - Replace label set with these UUIDs
 * @param {string|null} [updates.projectId] - Move to a different project, or null to remove
 * @returns {Promise<{id: string, identifier: string, title: string, url: string, priority: number,
 *   dueDate: string|null, state: {name: string}, assignee: {name: string, email: string}|null}|null>}
 */
export async function updateIssue(apiKey, issueId, updates) {
  if (!issueId || !updates || Object.keys(updates).length === 0) {
    console.error("[linear-api] updateIssue: issueId and a non-empty updates object are required");
    return null;
  }

  const data = await request("updateIssue", apiKey, `
    mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
        issue {
          id identifier title url priority dueDate
          state { name }
          assignee { name email }
        }
      }
    }
  `, { id: issueId, input: updates });

  if (!data?.issueUpdate?.success) {
    console.error("[linear-api] updateIssue: mutation returned success=false");
    return null;
  }
  return data.issueUpdate.issue ?? null;
}

/**
 * Set the workflow status of an issue.
 * Convenience wrapper around updateIssue. Use listTeamStates to get valid state IDs.
 *
 * @param {string} apiKey - Linear API key
 * @param {string} issueId - Issue UUID
 * @param {string} stateId - Workflow state UUID
 * @returns {Promise<object|null>} Updated issue or null on error
 */
export async function setIssueStatus(apiKey, issueId, stateId) {
  return updateIssue(apiKey, issueId, { stateId });
}

/**
 * Set or clear the assignee of an issue.
 *
 * @param {string} apiKey - Linear API key
 * @param {string} issueId - Issue UUID
 * @param {string|null} assigneeId - User UUID, or null to unassign
 * @returns {Promise<object|null>} Updated issue or null on error
 */
export async function setIssueAssignee(apiKey, issueId, assigneeId) {
  return updateIssue(apiKey, issueId, { assigneeId });
}

/**
 * Set the priority of an issue.
 *
 * @param {string} apiKey - Linear API key
 * @param {string} issueId - Issue UUID
 * @param {0|1|2|3|4} priority - 0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low
 * @returns {Promise<object|null>} Updated issue or null on error
 */
export async function setIssuePriority(apiKey, issueId, priority) {
  return updateIssue(apiKey, issueId, { priority });
}

// --- Search ---

/**
 * Search issues by keyword across the workspace (or within a single team).
 *
 * @param {string} apiKey - Linear API key
 * @param {string} term - Full-text search term (matched against title and description)
 * @param {object} [options={}]
 * @param {number} [options.first=25] - Maximum number of results (1–250)
 * @param {object} [options.filter] - Linear GraphQL IssueFilter (e.g. {team: {key: {eq: "ENG"}}})
 * @returns {Promise<Array<{id: string, identifier: string, title: string, priority: number, url: string,
 *   createdAt: string, updatedAt: string, state: {name: string, type: string},
 *   assignee: {name: string, email: string}|null, team: {key: string, name: string}}>|null>}
 */
export async function searchIssues(apiKey, term, options = {}) {
  if (!term) {
    console.error("[linear-api] searchIssues: term is required");
    return null;
  }

  const { first = 25, filter } = options;
  const vars = { term, first: Math.min(first, 250) };
  if (filter) vars.filter = filter;

  const data = await request("searchIssues", apiKey, `
    query SearchIssues($term: String!, $first: Int!, $filter: IssueFilter) {
      issueSearch(query: $term, first: $first, filter: $filter) {
        nodes {
          id identifier title priority url createdAt updatedAt
          state { name type }
          assignee { name email }
          team { key name }
        }
      }
    }
  `, vars);

  return data?.issueSearch?.nodes ?? null;
}

// --- Comments ---

/**
 * Add a comment to an existing Linear issue.
 *
 * @param {string} apiKey - Linear API key
 * @param {string} issueId - Issue UUID
 * @param {string} body - Comment body (Markdown supported)
 * @returns {Promise<{id: string, body: string, createdAt: string, user: {name: string, email: string}}|null>}
 */
export async function createComment(apiKey, issueId, body) {
  if (!issueId || !body) {
    console.error("[linear-api] createComment: issueId and body are required");
    return null;
  }

  const data = await request("createComment", apiKey, `
    mutation CreateComment($input: CommentCreateInput!) {
      commentCreate(input: $input) {
        success
        comment { id body createdAt user { name email } }
      }
    }
  `, { input: { issueId, body } });

  if (!data?.commentCreate?.success) {
    console.error("[linear-api] createComment: mutation returned success=false");
    return null;
  }
  return data.commentCreate.comment ?? null;
}

// --- Projects ---

/**
 * List projects associated with a Linear team.
 *
 * @param {string} apiKey - Linear API key
 * @param {string} teamId - Team UUID
 * @returns {Promise<Array<{id: string, name: string, state: string, progress: number,
 *   description: string|null, startDate: string|null, targetDate: string|null}>|null>}
 */
export async function listProjects(apiKey, teamId) {
  if (!teamId) {
    console.error("[linear-api] listProjects: teamId is required");
    return null;
  }

  const data = await request("listProjects", apiKey, `
    query ListProjects($teamId: String!) {
      team(id: $teamId) {
        projects {
          nodes { id name state progress description startDate targetDate }
        }
      }
    }
  `, { teamId });

  return data?.team?.projects?.nodes ?? null;
}

// --- Labels ---

/**
 * List all labels for a team.
 *
 * @param {string} apiKey - Linear API key
 * @param {string} teamId - Team UUID
 * @returns {Promise<Array<{id: string, name: string, color: string, description: string|null}>|null>}
 */
export async function listLabels(apiKey, teamId) {
  if (!teamId) {
    console.error("[linear-api] listLabels: teamId is required");
    return null;
  }

  const data = await request("listLabels", apiKey, `
    query ListLabels($teamId: String!) {
      issueLabels(filter: { team: { id: { eq: $teamId } } }) {
        nodes { id name color description }
      }
    }
  `, { teamId });

  return data?.issueLabels?.nodes ?? null;
}

/**
 * Add one or more labels to an issue, merging with existing labels.
 * Fetches the current label set and performs a union to avoid duplicates.
 *
 * @param {string} apiKey - Linear API key
 * @param {string} issueId - Issue UUID
 * @param {string[]} labelIds - Label UUIDs to add
 * @returns {Promise<object|null>} Updated issue or null on error
 */
export async function addLabels(apiKey, issueId, labelIds) {
  if (!issueId || !labelIds || labelIds.length === 0) {
    console.error("[linear-api] addLabels: issueId and at least one labelId are required");
    return null;
  }

  const issue = await getIssue(apiKey, issueId);
  if (!issue) return null;

  const existing = (issue.labels?.nodes ?? []).map((l) => l.id);
  const merged = [...new Set([...existing, ...labelIds])];

  return updateIssue(apiKey, issueId, { labelIds: merged });
}

/**
 * Remove one or more labels from an issue.
 * Fetches the current label set and filters out the specified IDs.
 *
 * @param {string} apiKey - Linear API key
 * @param {string} issueId - Issue UUID
 * @param {string[]} labelIds - Label UUIDs to remove
 * @returns {Promise<object|null>} Updated issue or null on error
 */
export async function removeLabels(apiKey, issueId, labelIds) {
  if (!issueId || !labelIds || labelIds.length === 0) {
    console.error("[linear-api] removeLabels: issueId and at least one labelId are required");
    return null;
  }

  const issue = await getIssue(apiKey, issueId);
  if (!issue) return null;

  const toRemove = new Set(labelIds);
  const remaining = (issue.labels?.nodes ?? []).map((l) => l.id).filter((id) => !toRemove.has(id));

  return updateIssue(apiKey, issueId, { labelIds: remaining });
}

// --- Webhooks ---

/**
 * Verify a Linear webhook request and parse its payload.
 * Linear signs each delivery with HMAC-SHA256 over the raw body,
 * sending the hex digest in the `linear-signature` header.
 *
 * Uses Web Crypto API — no Node.js imports required.
 *
 * @param {string} rawBody - Raw request body string (before any JSON.parse)
 * @param {string} signature - Value of the `linear-signature` header
 * @param {string} webhookSecret - Webhook signing secret from Linear settings (LINEAR_WEBHOOK_SECRET)
 * @returns {Promise<{valid: boolean, payload?: object, error?: string}>}
 *   On success: { valid: true, payload: <parsed event object> }
 *   On failure: { valid: false, error: "<reason>" }
 */
export async function verifyWebhook(rawBody, signature, webhookSecret) {
  if (!webhookSecret || !rawBody || !signature) {
    return { valid: false, error: "secret, rawBody, and signature are all required" };
  }

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
    const computed = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (computed !== signature) {
      return { valid: false, error: "Signature mismatch" };
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { valid: false, error: "Payload is not valid JSON" };
    }

    return { valid: true, payload };
  } catch (err) {
    console.error(`[linear-api] verifyWebhook failed: ${err.message}`);
    return { valid: false, error: err.message };
  }
}
