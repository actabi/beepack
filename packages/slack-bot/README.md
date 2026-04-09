# Slack Bot

Zero-dependency Slack Web API client. Send messages, manage channels, DMs, reactions, and user lookups.

## Prerequisites

- Node.js >= 18
- Slack Bot Token (xoxb-...)

## Environment Variables

| Variable | Description |
|----------|-------------|
| \`SLACK_BOT_TOKEN\` | Slack bot OAuth token |

## Usage

### Send a Message

\`\`\`js
import { sendMessage } from './index.js';

const { ts } = await sendMessage(process.env.SLACK_BOT_TOKEN, "#general", "Hello team!");
\`\`\`

### Send with Block Kit

\`\`\`js
await sendMessage(token, channel, "Deploy complete", {
  blocks: [
    { type: "section", text: { type: "mrkdwn", text: "*Deploy v2.1.0* completed :white_check_mark:" } },
    { type: "divider" },
    { type: "section", text: { type: "mrkdwn", text: "Commit: \`abc123\`\nEnv: production" } },
  ]
});
\`\`\`

### Direct Message

\`\`\`js
import { sendDM } from './index.js';
await sendDM(token, "U0123456", "Your deploy finished!");
\`\`\`

### Find User by Email

\`\`\`js
import { lookupUserByEmail } from './index.js';
const user = await lookupUserByEmail(token, "alice@company.com");
\`\`\`

## Source

Based on [slackapi/bolt-js](https://github.com/slackapi/bolt-js) by **Slack** — 2,899+ stars on GitHub.