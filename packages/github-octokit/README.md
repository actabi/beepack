# GitHub API (Octokit)

Zero-dependency GitHub REST API client. Manage repos, issues, PRs, and trigger workflows.

## Prerequisites

- Node.js >= 18
- GitHub Personal Access Token or fine-grained token

## Environment Variables

| Variable | Description |
|----------|-------------|
| \`GITHUB_TOKEN\` | GitHub PAT |

## Usage

### Get Repo Info

\`\`\`js
import { getRepo } from './index.js';
const repo = await getRepo(process.env.GITHUB_TOKEN, "vercel", "next.js");
console.log(repo.stargazers_count);
\`\`\`

### Create an Issue

\`\`\`js
import { createIssue } from './index.js';
await createIssue(token, "myorg", "myrepo", {
  title: "Bug: login fails on Safari",
  body: "Steps to reproduce...",
  labels: ["bug"]
});
\`\`\`

### Trigger a Workflow

\`\`\`js
import { triggerWorkflow } from './index.js';
await triggerWorkflow(token, "myorg", "myrepo", "deploy.yml", "main", { environment: "production" });
\`\`\`

## Source

Based on [octokit/octokit.js](https://github.com/octokit/octokit.js) by **Octokit** — 7,734+ stars on GitHub.