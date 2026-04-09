# mailgun-email

Zero-dependency wrapper for the **Mailgun** email API. Send emails, use templates, track delivery events, and validate addresses — all with native `fetch`.

## Environment Variables

| Variable | Description |
|---|---|
| `MAILGUN_API_KEY` | Your Mailgun API key |
| `MAILGUN_DOMAIN` | Your verified Mailgun sending domain |

## Installation

```bash
bee add mailgun-email
```

## Usage

```js
import { sendEmail, sendTemplateEmail, getMessageEvents, validateEmail } from 'mailgun-email';

// Send a plain email
const result = await sendEmail({
  from: 'hello@example.com',
  to: 'user@example.com',
  subject: 'Welcome!',
  text: 'Thanks for signing up.',
});

// Send using a stored template
await sendTemplateEmail({
  from: 'hello@example.com',
  to: 'user@example.com',
  subject: 'Your invoice',
  template: 'invoice',
  variables: { amount: '$42.00' },
});

// Fetch recent delivery events
const events = await getMessageEvents({ event: 'delivered', limit: '25' });

// Validate an email address
const validation = await validateEmail('someone@example.com');
```

## API

### `sendEmail(message, opts?)` — Send a plain text or HTML email.
### `sendTemplateEmail(params, opts?)` — Send an email using a stored Mailgun template.
### `getMessageEvents(query?, opts?)` — Retrieve message events (delivered, opened, bounced, etc.).
### `validateEmail(address, opts?)` — Validate an email address.

All functions return the parsed JSON response or `null` on failure.

## License

MIT
