# svix-webhooks

> **Svix Webhooks** — [svix/svix-webhooks](https://github.com/svix/svix-webhooks) | 3,156 stars | MIT license

Enterprise-ready webhooks service. Send, receive, and verify webhooks with automatic retries and signature verification.

This beepack package provides integration helpers and references the official [svix/svix-webhooks](https://github.com/svix/svix-webhooks) repository.

## Installation

For production use, install the official package:

```bash
# See https://github.com/svix/svix-webhooks for the latest install instructions
npm install svix-webhooks
```

For beepack usage:

```bash
beepack install svix-webhooks
```

## Environment Variables

```bash
SVIX_API_KEY=your-value-here
```

## Capabilities

- **Send Webhooks**
- **Receive Webhooks**
- **Verify Signatures**
- **Automatic Retries**
- **Event Types**
- **Endpoint Management**

## Usage

```js
import { getSetupGuide } from "./index.js";
console.log(getSetupGuide());
```

For full API documentation and examples, visit [svix/svix-webhooks](https://github.com/svix/svix-webhooks).

## Links

- **Repository:** [svix/svix-webhooks](https://github.com/svix/svix-webhooks)
- **License:** MIT
- **Stars:** 3,156
