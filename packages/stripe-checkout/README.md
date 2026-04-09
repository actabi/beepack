# stripe-checkout

Create Stripe Checkout sessions, verify webhook signatures, and manage subscriptions. Zero dependencies — uses native `fetch` and Web Crypto API.

Handles the hard parts: webhook signature verification with timestamp tolerance, idempotent session creation, and subscription lifecycle management.

## Setup

Set these environment variables:

```bash
STRIPE_SECRET_KEY=sk_test_...    # Your Stripe secret key
STRIPE_WEBHOOK_SECRET=whsec_...  # Webhook endpoint signing secret
```

## Usage

### Create a Checkout Session

```js
import { createCheckoutSession } from "./index.js";

// One-time payment
const session = await createCheckoutSession(process.env.STRIPE_SECRET_KEY, {
  lineItems: [{ name: "Pro Plan", amount: 2999, currency: "usd" }],
  mode: "payment",
  successUrl: "https://example.com/success?session_id={CHECKOUT_SESSION_ID}",
  cancelUrl: "https://example.com/cancel",
  customerEmail: "user@example.com",
  metadata: { userId: "123" },
});

// Redirect user to session.url

// Subscription
const sub = await createCheckoutSession(process.env.STRIPE_SECRET_KEY, {
  lineItems: [{ name: "Pro Monthly", amount: 2999, interval: "month" }],
  mode: "subscription",
  successUrl: "https://example.com/success",
  cancelUrl: "https://example.com/cancel",
});
```

### Verify Webhook Signature

```js
import { verifyWebhookSignature } from "./index.js";

// In your webhook handler (Express example)
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const result = await verifyWebhookSignature(
    req.body.toString(),
    req.headers["stripe-signature"],
    process.env.STRIPE_WEBHOOK_SECRET
  );

  if (!result.valid) {
    return res.status(400).json({ error: result.error });
  }

  const event = result.event;
  switch (event.type) {
    case "checkout.session.completed":
      // Fulfill the order
      break;
    case "invoice.payment_failed":
      // Notify the customer
      break;
  }

  res.json({ received: true });
});
```

### Manage Subscriptions

```js
import { getCustomerSubscriptions, cancelSubscription } from "./index.js";

const subs = await getCustomerSubscriptions(process.env.STRIPE_SECRET_KEY, "cus_abc123");
// [{ id: "sub_...", status: "active", plan: "price_...", currentPeriodEnd: "2026-05-01T..." }]

// Cancel at period end (graceful)
await cancelSubscription(process.env.STRIPE_SECRET_KEY, "sub_abc123");

// Cancel immediately
await cancelSubscription(process.env.STRIPE_SECRET_KEY, "sub_abc123", true);
```

## Edge Cases Handled

- **Webhook replay attacks** — timestamp tolerance check (default 5 minutes)
- **Duplicate sessions** — idempotency key support
- **Signature verification** — uses Web Crypto HMAC-SHA256 (no Node.js crypto import needed)
- **Network failures** — 15s timeout, returns null instead of throwing
- **Subscription states** — handles active, past_due, canceled, and cancel_at_period_end
