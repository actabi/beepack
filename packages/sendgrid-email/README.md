# SendGrid Email

Zero-dependency SendGrid v3 API client. Send transactional emails, use dynamic templates, bulk send, and manage marketing contacts.

## Prerequisites

- Node.js >= 18
- SendGrid account and API key

## Environment Variables

| Variable | Description |
|----------|-------------|
| \`SENDGRID_API_KEY\` | SendGrid API key |

## Usage

### Send Simple Email

\`\`\`js
import { sendEmail } from './index.js';

await sendEmail(process.env.SENDGRID_API_KEY, {
  to: "user@example.com",
  from: "noreply@myapp.com",
  subject: "Welcome!",
  html: "<h1>Welcome aboard!</h1>"
});
\`\`\`

### Dynamic Template

\`\`\`js
await sendEmail(process.env.SENDGRID_API_KEY, {
  to: "user@example.com",
  from: "noreply@myapp.com",
  templateId: "d-xxxxxxxxxxxx",
  dynamicData: { name: "Alice", order_id: "12345" }
});
\`\`\`

### Bulk Send

\`\`\`js
import { sendBulk } from './index.js';

await sendBulk(process.env.SENDGRID_API_KEY, {
  from: "noreply@myapp.com",
  templateId: "d-xxxxxxxxxxxx",
  recipients: [
    { email: "alice@example.com", data: { name: "Alice" } },
    { email: "bob@example.com", data: { name: "Bob" } },
  ]
});
\`\`\`

## Source

Based on [sendgrid-nodejs](https://github.com/sendgrid/sendgrid-nodejs) (3k+ stars).