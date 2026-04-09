# inngest-js

> **Inngest** — [inngest/inngest-js](https://github.com/inngest/inngest-js) | 912 stars | GPL-3.0 license

Developer platform for building reliable workflows with zero infrastructure. Serverless alternative to BullMQ, no Redis needed.

This beepack package provides integration helpers and references the official [inngest/inngest-js](https://github.com/inngest/inngest-js) repository.

## Installation

For production use, install the official package:

```bash
# See https://github.com/inngest/inngest-js for the latest install instructions
npm install inngest-js
```

For beepack usage:

```bash
beepack install inngest-js
```

## Environment Variables

```bash
INNGEST_EVENT_KEY=your-value-here
INNGEST_SIGNING_KEY=your-value-here
```

## Capabilities

- **Event Driven Functions**
- **Scheduled Tasks**
- **Step Functions**
- **Retry Logic**
- **Fan Out**
- **Throttling**

## Usage

```js
import { getSetupGuide } from "./index.js";
console.log(getSetupGuide());
```

For full API documentation and examples, visit [inngest/inngest-js](https://github.com/inngest/inngest-js).

## Links

- **Repository:** [inngest/inngest-js](https://github.com/inngest/inngest-js)
- **License:** GPL-3.0
- **Stars:** 912
