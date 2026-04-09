# stripe-node

> **Stripe Node.js SDK** — [stripe/stripe-node](https://github.com/stripe/stripe-node) | 4,384 stars | MIT license

Official Node.js library for the Stripe API. TypeScript native, full API coverage for payments, subscriptions, invoices, and more.

This beepack package provides integration helpers and references the official [stripe/stripe-node](https://github.com/stripe/stripe-node) repository.

## Installation

For production use, install the official package:

```bash
# See https://github.com/stripe/stripe-node for the latest install instructions
npm install stripe-node
```

For beepack usage:

```bash
beepack install stripe-node
```

## Environment Variables

```bash
STRIPE_SECRET_KEY=your-value-here
STRIPE_WEBHOOK_SECRET=your-value-here
```

## Capabilities

- **Create Payment Intent**
- **Create Checkout Session**
- **Manage Subscriptions**
- **Handle Webhooks**
- **Create Customers**

## Usage

```js
import { getSetupGuide } from "./index.js";
console.log(getSetupGuide());
```

For full API documentation and examples, visit [stripe/stripe-node](https://github.com/stripe/stripe-node).

## Links

- **Repository:** [stripe/stripe-node](https://github.com/stripe/stripe-node)
- **License:** MIT
- **Stars:** 4,384
