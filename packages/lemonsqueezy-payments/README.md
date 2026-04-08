# lemonsqueezy-payments

LemonSqueezy billing for SaaS: checkout URL generation, webhook validation and routing, subscription sync, plan changes with proration, and customer portal redirects. Zero dependencies — native fetch and Web Crypto only.

## Setup

Add these environment variables:

```bash
LEMONSQUEEZY_API_KEY=your_api_key         # LemonSqueezy dashboard -> API -> Keys
LEMONSQUEEZY_STORE_ID=12345               # LemonSqueezy dashboard -> Settings -> Store
LEMONSQUEEZY_WEBHOOK_SECRET=whsec_...     # Set when creating a webhook in the dashboard
```

Point your webhook endpoint to `https://yourapp.com/webhooks/lemonsqueezy` in the LemonSqueezy dashboard and enable the events you want to handle.

## Usage

### Generate a Checkout URL

```js
import { createCheckout } from "./index.js";

const checkout = await createCheckout({
  apiKey: process.env.LEMONSQUEEZY_API_KEY,
  storeId: process.env.LEMONSQUEEZY_STORE_ID,
  variantId: "98765",                        // Your plan's variant ID
  checkoutData: {
    email: "user@example.com",
    name: "Jane Doe",
    custom: { userId: "usr_abc123" },        // Returned in webhook meta.custom_data
  },
  productOptions: {
    redirectUrl: "https://yourapp.com/dashboard",
  },
});
// { id: "chk_...", url: "https://checkout.lemonsqueezy.com/...", expiresAt: null }

// Redirect the user:
// res.redirect(checkout.url);
```

### Validate and Route Webhooks

```js
import { validateWebhook, routeWebhookEvent } from "./index.js";

// Express example
app.post("/webhooks/lemonsqueezy", express.raw({ type: "application/json" }), async (req, res) => {
  const rawBody = req.body.toString("utf8");
  const signature = req.headers["x-signature"];

  const valid = await validateWebhook({
    secret: process.env.LEMONSQUEEZY_WEBHOOK_SECRET,
    rawBody,
    signature,
  });

  if (!valid) return res.status(401).json({ error: "Invalid signature" });

  await routeWebhookEvent(rawBody, {
    onOrderCreated: async (data) => {
      console.log("New order:", data.id);
    },
    onSubscriptionCreated: async (data) => {
      const attrs = data.attributes;
      await db.subscriptions.upsert({
        lsSubscriptionId: data.id,
        userId: attrs.custom_data?.userId,
        status: attrs.status,
        variantId: String(attrs.variant_id),
        renewsAt: attrs.renews_at,
      });
    },
    onSubscriptionUpdated: async (data) => {
      await db.subscriptions.update({ lsSubscriptionId: data.id }, {
        status: data.attributes.status,
        variantId: String(data.attributes.variant_id),
        renewsAt: data.attributes.renews_at,
      });
    },
    onSubscriptionCancelled: async (data) => {
      await db.subscriptions.update({ lsSubscriptionId: data.id }, {
        status: "cancelled",
        endsAt: data.attributes.ends_at,
      });
    },
    onSubscriptionPaymentFailed: async (data) => {
      await notifyUserOfFailedPayment(data.attributes.user_email);
    },
  });

  res.json({ received: true });
});
```

### Sync Subscription Status

```js
import { getSubscription } from "./index.js";

const sub = await getSubscription(process.env.LEMONSQUEEZY_API_KEY, "sub_12345");
// {
//   id: "sub_12345",
//   status: "active",          // active | paused | past_due | unpaid | cancelled | expired | on_trial
//   productId: "...",
//   variantId: "...",
//   cardBrand: "visa",
//   cardLastFour: "4242",
//   cancelled: false,
//   trialEndsAt: null,
//   renewsAt: "2026-05-08T00:00:00.000Z",
//   endsAt: null,
//   ...
// }
```

### Customer Portal (Update Payment / Cancel)

```js
import { getCustomerPortalUrl } from "./index.js";

const portal = await getCustomerPortalUrl(process.env.LEMONSQUEEZY_API_KEY, "sub_12345");
// { url: "https://app.lemonsqueezy.com/billing?..." }

// Redirect the user to manage their subscription:
// res.redirect(portal.url);
```

### Change Plan (with Proration)

```js
import { changePlan } from "./index.js";

// Upgrade immediately — LemonSqueezy charges the prorated difference now
const updated = await changePlan({
  apiKey: process.env.LEMONSQUEEZY_API_KEY,
  subscriptionId: "sub_12345",
  variantId: "99999",            // New plan's variant ID
});
// { id: "sub_12345", status: "active", variantId: "99999", renewsAt: "..." }

// Downgrade at renewal — no immediate charge
const deferred = await changePlan({
  apiKey: process.env.LEMONSQUEEZY_API_KEY,
  subscriptionId: "sub_12345",
  variantId: "88888",
  disableProrations: true,
});
```

### Pause and Resume

```js
import { pauseOrResumeSubscription } from "./index.js";

// Pause — revoke access, no further charges
await pauseOrResumeSubscription({
  apiKey: process.env.LEMONSQUEEZY_API_KEY,
  subscriptionId: "sub_12345",
  pause: { mode: "void" },
});

// Resume
await pauseOrResumeSubscription({
  apiKey: process.env.LEMONSQUEEZY_API_KEY,
  subscriptionId: "sub_12345",
  pause: null,
});
```

### Cancel at Period End

```js
import { cancelSubscription } from "./index.js";

const result = await cancelSubscription(process.env.LEMONSQUEEZY_API_KEY, "sub_12345");
// { id: "sub_12345", status: "cancelled", endsAt: "2026-05-08T00:00:00.000Z" }
// The user retains access until endsAt.
```

## Edge Cases Handled

- **All functions return null on error** — never throws; check for null before proceeding
- **Constant-time HMAC comparison** — prevents timing-based signature forgery
- **Undefined field stripping** — omitted checkout options are not sent to the API, avoiding validation errors
- **Proration control** — `disableProrations: true` defers plan changes to renewal, useful for downgrades
- **Unknown webhook events** — routed to `onUnknown` handler or logged and skipped, never crashes
- **15s request timeout** — all API calls use `AbortSignal.timeout` to avoid hanging
