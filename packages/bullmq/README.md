# bullmq

> **BullMQ** — [taskforcesh/bullmq](https://github.com/taskforcesh/bullmq) | 8,699 stars | MIT license

Message queue and batch processing for Node.js based on Redis. Background jobs, rate limiting, scheduling, and retries.

This beepack package provides integration helpers and references the official [taskforcesh/bullmq](https://github.com/taskforcesh/bullmq) repository.

## Installation

For production use, install the official package:

```bash
# See https://github.com/taskforcesh/bullmq for the latest install instructions
npm install bullmq
```

For beepack usage:

```bash
beepack install bullmq
```

## Environment Variables

```bash
REDIS_URL=your-value-here
```

## Capabilities

- **Job Queues**
- **Delayed Jobs**
- **Rate Limiting**
- **Job Scheduling**
- **Retries**
- **Concurrency Control**

## Usage

```js
import { getSetupGuide } from "./index.js";
console.log(getSetupGuide());
```

For full API documentation and examples, visit [taskforcesh/bullmq](https://github.com/taskforcesh/bullmq).

## Links

- **Repository:** [taskforcesh/bullmq](https://github.com/taskforcesh/bullmq)
- **License:** MIT
- **Stars:** 8,699
