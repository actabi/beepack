# react-email-templates

Source-code generators for production-ready [React Email](https://react.email) transactional email components. Each function returns a complete `.tsx` file string — copy it into your project's `emails/` directory and render it with the React Email CLI or your ESP's integration (Resend, Nodemailer, SendGrid, etc.).

Zero external dependencies. React Email itself is installed separately in your project.

## Templates

| Template | Generator function | File to write |
|---|---|---|
| Welcome / confirm email | `generateWelcomeEmail()` | `emails/welcome.tsx` |
| Password reset | `generatePasswordResetEmail()` | `emails/password-reset.tsx` |
| Payment receipt | `generatePaymentReceiptEmail()` | `emails/payment-receipt.tsx` |
| Team invitation | `generateTeamInvitationEmail()` | `emails/team-invitation.tsx` |
| Notification digest | `generateNotificationDigestEmail()` | `emails/notification-digest.tsx` |
| Inline CSS utilities | `generateInlineCssHelper()` | `emails/utils/inlineCss.ts` |
| Plain-text fallback | `generatePlainTextFallback()` | (string for ESP `text` field) |

## Setup

### 1. Install React Email in your project

```bash
npm install react-email @react-email/components
```

### 2. Add an `emails/` directory

```bash
mkdir -p emails
```

### 3. Generate and write template files

```js
import { writeFileSync, mkdirSync } from "fs";
import {
  generateWelcomeEmail,
  generatePasswordResetEmail,
  generatePaymentReceiptEmail,
  generateTeamInvitationEmail,
  generateNotificationDigestEmail,
  generateInlineCssHelper,
} from "./packages/react-email-templates/index.js";

const opts = {
  appName: "Acme",
  appUrl: "https://acme.com",
  supportEmail: "support@acme.com",
  primaryColor: "#7c3aed",
};

mkdirSync("emails/utils", { recursive: true });

writeFileSync("emails/welcome.tsx",             generateWelcomeEmail(opts));
writeFileSync("emails/password-reset.tsx",      generatePasswordResetEmail({ ...opts, expiryMinutes: 30 }));
writeFileSync("emails/payment-receipt.tsx",     generatePaymentReceiptEmail({ ...opts, currency: "USD" }));
writeFileSync("emails/team-invitation.tsx",     generateTeamInvitationEmail({ ...opts, expiryDays: 7 }));
writeFileSync("emails/notification-digest.tsx", generateNotificationDigestEmail({ ...opts, digestPeriod: "weekly" }));
writeFileSync("emails/utils/inlineCss.ts",      generateInlineCssHelper());
```

### 4. Preview templates with the React Email dev server

```bash
npx react-email dev
```

Open http://localhost:3000 to see all templates with live preview.

## Usage

### Render and send with Resend

```ts
import { render } from "@react-email/render";
import WelcomeEmail from "./emails/welcome";
import {
  generatePlainTextFallback,
} from "./packages/react-email-templates/index.js";

const html = render(<WelcomeEmail userName="Alex" confirmUrl="https://acme.com/confirm?token=abc" />);
const text = generatePlainTextFallback("welcome", {
  appName: "Acme",
  userName: "Alex",
  confirmUrl: "https://acme.com/confirm?token=abc",
});

await resend.emails.send({
  from: "Acme <noreply@acme.com>",
  to: "alex@example.com",
  subject: "Confirm your Acme account",
  html,
  text,
});
```

### Render and send with Nodemailer

```ts
import { render } from "@react-email/render";
import PasswordResetEmail from "./emails/password-reset";

const html = render(
  <PasswordResetEmail
    userName="Jordan"
    resetUrl="https://acme.com/reset?token=xyz"
  />
);

await transporter.sendMail({
  from: '"Acme" <noreply@acme.com>',
  to: "jordan@example.com",
  subject: "Reset your Acme password",
  html,
  text: generatePlainTextFallback("password-reset", {
    appName: "Acme",
    userName: "Jordan",
    resetUrl: "https://acme.com/reset?token=xyz",
  }),
});
```

### Payment receipt with line items

```tsx
import PaymentReceiptEmail from "./emails/payment-receipt";

const html = render(
  <PaymentReceiptEmail
    customerName="Sam Lee"
    receiptNumber="REC-2026-0099"
    receiptDate="April 8, 2026"
    items={[
      { description: "Pro Plan — Monthly", quantity: 1, unitPrice: 2900 },
      { description: "Extra seat", quantity: 2, unitPrice: 500 },
    ]}
    taxCents={435}
    currency="USD"
    last4="4242"
    receiptUrl="https://acme.com/receipts/REC-2026-0099"
  />
);
```

### Team invitation

```tsx
import TeamInvitationEmail from "./emails/team-invitation";

const html = render(
  <TeamInvitationEmail
    inviteeName="Morgan"
    inviterName="Casey"
    inviterEmail="casey@acme.com"
    teamName="Acme Engineering"
    teamRole="Developer"
    inviteUrl="https://acme.com/invite?token=abc123"
  />
);
```

### Notification digest

```tsx
import NotificationDigestEmail from "./emails/notification-digest";

const html = render(
  <NotificationDigestEmail
    userName="Alex"
    digestPeriodLabel="Weekly"
    notifications={[
      {
        type: "Comment",
        icon: "💬",
        title: "Sam left a comment on your post",
        description: '"Nice write-up!"',
        timestamp: new Date().toISOString(),
        actionUrl: "https://acme.com/posts/1#comment-5",
        actionLabel: "View comment →",
      },
      {
        type: "Mention",
        icon: "@",
        title: "You were mentioned in #general",
        timestamp: new Date().toISOString(),
        actionUrl: "https://acme.com/channels/general",
      },
    ]}
    dashboardUrl="https://acme.com/dashboard"
    unsubscribeUrl="https://acme.com/settings/notifications"
  />
);
```

### Inline CSS utilities

```ts
import { mergeStyles, px, margin, padding, border } from "./emails/utils/inlineCss";

const style = mergeStyles(
  { fontSize: px(16), color: "#374151" },
  isError && { color: "#dc2626" }
);
// { fontSize: "16px", color: "#dc2626" }
```

### Plain-text fallback for any template

```js
import { generatePlainTextFallback } from "./packages/react-email-templates/index.js";

const text = generatePlainTextFallback("notification-digest", {
  appName: "Acme",
  userName: "Alex",
  digestPeriodLabel: "Weekly",
  notifications: [
    {
      type: "Comment",
      icon: "💬",
      title: "Sam left a comment",
      actionUrl: "https://acme.com/posts/1",
      actionLabel: "View",
      timestamp: new Date().toISOString(),
    },
  ],
  dashboardUrl: "https://acme.com/dashboard",
  unsubscribeUrl: "https://acme.com/settings/notifications",
});
```

## Generator Options

All generator functions accept an options object. All fields are optional.

### Common options (all templates)

| Option | Type | Default | Description |
|---|---|---|---|
| `appName` | `string` | `"MyApp"` | Your application name, used in headings and footer |
| `appUrl` | `string` | `"https://example.com"` | Base URL for links |
| `supportEmail` | `string` | `"support@example.com"` | Support address shown in footer |
| `primaryColor` | `string` | `"#6366f1"` | Brand accent color (hex) used for buttons and links |

### `generateWelcomeEmail(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `logoUrl` | `string` | `""` | If provided, renders an `<Img>` instead of a text logo |

### `generatePasswordResetEmail(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `expiryMinutes` | `number` | `60` | Token lifetime shown in the email copy |

### `generatePaymentReceiptEmail(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `currency` | `string` | `"USD"` | ISO 4217 currency code used in `Intl.NumberFormat` |

### `generateTeamInvitationEmail(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `expiryDays` | `number` | `7` | Invite link validity period shown in the email copy |

### `generateNotificationDigestEmail(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `digestPeriod` | `string` | `"weekly"` | `"daily"` \| `"weekly"` \| `"monthly"` — used in subject and heading |

### `generatePlainTextFallback(templateType, props)`

| `templateType` | Props accepted |
|---|---|
| `"welcome"` | `appName`, `userName`, `confirmUrl` |
| `"password-reset"` | `appName`, `userName`, `resetUrl`, `expiryMinutes` |
| `"payment-receipt"` | `appName`, `customerName`, `receiptNumber`, `receiptDate`, `items`, `taxCents`, `currency`, `receiptUrl` |
| `"team-invitation"` | `appName`, `inviteeName`, `inviterName`, `teamName`, `teamRole`, `inviteUrl`, `expiryDays` |
| `"notification-digest"` | `appName`, `userName`, `notifications`, `digestPeriodLabel`, `dashboardUrl`, `unsubscribeUrl` |

Returns `null` and logs to `console.error` for unknown template types.

## Edge Cases Handled

- **Returns `null` on errors** — all generator functions catch exceptions and return `null` rather than throwing. Check the return value before calling `writeFileSync`.
- **`console.error` prefix** — all errors are logged as `[react-email-templates] ...` for easy filtering.
- **Empty notification list** — the digest template renders a clean "no updates" empty state rather than an empty list.
- **Missing optional props** — all component props have sensible defaults; `PreviewProps` are set on each component for the React Email dev server.
- **Currency formatting** — the receipt template uses `Intl.NumberFormat` with the `currency` option, so amounts display correctly for any ISO 4217 code.
- **Timestamp formatting** — the digest template wraps `new Date()` parsing in a try/catch so malformed timestamps don't crash the render.
- **Logo vs text** — the welcome template falls back to a styled text logo when no `logoUrl` is provided, avoiding broken image placeholders.
